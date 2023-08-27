import { vec2 } from 'gl-matrix';
import { addColors, colormapData } from './colormap-data';
import { addTerrainColors, terrainColormapData } from './colormap-terrain-data';
import { Noise } from './noise-data';
var prng = require('seedrandom');
const Spline = require('cubic-spline');

export interface ITerrain {    
    width?: number,
    height?: number,
    seed?: number,
    octaves?: number,
    persistence?: number,
    lacunarity?: number,
    offsetX?: number,
    offsetZ?: number,
    waterLevel?: number,
    scale?: number,
    aspectRatio?: number,
    colormapName?: string,
    wireframeColor?: string,
    chunkSize?: number,
    levelDetail?: number,
    normalizeMode?:string,
}

const setDefaultITerrain = (t:ITerrain): ITerrain => {
    t.width = t.width === undefined? 200: t.width;
    t.height = t.height === undefined? 200: t.height;
    t.seed = t.seed === undefined? 1232: t.seed;
    t.octaves = t.octaves === undefined? 5: t.octaves;
    t.persistence = t.persistence === undefined? 0.5: t.persistence;
    t.lacunarity = t.lacunarity === undefined? 2: t.lacunarity;
    t.offsetX = t.offsetX === undefined? 0: t.offsetX;
    t.offsetZ = t.offsetZ === undefined? 0: t.offsetZ;
    t.waterLevel = t.waterLevel === undefined? 0: t.waterLevel;
    t.scale = t.scale === undefined? 10: t.scale;
    t.aspectRatio = t.aspectRatio === undefined? 5: t.aspectRatio;
    t.colormapName = t.colormapName === undefined? 'terrain': t.colormapName;
    t.wireframeColor = t.wireframeColor === undefined? 'white': t.wireframeColor;
    t.chunkSize = t.chunkSize === undefined? 241: t.chunkSize;
    t.levelDetail = t.levelDetail === undefined? 0: t.levelDetail;
    t.normalizeMode = t.normalizeMode === undefined? 'local': t.normalizeMode;
    return t;
}

export const createTerrainDataMultipleChunks = (t:ITerrain, xChunks:number, zChunks:number, translations:vec2[]) => {
    let res: {  
        positions: Float32Array,
        colors: Float32Array,
        indices:  Uint32Array,
        colors2: Float32Array,
        indices2: Uint32Array
    }[] = [];

    let k = 0;
    for(let i = 0; i < xChunks; i++){
        for(let j = 0; j < zChunks; j++){
            let trans = translations[k];
            t.offsetX = trans[0];
            t.offsetZ = -trans[1];
            let data = createTerrainDataChunk(t);
            res.push(data);
            k++;
        }
    }
    return res;
}

export const createTerrainDataChunk = (t:ITerrain) => {
    t = setDefaultITerrain(t);

    let incrementNumber = (t.levelDetail === 0) ? 1 : 2 * t.levelDetail;
    let verticesPerRow = (t.chunkSize - 1) / incrementNumber + 1;
   
    const xs = [0, 0.25*t.waterLevel, 0.5*t.waterLevel, 0.75*t.waterLevel, t.waterLevel, 0.8, 1];
    const ys = [0, 0.0025, 0.005, 0.0075, 0.015, 0.65, 1];
    const spline = new Spline(xs, ys);

    const cm = terrainColormapData(t.colormapName);
    const cm2 = terrainColormapData(t.wireframeColor);
    let noiseMap = createNoiseMap(t, t.chunkSize, t.chunkSize);
    
    let positions = [], colors = [], colors2 = [];
    for(let x = 0; x < t.chunkSize; x += incrementNumber){
        for(let z = 0; z < t.chunkSize; z += incrementNumber){  
            noiseMap[x][z] = spline.at(noiseMap[x][z]); // rescale the heightmap using the spline curve

            // positions
            positions.push(x, noiseMap[x][z], z);

            // colormap for terrain and wireframe
            let y = 0;
            if(noiseMap[x][z]) {
                y = noiseMap[x][z];
                let color =  addTerrainColors(cm, 0, 1, y, t.waterLevel);
                if(color) colors.push(color[0], color[1], color[2]);
                let color2 =  addTerrainColors(cm2, 0, 1, y, t.waterLevel);
                if(color2) colors2.push(color2[0], color2[1], color2[2]);
            }
        }
    }

    let idx = createIndicesData(t, verticesPerRow, verticesPerRow);
    return {
        positions: new Float32Array(positions),
        colors: new Float32Array(colors),
        colors2: new Float32Array(colors2),
        indices: idx.indices,
        indices2: idx.indices2,
    };
}

