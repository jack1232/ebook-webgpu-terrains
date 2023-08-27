import shader from '../../common/shader-unlit.wgsl';
import csNoise from './noise.wgsl';
import csIndices from './indices-comp.wgsl';
import csTerrain from './terrain-comp.wgsl';
import * as ws from 'webgpu-simplified';

let resolution = 1024;
let numVertices = resolution * resolution;
let numTriangles = 6 * (resolution - 1) * (resolution - 1);

const positionOffset = 0;
const colorOffset = 4 * 4;
const vertexByteSize = 
    3 * 4 + // position: vec3<f32>
    1 * 4 + // padding f32
    3 * 4 + // color: vec3<f32>
    1 * 4 + // padding: f32
    0;

const createPipeline = async (init: ws.IWebGPUInit): Promise<ws.IPipeline> => {
    // pipeline for terrain
    const descriptor = ws.createRenderPipelineDescriptor({
        init, shader,
        buffers: ws.setVertexBuffers(['float32x3', 'float32x3'], //pos, color
            [positionOffset, colorOffset], vertexByteSize), 
    })
    const pipeline = await init.device.createRenderPipelineAsync(descriptor);

    // uniform buffer for transform matrix
    const  vertUniformBuffer = ws.createBuffer(init.device, 64);
    const vertBindGroup = ws.createBindGroup(init.device, pipeline.getBindGroupLayout(0), [vertUniformBuffer]);

    // create depth texture
   const depthTexture = ws.createDepthTexture(init);

   // create texture for MASS (count = 4)
   const msaaTexture = ws.createMultiSampleTexture(init);

    return {
        pipelines: [pipeline],
        uniformBuffers: [vertUniformBuffer],
        uniformBindGroups: [vertBindGroup],
        depthTextures: [depthTexture],
        gpuTextures: [msaaTexture],
    };
}

const createComputeIndexPipeline = async (device: GPUDevice): Promise<ws.IPipeline> => {
    const descriptor = ws.createComputePipelineDescriptor(device, csIndices);
    const csIndexPipeline = await device.createComputePipelineAsync(descriptor);

    const indexBuffer = ws.createBuffer(device, numTriangles * 4, ws.BufferType.IndexStorage);
    const indexUniformBuffer = ws.createBuffer(device, 4);
    device.queue.writeBuffer(indexUniformBuffer, 0, Uint32Array.of(resolution));
    
    const indexBindGroup = ws.createBindGroup(device, csIndexPipeline.getBindGroupLayout(0), 
    [indexBuffer, indexUniformBuffer]); 

    const idxencoder = device.createCommandEncoder();
    const idxPass = idxencoder.beginComputePass();
    idxPass.setPipeline(csIndexPipeline);
    idxPass.setBindGroup(0, indexBindGroup);
    idxPass.dispatchWorkgroups(Math.ceil(resolution / 8), Math.ceil(resolution / 8));
    idxPass.end();
    device.queue.submit([idxencoder.finish()]);

    return {
        vertexBuffers: [indexBuffer],
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

const draw = (init:ws.IWebGPUInit, p:ws.IPipeline, p2:ws.IPipeline, p3:ws.IPipeline) => {  
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
        renderPass.setVertexBuffer(0, p2.vertexBuffers[0]);
        renderPass.setBindGroup(0, p.uniformBindGroups[0]);
        renderPass.setIndexBuffer(p3.vertexBuffers[0], 'uint32');
        renderPass.drawIndexed(numTriangles);
        renderPass.end();
    }
    init.device.queue.submit([commandEncoder.finish()]);
}

const run = async () => {
    const canvas = document.getElementById('canvas-webgpu') as HTMLCanvasElement;
    const init = await ws.initWebGPU({canvas, msaaCount: 4});

    var gui =  ws.getDatGui();
    const params = {
        resolution: 1024,
        scale: 100,
        waterLevel: 0.03,
        octaves: 5,
        persistence: 0.5,
        lacunarity: 2,
        aspectRatio: 50,
        animateSpeed: 1,
    };
    
    let resolutionChanged = false;
    
    var folder = gui.addFolder('Set Terrain Parameters');
    folder.open();
    folder.add(params, 'animateSpeed', 0, 5, 0.1); 
    folder.add(params, 'resolution', 128, 2048, 8).onChange(() => {
        resolutionChanged = true;
    }); 
    folder.add(params, 'scale', 1, 200, 1); 
    folder.add(params, 'waterLevel', 0, 0.1, 0.01); 
    folder.add(params, 'aspectRatio', 0, 200, 1); 
    folder.add(params, 'octaves', 1, 20, 1); 
    folder.add(params, 'persistence', 0, 1, 0.01); 
    folder.add(params, 'lacunarity', 1, 10, 0.2); 
     
    folder = gui.addFolder('Performance');
    folder.open();
    
    const p = await createPipeline(init);
    let p2 = await createComputePipeline(init.device);
    let p3 = await createComputeIndexPipeline(init.device);
    
    let modelMatrix = ws.createModelMat([-0.65*resolution, 50, -0.5*resolution], [0, 0, 0]);

    let vt = ws.createViewTransform([80,80,110]);
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
            numTriangles = 6 * (resolution - 1) * (resolution - 1);
            p2 = await createComputePipeline(init.device);
            p3 = await createComputeIndexPipeline(init.device);
            resolutionChanged = false;
        }

        if(camera.tick()){
            viewMat = camera.matrix;
        }
        projectMat = ws.createProjectionMat(aspect); 
        modelMatrix = ws.createModelMat([-0.65*resolution, 5, -0.5*resolution], [0, Math.PI/15, 0]);
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
        
        draw(init, p, p2, p3);      
        requestAnimationFrame(frame);
        stats.end();
    };
    frame();
}

run();