@binding(0) @group(0) var<uniform> mvpMat: mat4x4f;

struct Input {
    @location(0) cubePosition: vec4f,
    @location(1) position: vec4f, 
    @location(2) color: vec4f,
}

struct Output {
    @builtin(position) position : vec4f,
    @location(0) vColor: vec4f,
}

@vertex
fn vs_main(in:Input) -> Output {    
    var output: Output;          
    var position = in.position + in.cubePosition;
    output.position = mvpMat * position; 
    output.vColor = in.color;            
    return output;
}

// fragment shader
@fragment
fn fs_main(@location(0) vColor: vec4f) ->  @location(0) vec4f {  
    return vec4(vColor.rgb, 1.0);
}