export const createTerrainDataWithWaterLevel = (t:ITerrain) => {
    t = setDefaultITerrain(t);

    const xs = [0, 0.25*t.waterLevel, 0.5*t.waterLevel, 0.75*t.waterLevel, t.waterLevel, 0.8, 1];
    const ys = [0, 0.0025, 0.005, 0.0075, 0.015, 0.65, 1];
    const spline = new Spline(xs, ys);

    const cm = terrainColormapData(t.colormapName);
    const cm2 = terrainColormapData(t.wireframeColor);
    let noiseMap = createNoiseMap(t, t.width, t.height);

    let positions = [], colors = [], colors2 = [];
    for(let x = 0; x < t.width; x++){
        for(let z = 0; z < t.height; z++){  

            noiseMap[x][z] = spline.at(noiseMap[x][z]); // rescale the heightmap using the spline curve

            // positions
            positions.push(x, noiseMap[x][z], z);

            // colormap
            let y = 0;
            if(noiseMap[x][z]) {
                y = noiseMap[x][z];
                let color =  addTerrainColors(cm, 0, 1, y, t.waterLevel);
                if(color) colors.push(color[0], color[1], color[2]);
                let color2 =  addTerrainColors(cm2, 0, 1, y, t.waterLevel);
                if(color2) colors2.push(color2[0], color2[1], color2[2]);
            }
        }
    }

    let idx = createIndicesData(t, t.width, t.height);
    return {
        positions: new Float32Array(positions),
        colors: new Float32Array(colors),
        colors2: new Float32Array(colors2),
        indices: idx.indices,
        indices2: idx.indices2,
    };
}

const createIndicesData = (t:ITerrain, width:number, height:number) => {
    let n_vertices_per_row = height;
    let indices = [];
    let indices2 = [];

    for(let i = 0; i < width-1; i++){
        for(let j = 0; j < height-1; j++) {
            let idx0 = j + i * n_vertices_per_row;
            let idx1 = j + 1 + i * n_vertices_per_row;
            let idx2 = j + 1 + (i + 1) * n_vertices_per_row;
            let idx3 = j + (i + 1) * n_vertices_per_row;  
            indices.push(idx0, idx1, idx2, idx2, idx3, idx0);    
            indices2.push(idx0, idx1, idx0, idx3);           
        }
    }
    return { indices: new Uint32Array(indices), indices2: new Uint32Array(indices2)};
}

export const createTerrainData = (t:ITerrain) => {
    t = setDefaultITerrain(t);
   
    const cm = colormapData(t.colormapName);
    const cm2 = colormapData(t.wireframeColor);
    let noiseMap = createNoiseMap(t, t.width, t.height);

    let positions = [], colors = [], colors2 = [];
    for(let x = 0; x < t.width; x++){
        for(let z = 0; z < t.height; z++){  
            // positions
            positions.push(x, noiseMap[x][z], z);

            // colormap
            let y = 0;
            if(noiseMap[x][z]) {
                y = noiseMap[x][z];
                let color =  addColors(cm, 0, 1, y);
                colors.push(color[0], color[1], color[2]);
                let color2 =  addColors(cm2, 0, 1, y);
                colors2.push(color2[0], color2[1], color2[2]);
            }
        }
    }

    let idx = createIndicesData(t, t.width, t.height);
    return {
        positions: new Float32Array(positions),
        colors: new Float32Array(colors),
        colors2: new Float32Array(colors2),
        indices: idx.indices,
        indices2: idx.indices2,
    };
}

const createNoiseMap = (t:ITerrain, width:number, height:number) => {    
    let rng = prng(t.seed);
    var noise = new Noise(rng());
   
    let offsets = [];
    for(let i = 0; i < t.octaves; i++){
        let offsetX = 100000 * (2 * rng() - 1) + t.offsetX;
        let offsetZ = 100000 * (2 * rng() - 1) - t.offsetZ;
        offsets.push([offsetX, offsetZ]);
    }

    if(t.scale < 0.0001) t.scale = 0.0001;

    let noiseMap = [];
    let minHeight = Number.MAX_VALUE;
    let maxHeight = -Number.MAX_VALUE;  
    let halfw = 0.5 * width;
    let halfh = 0.5 * height;  

    for(let x = 0; x < width; x++){
        let p1 = [];
        for(let z = 0; z < height; z++){  
            let amplitude = 1;
            let frequency = 1;
            let noiseHeight = 0;

            for( let i = 0; i < t.octaves; i++){
                let sampleX = (x - halfw + offsets[i][0]) / t.scale * frequency;
                let sampleZ = (z - halfh + offsets[i][1]) / t.scale * frequency;
                let y =  noise.perlin2(sampleX, sampleZ)*2 - 1;
                noiseHeight += y * amplitude;                
                amplitude *= t.persistence;
                frequency *= t.lacunarity;
           }
           minHeight = noiseHeight < minHeight? noiseHeight:minHeight;
           maxHeight = noiseHeight > maxHeight? noiseHeight:maxHeight;
           p1.push(noiseHeight);
        }
        noiseMap.push(p1);
    }
   
    if(t.normalizeMode === 'global'){
        minHeight = -1;
        maxHeight = 1;
    }

    for(let x = 0; x < width; x++){
        for(let z = 0; z < height; z++){  
            noiseMap[x][z] = NormalizeValue(minHeight, maxHeight, noiseMap[x][z]);
        }
    }

    return noiseMap;
}

const NormalizeValue = (miny:number, maxy:number, y:number) => {
    return  (y - miny) / (maxy - miny);
}