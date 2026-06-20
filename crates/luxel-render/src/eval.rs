//! Interactive GLSL expression evaluator (the "Scratchpad" backend).
//!
//! Evaluates a single GLSL expression at one pixel and returns its value, so a
//! learner can probe what built-ins and math do (the GLSL answer to `print`).
//!
//! How it works:
//!   * The current uniforms (iResolution, iTime, camera, ...) are baked into
//!     the generated source as `const`s, and `gl_FragCoord` is faked by
//!     substituting it with a `const vec4` built from the chosen pixel. So no
//!     uniform buffer or real rasterization is needed; only `.xy` is
//!     meaningful (`.z`/`.w` are placeholders).
//!   * The expression's type is discovered by trying to compile it as
//!     `float`/`vec2`/.../`bool` and taking the first that succeeds (naga is
//!     the type oracle).
//!   * The winning shader renders to a 1x1 `Rgba32Float` target whose single
//!     fragment writes the (padded) value, which we read straight back as
//!     four `f32`s.

use serde::Serialize;

use luxel_core::CameraState;

use crate::errors::RenderError;
use crate::pipeline::FULLSCREEN_VS_WGSL;
use crate::renderer::{align_up, CameraBasis, Renderer};
use crate::shader::compile_full_fragment;

/// Uniform values made available to the evaluated expression.
#[derive(Debug, Clone)]
pub struct EvalInputs {
    /// iResolution.xy in pixels.
    pub resolution: [f32; 2],
    /// The pixel to evaluate at, bottom-left origin (drives gl_FragCoord.xy).
    pub pixel: [f32; 2],
    pub time: f32,
    pub frame: i32,
    pub mouse: [f32; 4],
    pub camera: CameraState,
    pub object: [f32; 3],
}

/// The evaluated value plus its detected GLSL type.
#[derive(Debug, Clone, Serialize)]
pub struct EvalResult {
    /// "float" | "vec2" | "vec3" | "vec4" | "int" | "uint" | "bool".
    #[serde(rename = "typeName")]
    pub type_name: String,
    /// How many of `components` are meaningful (1..=4).
    pub count: u32,
    /// The value, zero-padded to four floats. Non-float scalars are cast.
    pub components: [f32; 4],
}

/// Candidate result types, tried in order. The first whose `T _r = (EXPR)`
/// compiles wins. Float is tried before int so an integer-valued expression
/// reads back as a float (GLSL widens int→float implicitly), which is fine
/// for display.
const CANDIDATES: &[Candidate] = &[
    Candidate { name: "float", glsl: "float", count: 1, pad: "vec4(_luxel_r, 0.0, 0.0, 0.0)" },
    Candidate { name: "vec2", glsl: "vec2", count: 2, pad: "vec4(_luxel_r, 0.0, 0.0)" },
    Candidate { name: "vec3", glsl: "vec3", count: 3, pad: "vec4(_luxel_r, 0.0)" },
    Candidate { name: "vec4", glsl: "vec4", count: 4, pad: "_luxel_r" },
    Candidate { name: "int", glsl: "int", count: 1, pad: "vec4(float(_luxel_r), 0.0, 0.0, 0.0)" },
    Candidate { name: "uint", glsl: "uint", count: 1, pad: "vec4(float(_luxel_r), 0.0, 0.0, 0.0)" },
    Candidate { name: "bool", glsl: "bool", count: 1, pad: "vec4(float(_luxel_r), 0.0, 0.0, 0.0)" },
];

struct Candidate {
    name: &'static str,
    glsl: &'static str,
    count: u32,
    pad: &'static str,
}

impl Renderer {
    /// Evaluate `expr` at the configured pixel. `preamble` is extra GLSL placed
    /// before `main` (e.g. snapshot variable declarations from the REPL); pass
    /// "" when there are none.
    pub fn eval_expression(
        &self,
        preamble: &str,
        expr: &str,
        inputs: &EvalInputs,
    ) -> Result<EvalResult, RenderError> {
        let header = build_header(inputs);
        // gl_FragCoord is reserved, so we can't declare it; substitute uses of
        // it (in the expression and any preamble) with our faked const.
        let pre = replace_identifier(preamble, "gl_FragCoord", "_luxel_fragcoord");
        let ex = replace_identifier(expr, "gl_FragCoord", "_luxel_fragcoord");

        let mut last_err: Option<crate::errors::ShaderCompileError> = None;
        for c in CANDIDATES {
            let src = format!(
                "{header}{pre}\nvoid main() {{\n    {} _luxel_r = ({ex});\n    outColor = {};\n}}\n",
                c.glsl, c.pad,
            );
            match compile_full_fragment(&src) {
                Ok(wgsl) => {
                    let components = self.render_eval_pixel(&wgsl)?;
                    return Ok(EvalResult {
                        type_name: c.name.to_string(),
                        count: c.count,
                        components,
                    });
                }
                Err(e) => last_err = Some(e),
            }
        }
        Err(RenderError::ShaderCompile(last_err.unwrap_or_else(|| {
            crate::errors::ShaderCompileError {
                diagnostics: vec![crate::errors::ShaderDiagnostic {
                    message: "expression did not compile as any supported type".to_string(),
                    line: None,
                    column: None,
                }],
            }
        })))
    }

