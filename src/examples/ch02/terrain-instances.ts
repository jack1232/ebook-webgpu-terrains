import shader from './shader-unlit-instance.wgsl';
import { createTerrainDataChunk } from '../../common/terrain-data';
import * as ws from 'webgpu-simplified';
import { vec3 } from 'gl-matrix';


const createPipeline = async (init: ws.IWebGPUInit, data:any, totalNumChunks:number): Promise<ws.IPipeline> => {
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

    const vertexBuffer = ws.createBufferWithData(init.device, data.positions);
    const colorBuffer = ws.createBufferWithData(init.device, data.colors);
    const indexBuffer = ws.createBufferWithData(init.device, data.indices);
    const colorBuffer2 = ws.createBufferWithData(init.device, data.colors2);
    const indexBuffer2 = ws.createBufferWithData(init.device, data.indices2);

    // uniform buffers for transform matrix
    const vpUniformBuffer = ws.createBuffer(init.device, 64);
    const modelUniformBuffer = ws.createBuffer(init.device, 64 * totalNumChunks, ws.BufferType.Storage);

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
        vertexBuffers: [vertexBuffer, colorBuffer, colorBuffer2, indexBuffer, indexBuffer2],
        uniformBuffers: [vpUniformBuffer, modelUniformBuffer],
        uniformBindGroups: [vertBindGroup, vertBindGroup2],
        depthTextures: [depthTexture],
        gpuTextures: [msaaTexture],
    };
}

const draw = (init:ws.IWebGPUInit, p:ws.IPipeline, plotType: string, data:any, totalNumChunks:number) => {  
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
        renderPass.setVertexBuffer(0, p.vertexBuffers[0]);
        renderPass.setVertexBuffer(1, p.vertexBuffers[1]);
        renderPass.setBindGroup(0, p.uniformBindGroups[0]);
        renderPass.setIndexBuffer(p.vertexBuffers[3], 'uint32');
        renderPass.drawIndexed(data.indices.length, totalNumChunks);
    }

     // draw wireframe
     function drawWireframe() {
        renderPass.setPipeline(p.pipelines[1]);
        renderPass.setVertexBuffer(0, p.vertexBuffers[0]);
        renderPass.setVertexBuffer(1, p.vertexBuffers[2]);
        renderPass.setBindGroup(0, p.uniformBindGroups[1]);
        renderPass.setIndexBuffer(p.vertexBuffers[4], 'uint32');
        renderPass.drawIndexed(data.indices2.length, totalNumChunks);
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
    const chunkSize = 241;
    const xChunks = 4;
    const zChunks = 4;
    const totalNumChunks = xChunks * zChunks;

    let data = createTerrainDataChunk({});
    let p = await createPipeline(init, data, totalNumChunks);

    var gui = ws.getDatGui();
    const params = {
        plotType: 'terrain',
        seed: 1232,
        scale: 40,
        waterLevel: 0.15,
        levelDetail: 0,
        octaves: 5,
        persistence: 0.5,
        lacunarity: 2,
        offsetX: 10,
        offsetZ: 10,
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
    folder.add(params, 'offsetX', 0, 100, 0.2).onChange(()=>{ dataChanged = true; }); 
    folder.add(params, 'offsetZ', 0, 100, 0.2).onChange(()=>{ dataChanged = true; }); 
    folder.add(params, 'plotType', ['terrain', 'wireframe', 'both']);
    folder.add(params, 'normalizeMode', ['local', 'global']).onChange(() => { dataChanged = true; });
    
    let modelMat = new Float32Array(16 * totalNumChunks);
    let k = 0;
    let chunkSize1 = chunkSize - 1;
    for(let i = 0; i < xChunks; i++){
        for(let j = 0; j < zChunks; j++){
            let translation = vec3.fromValues(-0.5*xChunks*chunkSize1 + i* chunkSize1, 5, 
                -0.5*zChunks*chunkSize1 + j*chunkSize1);
            let m = ws.createModelMat(translation, [0, 0, 0], [1, params.aspectRatio, 1]);
            modelMat.set(m, 16*k);
            k++;
        }
    }
    init.device.queue.writeBuffer(p.uniformBuffers[1], 0, modelMat as ArrayBuffer);

    let vt = ws.createViewTransform([160, 160, 200]);
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
            const len0 = data.positions.length + 1;
            data = createTerrainDataChunk({
                chunkSize: chunkSize,
                waterLevel: params.waterLevel,
                levelDetail: params.levelDetail,
                seed: params.seed,
                scale: params.scale,
                octaves: params.octaves,
                persistence: params.persistence,
                lacunarity: params.lacunarity,
                offsetX: params.offsetX,
                offsetZ: params.offsetZ,
                normalizeMode: params.normalizeMode,
            });
            const pData = [data.positions, data.colors, data.colors2, data.indices, data.indices2];
            ws.updateVertexBuffers(init.device, p, pData, len0);
            dataChanged = false;
        }

        draw(init, p, params.plotType, data, totalNumChunks);      

        requestAnimationFrame(frame);
        stats.end();
    };
    frame();
}

run();