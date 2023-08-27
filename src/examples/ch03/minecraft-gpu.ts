import shader from './shader-minecraft.wgsl';
import csNoise from './noise.wgsl';
import csTerrain from './terrain-comp.wgsl';
import { getCubeData } from '../../common/vertex-data';
import * as ws from 'webgpu-simplified';
import { mat4 } from 'gl-matrix';

let resolution = 1024;
let numVertices = resolution * resolution;

const positionOffset = 0;
const colorOffset = 4 * 4;
const vertexByteSize = 
    3 * 4 + // position: vec3<f32>
    1 * 4 + // padding f32
    3 * 4 + // color: vec3<f32>
    1 * 4 + // padding: f32
    0;

const createPipeline = async (init: ws.IWebGPUInit, data: any): Promise<ws.IPipeline> => {
    // pipeline for terrain
    let bufs: Iterable<GPUVertexBufferLayout> = [
        {
            arrayStride:  3 * 4, // cube positions
            stepMode: 'vertex',
            attributes: [
                {
                    shaderLocation: 0,
                    format: "float32x3",
                    offset: 0
                },
            ]
        },
        {
            arrayStride: vertexByteSize,
            stepMode: 'instance',
            attributes: [
                {
                    // instance position
                    shaderLocation: 1,
                    format: "float32x3",
                    offset: positionOffset,
                },
                {
                    // color
                    shaderLocation: 2,
                    format: "float32x3",
                    offset: colorOffset,
                },
            ]
        },
    ]
    const descriptor = ws.createRenderPipelineDescriptor({
        init, shader,
        buffers: bufs, 
    })
    const pipeline = await init.device.createRenderPipelineAsync(descriptor);
    
    // create vertex and index buffers for the cube
    const vertexBuffer = ws.createBufferWithData(init.device, data.positions);
    const indexBuffer = ws.createBufferWithData(init.device, data.indices);

    // uniform buffer for transform matrix
    const  vertUniformBuffer = ws.createBuffer(init.device, 64);
    const vertBindGroup = ws.createBindGroup(init.device, pipeline.getBindGroupLayout(0), [vertUniformBuffer]);

    // create depth texture
   const depthTexture = ws.createDepthTexture(init);

   // create texture for MASS (count = 4)
   const msaaTexture = ws.createMultiSampleTexture(init);

    return {
        pipelines: [pipeline],
        vertexBuffers: [vertexBuffer, indexBuffer],
        uniformBuffers: [vertUniformBuffer],
        uniformBindGroups: [vertBindGroup],
        depthTextures: [depthTexture],
        gpuTextures: [msaaTexture],
    };
}

const createComputePipeline = async (device: GPUDevice): Promise<ws.IPipeline> => {    
    const csShader = csNoise.concat(csTerrain);
    const descriptor = ws.createComputePipelineDescriptor(device, csShader);
    const csPipeline = await device.createComputePipelineAsync(descriptor);

    const vertexBuffer = ws.createBuffer(device, numVertices * vertexByteSize, ws.BufferType.VertexStorage);
   
    const csParamsBufferSize = 
        1 * 4 + // resolution: f32
        1 * 4 + // octaves: f32
        1 * 4 + // persistence: f32
        1 * 4 + // lacunarity: f32
        1 * 4 + // offset_x: f32
        1 * 4 + // offset_z: f32
        1 * 4 + // scale: f32
        1 * 4 + // water_level: f32
        1 * 4 + // heightMultiplier: f32
        3 * 4 + // padding
        0;      

    const csParamsBuffer = ws.createBuffer(device, csParamsBufferSize);
    const csBindGroup = ws.createBindGroup(device, csPipeline.getBindGroupLayout(0), [vertexBuffer, csParamsBuffer]);
 
    return {
        csPipelines: [csPipeline],
        vertexBuffers: [vertexBuffer],
        uniformBuffers: [csParamsBuffer],
        uniformBindGroups: [csBindGroup],        
    };
}

