struct VertexData{
    position: vec3f,
    color: vec3f,
}

struct VertexDataArray{
    vertexDataArray: array<VertexData>,
}

struct TerrainParams{
    resolution: f32,
    octaves: f32,    
    persistence: f32,
    lacunarity: f32,
    offsetX: f32,
    offsetZ: f32,   
    scale: f32,
    waterLevel: f32,
    heightMultiplier: f32,
}

@group(0) @binding(0) var<storage, read_write> vda : VertexDataArray;
@group(0) @binding(1) var<uniform> tps: TerrainParams;

fn terrainFunc(x:f32, z:f32) -> f32 {
    let halfr = 0.5 * tps.resolution;
    var amplitude = 1.0;
    var frequency = 1.0;
    var noiseHeight = 0.0;
    for(var i:u32 = 0; i < u32(tps.octaves); i = i+1u) {
        let sampleX = (x - halfr + tps.offsetX)/(tps.scale) * frequency;
        let sampleZ = (z - halfr - tps.offsetZ)/(tps.scale) * frequency;
        let y = perlinNoise(vec2(sampleX, sampleZ))*2.0 - 1.0;
        noiseHeight += y * amplitude;
        amplitude *= tps.persistence;
        frequency *= tps.lacunarity;
    }
    return noiseHeight;
}

@compute @workgroup_size(8, 8, 1)
fn cs_main(@builtin(global_invocation_id) id : vec3u){
    var i = id.x;
    var j = id.y;
    var y = terrainFunc(f32(id.x), f32(id.y));
    if(y <= tps.waterLevel) { y = tps.waterLevel - 0.0001; }
    let p0 = vec3(f32(id.x), y*tps.heightMultiplier, f32(id.y));

    // colormap
    let rgbData = array<vec3<f32>,5>(
        vec3(0.055, 0.529, 0.8),
        vec3(0.761, 0.698, 0.502),
        vec3(0.204, 0.549, 0.192),
        vec3(0.353, 0.302, 0.255),
        vec3(1.0, 0.98, 0.98)
    );
    let ta = array<f32, 6>(0.0, 0.3, 0.35, 0.4, 0.7, 1.0);
    let color = addTerrainColors(rgbData, ta, 0, tps.heightMultiplier, p0.y, tps.waterLevel);

    var idx = i + j * u32(tps.resolution);   
    vda.vertexDataArray[idx].position = p0;
    vda.vertexDataArray[idx].color = color;
}