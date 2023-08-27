import shader from './shader-unlit-instance.wgsl';
import { createTerrainDataMultipleChunks } from '../../common/terrain-data';
import * as ws from 'webgpu-simplified';
import { vec2, vec3 } from 'gl-matrix';

const X_CHUNKS = 2;
const Z_CHUNKS = 2;
let data: {  
    positions: Float32Array,
    colors: Float32Array,
    colors2: Float32Array,
    indices:  Uint32Array,
    indices2: Uint32Array
}[];

let vertexBuffers:GPUBuffer[] = [];
let colorBuffers:GPUBuffer[] = [];
let indexBuffers:GPUBuffer[] = [];
let colorBuffers2:GPUBuffer[] = [];
let indexBuffers2:GPUBuffer[] = [];

const createPipeline = async (init: ws.IWebGPUInit): Promise<ws.IPipeline> => {
    // pipeline for terrain
    const descriptor = ws.createRenderPipelineDescriptor({
        init, shader,
        buffers: ws.setVertexBuffers(['float32x3', 'float32x3']), // position, color
    });
    const pipeline = await init.device.createRenderPipelineAsync(descriptor);

    // pipeline for wireframe
    const descriptor2 = ws.createRenderPipelineDescriptor({
        init, shader,
        primitiveType: 'line-list',
        buffers: ws.setVertexBuffers(['float32x3', 'float32x3']),//pos, color 
    })
    const pipeline2 = await init.device.createRenderPipelineAsync(descriptor2);

    const trans:vec2[] = new Array(X_CHUNKS * Z_CHUNKS).fill(vec2.fromValues(0,0));
    data = createTerrainDataMultipleChunks({}, X_CHUNKS, Z_CHUNKS, trans);

    let k = 0;
    for(let i = 0; i < X_CHUNKS; i++){
        for(let j = 0; j < Z_CHUNKS; j++){
            vertexBuffers.push(ws.createBufferWithData(init.device, data[k].positions));
            colorBuffers.push(ws.createBufferWithData(init.device, data[k].colors));
            indexBuffers.push(ws.createBufferWithData(init.device, data[k].indices));
            colorBuffers2.push(ws.createBufferWithData(init.device, data[k].colors2));
            indexBuffers2.push(ws.createBufferWithData(init.device, data[k].indices2));
            k++;
        }
    }

    // uniform buffer for transform matrix
    const vpUniformBuffer = ws.createBuffer(init.device, 64);
    const modelUniformBuffer = ws.createBuffer(init.device, 64 * X_CHUNKS * Z_CHUNKS, ws.BufferType.Storage);

    const vertBindGroup = ws.createBindGroup(init.device, pipeline.getBindGroupLayout(0), 
        [vpUniformBuffer, modelUniformBuffer]);
    const vertBindGroup2 = ws.createBindGroup(init.device, pipeline2.getBindGroupLayout(0), 
        [vpUniformBuffer, modelUniformBuffer]);
    
    // create depth texture
   const depthTexture = ws.createDepthTexture(init);

   // create texture view for MASS (count = 4)
   const msaaTexture = ws.createMultiSampleTexture(init);

    return {
        pipelines: [pipeline, pipeline2],
        uniformBuffers: [vpUniformBuffer, modelUniformBuffer],
        uniformBindGroups: [vertBindGroup, vertBindGroup2],
        depthTextures: [depthTexture],
        gpuTextures: [msaaTexture],
    };
}

const draw = (init:ws.IWebGPUInit, p:ws.IPipeline, plotType: string,) => {  
    const commandEncoder =  init.device.createCommandEncoder();
    const descriptor = ws.createRenderPassDescriptor({
        init,
        depthView: p.depthTextures[0].createView(),
        textureView: p.gpuTextures[0].createView(),
    });
    const renderPass = commandEncoder.beginRenderPass(descriptor);

    // draw terrain   
    function drawTerrain() { 
        renderPass.setPipeline(p.pipelines[0]);
        renderPass.setBindGroup(0, p.uniformBindGroups[0]);
        let k = 0;
        for(let i = 0; i < X_CHUNKS; i++){
            for(let j = 0; j < Z_CHUNKS; j++){
                renderPass.setVertexBuffer(0, vertexBuffers[k]);
                renderPass.setVertexBuffer(1, colorBuffers[k]);
                renderPass.setIndexBuffer(indexBuffers[k], 'uint32');
                renderPass.drawIndexed(data[k].indices.length, 1, 0, 0, k);
                k++;
            }
        }
    }

    // draw wireframe   
    function drawWireframe() { 
        renderPass.setPipeline(p.pipelines[1]);
        renderPass.setBindGroup(0, p.uniformBindGroups[1]);
        let k = 0;
        for(let i = 0; i < X_CHUNKS; i++){
            for(let j = 0; j < Z_CHUNKS; j++){
                renderPass.setVertexBuffer(0, vertexBuffers[k]);
                renderPass.setVertexBuffer(1, colorBuffers2[k]);
                renderPass.setIndexBuffer(indexBuffers2[k], 'uint32');
                renderPass.drawIndexed(data[k].indices2.length, 1, 0, 0, k);
                k++;
            }
        }
    }

    if(plotType === 'both'){
        drawTerrain();
        drawWireframe();
    } else if(plotType === 'wireframe'){
        drawWireframe();
    } else {
        drawTerrain();
    }

    renderPass.end();
    init.device.queue.submit([commandEncoder.finish()]);
}

