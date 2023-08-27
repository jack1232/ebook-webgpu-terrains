import shader from '../../common/shader-unlit.wgsl';
import { createTerrainDataWithWaterLevel } from '../../common/terrain-data';
import * as ws from 'webgpu-simplified';

const createPipeline = async (init: ws.IWebGPUInit, data:any): Promise<ws.IPipeline> => {
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
        buffers: ws.setVertexBuffers(['float32x3', 'float32x3']), //position, color 
    })
    const pipeline2 = await init.device.createRenderPipelineAsync(descriptor2);

    const vertexBuffer = ws.createBufferWithData(init.device, data.positions);
    const colorBuffer = ws.createBufferWithData(init.device, data.colors);
    const indexBuffer = ws.createBufferWithData(init.device, data.indices);
    const colorBuffer2 = ws.createBufferWithData(init.device, data.colors2);
    const indexBuffer2 = ws.createBufferWithData(init.device, data.indices2);

    // uniform buffer for transform matrix
    const  vertUniformBuffer = ws.createBuffer(init.device, 64);
    const vertBindGroup = ws.createBindGroup(init.device, pipeline.getBindGroupLayout(0), [vertUniformBuffer]);
    const vertBindGroup2 = ws.createBindGroup(init.device, pipeline2.getBindGroupLayout(0), [vertUniformBuffer]);

    // create depth texture
   const depthTexture = ws.createDepthTexture(init);

   // create texture view for MASS (count = 4)
   const msaaTexture = ws.createMultiSampleTexture(init);

    return {
        pipelines: [pipeline, pipeline2],
        vertexBuffers: [vertexBuffer, colorBuffer, colorBuffer2, indexBuffer, indexBuffer2],
        uniformBuffers: [vertUniformBuffer],
        uniformBindGroups: [vertBindGroup, vertBindGroup2],
        depthTextures: [depthTexture],
        gpuTextures: [msaaTexture],
    };
}

const draw = (init:ws.IWebGPUInit, p:ws.IPipeline, plotType:string, data:any) => {  
    const commandEncoder =  init.device.createCommandEncoder();
    const descriptor = ws.createRenderPassDescriptor({
        init,
        depthView: p.depthTextures[0].createView(),
        textureView: p.gpuTextures[0].createView(),
    });
    const renderPass = commandEncoder.beginRenderPass(descriptor);

    // draw terrain
    if(plotType === 'terrain' || plotType === 'both') {
        renderPass.setPipeline(p.pipelines[0]);
        renderPass.setVertexBuffer(0, p.vertexBuffers[0]);
        renderPass.setVertexBuffer(1, p.vertexBuffers[1]);
        renderPass.setBindGroup(0, p.uniformBindGroups[0]);
        renderPass.setIndexBuffer(p.vertexBuffers[3], 'uint32');
        renderPass.drawIndexed(data.indices.length);
    }

    // draw wireframe
    if(plotType === 'wireframe' || plotType === 'both') {
        renderPass.setPipeline(p.pipelines[1]);
        renderPass.setVertexBuffer(0, p.vertexBuffers[0]);
        renderPass.setVertexBuffer(1, p.vertexBuffers[2]);
        renderPass.setBindGroup(0, p.uniformBindGroups[1]);
        renderPass.setIndexBuffer(p.vertexBuffers[4], 'uint32');
        renderPass.drawIndexed(data.indices2.length);
    }

    renderPass.end();
    init.device.queue.submit([commandEncoder.finish()]);
}

const run = async () => {
    const canvas = document.getElementById('canvas-webgpu') as HTMLCanvasElement;
    const init = await ws.initWebGPU({canvas, msaaCount: 4});

    let data = createTerrainDataWithWaterLevel({});    
    let p = await createPipeline(init, data);

    var gui = ws.getDatGui();
    const params = {
        plotType: 'both',
        seed: 1232,
        scale: 30,
        resolution: 150,
        waterLevel: 0.15,
        octaves: 5,
        persistence: 0.5,
        lacunarity: 2,
        aspectRatio: 15,
        animateSpeed: 1,
    };
   
    var folder = gui.addFolder('Set Terrain Parameters');
    folder.open();
    folder.add(params, 'plotType', ['terrain', 'wireframe', 'both']);
    folder.add(params, 'animateSpeed', 0, 5, 0.1); 
    folder.add(params, 'seed', 1, 65536, 1); 
    folder.add(params, 'scale', 0.3, 100, 0.1); 
    folder.add(params, 'resolution', 40, 500, 1); 
    folder.add(params, 'waterLevel', 0.01, 0.4, 0.01); 
    folder.add(params, 'aspectRatio', 0, 100, 0.1); 
    folder.add(params, 'octaves', 1, 20, 1); 
    folder.add(params, 'persistence', 0, 1, 0.01); 
    folder.add(params, 'lacunarity', 1, 10, 0.2); 

    let modelMat = ws.createModelMat([-0.65*params.resolution, 5, -0.5*params.resolution], 
        [0, Math.PI/15, 0], [1, params.aspectRatio, 1]);
    
    let vt = ws.createViewTransform([30, 40, 50]);
    let viewMat = vt.viewMat;

    let aspect = init.size.width / init.size.height;  
    let projectMat = ws.createProjectionMat(aspect);
    let mvpMat = ws.combineMvpMat(modelMat, viewMat, projectMat);
    var camera = ws.getCamera(canvas, vt.cameraOptions);
    
    let start = performance.now();
    let stats = ws.getStats();
    const frame = () => {     
        stats.begin();
        if(camera.tick()){
            viewMat = camera.matrix;
            mvpMat = ws.combineMvpMat(modelMat, viewMat, projectMat);
            init.device.queue.writeBuffer(p.uniformBuffers[0], 0, mvpMat as ArrayBuffer);
        }
        
        // update vertex and index buffers    
        const len0 = data.positions.length;
        let dt = (performance.now() - start)/40;
        data = createTerrainDataWithWaterLevel({
            width: params.resolution,
            height: params.resolution,
            waterLevel: params.waterLevel,
            seed: params.seed,
            scale: params.scale,
            octaves: params.octaves,
            persistence: params.persistence,
            lacunarity: params.lacunarity,
            offsetX: 0,
            offsetZ: params.animateSpeed * dt,
            normalizeMode: 'global',
        });
        const pData = [data.positions, data.colors, data.colors2, data.indices, data.indices2];
        ws.updateVertexBuffers(init.device, p, pData, len0);
        
        modelMat = ws.createModelMat([-0.65*params.resolution, 5, -0.5*params.resolution], 
            [0, Math.PI/15, 0], [1, params.aspectRatio, 1]);
        mvpMat = ws.combineMvpMat(modelMat, viewMat, projectMat);
        init.device.queue.writeBuffer(p.uniformBuffers[0], 0, mvpMat as ArrayBuffer);
            
            

        draw(init, p, params.plotType, data);      

        requestAnimationFrame(frame);
        stats.end();
    };
    frame();
}

run();