export const terrainColormapData = (colormapName:string) => {
    let colors: {hex:string[], ta:number[]};
    var hex:string[], ta:number[];

    switch(colormapName){       
        case 'terrain':
            hex = ['0e87cc', 'c2b280', '348c31', '5a4d41', 'fffafa'];
            ta = [0, 0.4, 0.45, 0.55, 0.9, 1];
            colors = {hex, ta};
        break;
        case 'white':
            hex = ['ffffff', 'ffffff', 'ffffff', 'ffffff', 'ffffff'];
            ta = [0, 0.4, 0.45, 0.55, 0.9, 1];
            colors = {hex, ta};
        break;
    }
    return colors;
}

export const addTerrainColors = (colors:{ hex:string[], ta:number[]}, min:number, max:number, 
x:number, waterLevel:number ) => {  
    if(x < min) x = min;
    if(x > max) x = max;
    if(min == max) return [0,0,0];
    let t = (x-min)/(max-min);
    let ta1 = shiftWaterLevel(colors.ta, waterLevel);
    let rgbData = hex2rgbArray(colors.hex);
    return lerpColor(rgbData, ta1, t);
}

const shiftWaterLevel = (ta:number[], waterLevel:number) => {
    let t1 = Array(ta.length);
    let r = (1 - waterLevel)/(1 - ta[1]);
    t1[0] = 0;
    t1[1] = waterLevel;
    for(let i = 1; i < ta.length - 1; i++){
        let del = ta[i+1] - ta[i];
        t1[i+1] = t1[i] + r * del;
    }
    return t1;
}

const lerpColor = (arrs:number[][], ta: number[], t:number) => {
    let len = ta.length;
    let res: number[];

    for(let i = 0; i < len - 1; i++){
        if(t >= ta[i] && t < ta[i+1]) res = arrs[i]; 
    }
    if(t === ta[len-1]) res = arrs[len-2];
    return res;
}

const hex2rgbArray = (hex:string[]) => {
    let res = [];
    for(let i = 0; i < hex.length; i++){
        res.push(hex2rgb(hex[i]))
    }
    return res;
} 

const hex2rgb = (hex:string) => {
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? [
        (parseInt(result[1], 16))/255,
        (parseInt(result[2], 16))/255,
        (parseInt(result[3], 16))/255
     ] : null;
}