    /// Render a self-contained fragment shader to a 1x1 float target and read
    /// back the single pixel as four f32s.
    fn render_eval_pixel(&self, fs_wgsl: &str) -> Result<[f32; 4], RenderError> {
        let device = self.device();
        let format = wgpu::TextureFormat::Rgba32Float;

        let target = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("luxel-eval-target"),
            size: wgpu::Extent3d { width: 1, height: 1, depth_or_array_layers: 1 },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
            view_formats: &[],
        });
        let view = target.create_view(&Default::default());

        let vs = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("luxel-eval-vs"),
            source: wgpu::ShaderSource::Wgsl(FULLSCREEN_VS_WGSL.into()),
        });
        let fs = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("luxel-eval-fs"),
            source: wgpu::ShaderSource::Wgsl(fs_wgsl.into()),
        });
        let layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("luxel-eval-pl"),
            bind_group_layouts: &[],
            push_constant_ranges: &[],
        });
        let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("luxel-eval-pipeline"),
            layout: Some(&layout),
            vertex: wgpu::VertexState {
                module: &vs,
                entry_point: "vs_main",
                compilation_options: Default::default(),
                buffers: &[],
            },
            fragment: Some(wgpu::FragmentState {
                module: &fs,
                entry_point: "main",
                compilation_options: Default::default(),
                targets: &[Some(wgpu::ColorTargetState {
                    format,
                    blend: None,
                    write_mask: wgpu::ColorWrites::ALL,
                })],
            }),
            primitive: wgpu::PrimitiveState {
                topology: wgpu::PrimitiveTopology::TriangleList,
                ..Default::default()
            },
            depth_stencil: None,
            multisample: wgpu::MultisampleState::default(),
            multiview: None,
            cache: None,
        });

        let padded_bpr = align_up(16, wgpu::COPY_BYTES_PER_ROW_ALIGNMENT);
        let readback = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("luxel-eval-readback"),
            size: padded_bpr as u64,
            usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
            mapped_at_creation: false,
        });

        let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("luxel-eval-encoder"),
        });
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("luxel-eval-pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color::BLACK),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });
            pass.set_pipeline(&pipeline);
            pass.draw(0..3, 0..1);
        }
        encoder.copy_texture_to_buffer(
            wgpu::ImageCopyTexture {
                texture: &target,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            wgpu::ImageCopyBuffer {
                buffer: &readback,
                layout: wgpu::ImageDataLayout {
                    offset: 0,
                    bytes_per_row: Some(padded_bpr),
                    rows_per_image: Some(1),
                },
            },
            wgpu::Extent3d { width: 1, height: 1, depth_or_array_layers: 1 },
        );
        self.queue().submit(Some(encoder.finish()));

        let slice = readback.slice(..);
        let (tx, rx) = std::sync::mpsc::channel();
        slice.map_async(wgpu::MapMode::Read, move |r| {
            let _ = tx.send(r);
        });
        let _ = device.poll(wgpu::Maintain::Wait);
        rx.recv()
            .map_err(|e| RenderError::Readback(e.to_string()))?
            .map_err(|e| RenderError::Readback(format!("{e:?}")))?;
        let data = slice.get_mapped_range();
        let mut out = [0f32; 4];
        for (i, slot) in out.iter_mut().enumerate() {
            let o = i * 4;
            *slot = f32::from_le_bytes([data[o], data[o + 1], data[o + 2], data[o + 3]]);
        }
        drop(data);
        readback.unmap();
        Ok(out)
    }
}

/// Format an f32 as a valid GLSL float literal (always has a decimal point or
/// exponent). Non-finite values fall back to 0.0.
fn glf(x: f32) -> String {
    if !x.is_finite() {
        return "0.0".to_string();
    }
    let s = format!("{x:?}");
    if s.contains('.') || s.contains('e') || s.contains('E') {
        s
    } else {
        format!("{s}.0")
    }
}

