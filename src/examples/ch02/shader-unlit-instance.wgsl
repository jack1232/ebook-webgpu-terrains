// vertex shader
@binding(0) @group(0) var<uniform> vpMat: mat4x4f;
@group(0) @binding(1)  var<storage> modelMat: array<mat4x4f>;

struct Input {
    @builtin(instance_index) idx: u32,  
    @location(0) position: vec4f, 
    @location(1) color: vec4f
};

struct Output {
    @builtin(position) position : vec4f,
    @location(0) vColor: vec4f,
};

@vertex
fn vs_main(in:Input) -> Output {    
    var output: Output;          
    output.position = vpMat * modelMat[in.idx] * in.position;           
    output.vColor = in.color;              
    return output;
}

// fragment shader
@fragment
fn fs_main(@location(0) vColor: vec4f) ->  @location(0) vec4f {  
    return vec4(vColor.rgb, 1.0);
}