const draw = (init:ws.IWebGPUInit, p:ws.IPipeline, p2:ws.IPipeline, data:any) => {  
    const commandEncoder =  init.device.createCommandEncoder();
    
     // compute pass
     {
        const csPass = commandEncoder.beginComputePass();
        csPass.setPipeline(p2.csPipelines[0]);
        csPass.setBindGroup(0, p2.uniformBindGroups[0]);
        csPass.dispatchWorkgroups(Math.ceil(resolution / 8), Math.ceil(resolution / 8));
        csPass.end();
    }

    // render pass
    {
        const descriptor = ws.createRenderPassDescriptor({
            init,
            depthView: p.depthTextures[0].createView(),
            textureView: p.gpuTextures[0].createView(),
        });
        const renderPass = commandEncoder.beginRenderPass(descriptor);

        // draw terrain
        renderPass.setPipeline(p.pipelines[0]);
        renderPass.setVertexBuffer(0, p.vertexBuffers[0]);  // vertex buffer for cube
        renderPass.setVertexBuffer(1, p2.vertexBuffers[0]); // vertex buffer for terrain
        renderPass.setBindGroup(0, p.uniformBindGroups[0]);
        renderPass.setIndexBuffer(p.vertexBuffers[1], 'uint32'); // index buffer for cube
        renderPass.drawIndexed(data.indices.length, numVertices); // num vertices in terrain
        renderPass.end();
    }
    init.device.queue.submit([commandEncoder.finish()]);
}

const run = async () => {
    const canvas = document.getElementById('canvas-webgpu') as HTMLCanvasElement;
    const deviceDescriptor: GPUDeviceDescriptor = {
        requiredLimits:{
            maxStorageBufferBindingSize: 512*1024*1024 //512MB, defaulting to 128MB
        }
    }
    const init = await ws.initWebGPU({canvas, msaaCount: 4}, deviceDescriptor);

    let data = getCubeData(); 
    const p = await createPipeline(init, data);
    let p2 = await createComputePipeline(init.device);
       
    var gui =  ws.getDatGui();
    const params = {
        resolution: 1024,
        scale: 100,
        cubeSize: 2,
        waterLevel: 0.01,
        octaves: 5,
        persistence: 0.5,
        lacunarity: 2,
        aspectRatio: 50,
        animateSpeed: 1,
    };
    
    let resolutionChanged = false;
    let dataChanged = false;
    
    var folder = gui.addFolder('Set Terrain Parameters');
    folder.open();
    folder.add(params, 'animateSpeed', 0, 5, 0.1); 
    folder.add(params, 'resolution', 128, 2048, 8).onChange(() => {
        resolutionChanged = true;
    }); 
    folder.add(params, 'cubeSize', 0.1, 5, 0.1).onChange(()=>{
        dataChanged = true;
    }); 
    folder.add(params, 'scale', 1, 200, 1); 
    folder.add(params, 'waterLevel', 0.001, 0.1, 0.01); 
    folder.add(params, 'aspectRatio', 0, 200, 1); 
    folder.add(params, 'octaves', 1, 20, 1); 
    folder.add(params, 'persistence', 0, 1, 0.01); 
    folder.add(params, 'lacunarity', 1, 10, 0.2);      
    
    let modelMatrix = mat4.create();
    let vt = ws.createViewTransform([80, 80, 100]);
    let viewMat = vt.viewMat;

    let aspect = init.size.width / init.size.height;  
    let projectMat = ws.createProjectionMat(aspect);  
    let mvpMat = ws.combineMvpMat(modelMatrix, viewMat, projectMat);
    init.device.queue.writeBuffer(p.uniformBuffers[0], 0, mvpMat as ArrayBuffer);
   
    var camera = ws.getCamera(canvas, vt.cameraOptions);
    
    let start = performance.now();
    let stats = ws.getStats();

    const frame = async () => {     
        stats.begin();

        if(resolutionChanged){
            resolution = params.resolution;
            numVertices = resolution * resolution;            
            p2 = await createComputePipeline(init.device);            
            resolutionChanged = false;
        }

        if(dataChanged){
            data = getCubeData(params.cubeSize);
            init.device.queue.writeBuffer(p.vertexBuffers[0], 0, data.positions);
            dataChanged = false;
        }

        if(camera.tick()){
            viewMat = camera.matrix;
        }
        projectMat = ws.createProjectionMat(aspect); 
        modelMatrix = ws.createModelMat([-0.47*resolution, -15, -0.5*resolution], [0, Math.PI/8, 0], [1.5, 1.5, 1.5]);
        mvpMat = ws.combineMvpMat(modelMatrix, viewMat, projectMat)
        init.device.queue.writeBuffer(p.uniformBuffers[0], 0, mvpMat as ArrayBuffer);       

        // update uniform buffer for compute pipeline   
        init.device.queue.writeBuffer(p2.uniformBuffers[0], 0, new Float32Array([
            params.resolution,
            params.octaves,
            params.persistence,
            params.lacunarity,
            0,  // offsetX
            params.animateSpeed * (performance.now() - start)/20, // offsetZ
            params.scale,
            params.waterLevel,
            params.aspectRatio,
            0, 0, 0 // padding
        ]));        
        
        draw(init, p, p2, data);      
        requestAnimationFrame(frame);
        stats.end();
    };
    frame();
}

run();