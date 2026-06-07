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
    // Map to UV with OpenGL convention: v_uv.y = 0 at the bottom of the
    // screen, 1 at the top. The readback reverses row order to match, so
    // gl_FragCoord also follows the standard bottom-left origin.
    out.v_uv = vec2<f32>((x + 1.0) * 0.5, 1.0 - (y + 1.0) * 0.5);
    return out;
}
"#;