const run = async () => {
    const canvas = document.getElementById('canvas-webgpu') as HTMLCanvasElement;
    const init = await ws.initWebGPU({canvas, msaaCount: 4});

    let p = await createPipeline(init);

    var gui = ws.getDatGui();
    const params = {
        plotType: 'terrain',
        seed: 1232,
        scale: 50,
        waterLevel: 0.15,
        levelDetail: 0,
        octaves: 5,
        persistence: 0.5,
        lacunarity: 2,
        aspectRatio: 30,
        normalizeMode: 'local',
    };
    let dataChanged = true;

    var folder = gui.addFolder('Set Terrain Parameters');
    folder.open();
    folder.add(params, 'seed', 1, 65536, 1).onChange(()=>{ dataChanged = true; }); 
    folder.add(params, 'scale', 0.3, 100, 0.1).onChange(()=>{ dataChanged = true; }); 
    folder.add(params, 'waterLevel', 0.01, 0.4, 0.01).onChange(()=>{ dataChanged = true; }); 
    folder.add(params, 'levelDetail', 0, 6, 1).onChange(()=>{ dataChanged = true; }); 
    folder.add(params, 'aspectRatio', 0, 100, 0.1).onChange(()=>{ dataChanged = true; }); 
    folder.add(params, 'octaves', 1, 20, 1).onChange(()=>{ dataChanged = true; }); 
    folder.add(params, 'persistence', 0, 1, 0.01).onChange(()=>{ dataChanged = true; }); 
    folder.add(params, 'lacunarity', 1, 10, 0.2).onChange(()=>{ dataChanged = true; }); 
    folder.add(params, 'plotType', ['terrain', 'wireframe', 'both']);
    folder.add(params, 'normalizeMode', ['local', 'global']).onChange(() => { dataChanged = true; });
    
    let modelMat = new Float32Array(16 * X_CHUNKS * Z_CHUNKS);
    let k = 0;
    let chunkSize = 240;
    let trans:any = [];
    for(let i = 0; i < X_CHUNKS; i++){
        for(let j = 0; j < Z_CHUNKS; j++){
            let xt = -0.5*X_CHUNKS*chunkSize + i*chunkSize;
            let zt = -0.5*Z_CHUNKS*chunkSize + j*chunkSize
            let translation = vec3.fromValues(xt, 5, zt);
            let m = ws.createModelMat(translation, [0, 0, 0], [1, params.aspectRatio, 1]);
            modelMat.set(m, 16*k);
            trans.push(vec2.fromValues(xt, zt))
            k++;
        }
    }
    init.device.queue.writeBuffer(p.uniformBuffers[1], 0, modelMat as ArrayBuffer);

    let vt = ws.createViewTransform([120, 120, 150]);
    let viewMat = vt.viewMat;

    let aspect = init.size.width / init.size.height;  
    let projectMat = ws.createProjectionMat(aspect);
    let vpMat = ws.combineVpMat(viewMat, projectMat);
    init.device.queue.writeBuffer(p.uniformBuffers[0], 0, vpMat as ArrayBuffer);

    var camera = ws.getCamera(canvas, vt.cameraOptions);
    
    let stats = ws.getStats();
    const frame = () => {     
        stats.begin();
        if(camera.tick()){
            viewMat = camera.matrix;
            vpMat = ws.combineVpMat(viewMat, projectMat);
            init.device.queue.writeBuffer(p.uniformBuffers[0], 0, vpMat as ArrayBuffer);
        }

        // update vertex and index buffers
        if(dataChanged){
            data = createTerrainDataMultipleChunks({
                waterLevel: params.waterLevel,
                levelDetail: params.levelDetail,
                seed: params.seed,
                scale: params.scale,
                octaves: params.octaves,
                persistence: params.persistence,
                lacunarity: params.lacunarity,
                normalizeMode: params.normalizeMode,
            }, X_CHUNKS, Z_CHUNKS, trans);
            k = 0;
            for(let i0 = 0; i0 < X_CHUNKS; i0++){
                for(let j = 0; j < Z_CHUNKS; j++){
                    init.device.queue.writeBuffer(vertexBuffers[k], 0, data[k].positions);  
                    init.device.queue.writeBuffer(colorBuffers[k], 0, data[k].colors);    
                    init.device.queue.writeBuffer(indexBuffers[k], 0, data[k].indices);  
                    init.device.queue.writeBuffer(colorBuffers2[k], 0, data[k].colors2);    
                    init.device.queue.writeBuffer(indexBuffers2[k], 0, data[k].indices2);  
                    k++;
                }
            }
        
            dataChanged = false;
        }

        draw(init, p, params.plotType);      

        requestAnimationFrame(frame);
        stats.end();
    };
    frame();
}

run();