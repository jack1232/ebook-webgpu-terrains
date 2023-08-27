// vertex shader
@binding(0) @group(0) var<uniform> mvp_mat : mat4x4f;

struct Output {
    @builtin(position) position : vec4f,
    @location(0) vColor: vec4f,
};

@vertex
fn vs_main(@location(0) pos: vec4f, @location(1) color: vec4f) -> Output {    
    var output: Output;                            
    output.position = mvp_mat * pos; 
    output.vColor = color;              
    return output;
}

@fragment
fn fs_main(@location(0) vColor: vec4f) ->  @location(0) vec4f {  
    return vec4(vColor.rgb, 1.0);
}