fn build_header(u: &EvalInputs) -> String {
    let basis = CameraBasis::from(&u.camera);
    let p = u.camera.position;
    let o = u.object;
    let m = u.mouse;
    format!(
        "#version 450\n\
precision highp float;\n\
const vec3 iResolution = vec3({}, {}, 1.0);\n\
const float iTime = {};\n\
const int iFrame = {};\n\
const vec4 iMouse = vec4({}, {}, {}, {});\n\
const vec3 iCameraPosition = vec3({}, {}, {});\n\
const float iCameraFov = {};\n\
const vec3 iCameraForward = vec3({}, {}, {});\n\
const vec3 iCameraRight = vec3({}, {}, {});\n\
const vec3 iCameraUp = vec3({}, {}, {});\n\
const vec3 iObjectPosition = vec3({}, {}, {});\n\
const vec4 _luxel_fragcoord = vec4({}, {}, 0.0, 1.0);\n\
layout(location = 0) out vec4 outColor;\n",
        glf(u.resolution[0]), glf(u.resolution[1]),
        glf(u.time),
        u.frame,
        glf(m[0]), glf(m[1]), glf(m[2]), glf(m[3]),
        glf(p[0]), glf(p[1]), glf(p[2]),
        glf(u.camera.fov_y_degrees.to_radians()),
        glf(basis.forward[0]), glf(basis.forward[1]), glf(basis.forward[2]),
        glf(basis.right[0]), glf(basis.right[1]), glf(basis.right[2]),
        glf(basis.up[0]), glf(basis.up[1]), glf(basis.up[2]),
        glf(o[0]), glf(o[1]), glf(o[2]),
        glf(u.pixel[0]), glf(u.pixel[1]),
    )
}

/// Replace whole-word occurrences of `name` with `repl`, leaving identifiers
/// that merely contain `name` (e.g. `gl_FragCoordX`) untouched.
fn replace_identifier(src: &str, name: &str, repl: &str) -> String {
    let bytes = src.as_bytes();
    let nlen = name.len();
    let mut out = String::with_capacity(src.len());
    let mut i = 0;
    while i < src.len() {
        if src[i..].starts_with(name) {
            let before_ok = i == 0 || !is_ident_byte(bytes[i - 1]);
            let after = i + nlen;
            let after_ok = after >= src.len() || !is_ident_byte(bytes[after]);
            if before_ok && after_ok {
                out.push_str(repl);
                i = after;
                continue;
            }
        }
        let ch = src[i..].chars().next().unwrap();
        out.push(ch);
        i += ch.len_utf8();
    }
    out
}

fn is_ident_byte(b: u8) -> bool {
    b == b'_' || b.is_ascii_alphanumeric()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn header() -> String {
        build_header(&EvalInputs {
            resolution: [320.0, 240.0],
            pixel: [40.0, 100.0],
            time: 0.0,
            frame: 0,
            mouse: [0.0; 4],
            camera: CameraState::default(),
            object: [0.0, 0.0, 0.0],
        })
    }

    /// The type oracle: the first candidate whose declaration compiles wins.
    fn detect_type(expr: &str) -> Option<(&'static str, u32)> {
        let h = header();
        let ex = replace_identifier(expr, "gl_FragCoord", "_luxel_fragcoord");
        for c in CANDIDATES {
            let src = format!(
                "{h}\nvoid main() {{\n    {} _luxel_r = ({ex});\n    outColor = {};\n}}\n",
                c.glsl, c.pad,
            );
            if compile_full_fragment(&src).is_ok() {
                return Some((c.name, c.count));
            }
        }
        None
    }

    #[test]
    fn detects_scalar_and_vector_types() {
        assert_eq!(detect_type("length(vec2(3.0, 4.0))"), Some(("float", 1)));
        assert_eq!(detect_type("vec2(1.0, 2.0)"), Some(("vec2", 2)));
        assert_eq!(detect_type("vec3(1.0)"), Some(("vec3", 3)));
        assert_eq!(detect_type("vec4(1.0)"), Some(("vec4", 4)));
        assert_eq!(detect_type("iResolution.xy"), Some(("vec2", 2)));
    }

    #[test]
    fn fragcoord_expression_is_a_vec2() {
        assert_eq!(
            detect_type("(gl_FragCoord.xy - 0.5 * iResolution.xy) / iResolution.y"),
            Some(("vec2", 2)),
        );
    }

    #[test]
    fn nonsense_expression_detects_no_type() {
        assert_eq!(detect_type("this is not glsl"), None);
        assert_eq!(detect_type("length("), None);
    }

    #[test]
    fn glf_emits_valid_literals() {
        assert_eq!(glf(3.0), "3.0");
        assert_eq!(glf(0.5), "0.5");
        assert_eq!(glf(-2.0), "-2.0");
        assert_eq!(glf(f32::INFINITY), "0.0");
    }

    #[test]
    fn replace_identifier_respects_word_boundaries() {
        assert_eq!(replace_identifier("gl_FragCoord.xy", "gl_FragCoord", "P"), "P.xy");
        assert_eq!(replace_identifier("mygl_FragCoordX", "gl_FragCoord", "P"), "mygl_FragCoordX");
        assert_eq!(
            replace_identifier("a gl_FragCoord b", "gl_FragCoord", "P"),
            "a P b",
        );
    }
}
