//! Vertex shader used for fullscreen passes. Pure WGSL so it never needs translation.

pub const FULLSCREEN_VS_WGSL: &str = r#"
struct VertexOut {
    @builtin(position) position: vec4<f32>,
    @location(0) v_uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vid: u32) -> VertexOut {
    var out: VertexOut;
    // Fullscreen triangle covering NDC [-1,1] x [-1,1].
    let x = f32((vid << 1u) & 2u) * 2.0 - 1.0;
    let y = f32(vid & 2u) * 2.0 - 1.0;
    out.position = vec4<f32>(x, y, 0.0, 1.0);
    // Shadertoy convention: fragCoord origin is the BOTTOM-left of the
    // screen and y grows upward. In wgpu NDC, +y is the top of the screen,
    // so we map x and y straight through: NDC y = +1 → v_uv.y = 1 → fragCoord.y
    // = iResolution.y. Without this flip, raymarchers send "up" rays to the
    // bottom of the canvas and the world appears upside down.
    out.v_uv = vec2<f32>((x + 1.0) * 0.5, (y + 1.0) * 0.5);
    return out;
}
"#;
