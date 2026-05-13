//! End-to-end smoke tests that actually drive the wgpu pipeline.
//!
//! These require a working GPU adapter (Metal/DX12/Vulkan). On a headless CI
//! box with no adapter, `Renderer::new` returns `NoAdapter` and the tests
//! short-circuit with `eprintln!` rather than failing — that way a developer
//! laptop run is meaningful but CI without a GPU isn't a false positive.

use luxel_core::{Scene, SceneFile};
use luxel_render::{GpuBackend, Renderer};

fn try_renderer() -> Option<Renderer> {
    match Renderer::new(GpuBackend::Auto) {
        Ok(r) => Some(r),
        Err(e) => {
            eprintln!("skipping e2e test: no GPU adapter ({e})");
            None
        }
    }
}

#[test]
fn default_scene_produces_pixels() {
    let Some(r) = try_renderer() else { return };
    let scene = Scene::default();
    let result = r.render_single_frame(&scene).expect("render should succeed");
    let expected = (scene.render_settings.width * scene.render_settings.height * 4) as usize;
    assert_eq!(result.pixel_bytes, expected, "pixel byte count");
    assert_eq!(result.width, scene.render_settings.width);
    assert_eq!(result.height, scene.render_settings.height);
    // The default gradient varies across the frame — top-left and bottom-right
    // pixels must differ on at least one channel.
    let pixels = base64_decode(&result.pixels_base64);
    let bpr = (scene.render_settings.width * 4) as usize;
    let tl = &pixels[..4];
    let br_offset = pixels.len() - 4;
    let br = &pixels[br_offset..];
    assert_ne!(tl, br, "gradient should not be uniform; bpr={bpr}");
}

#[test]
fn raymarch_scene_renders() {
    let Some(r) = try_renderer() else { return };
    let mut scene = Scene::default();
    scene.shader.source = include_str!("../../../examples/shaders/raymarch_sphere.glsl").to_string();
    scene.render_settings.width = 256;
    scene.render_settings.height = 256;
    let result = r.render_single_frame(&scene).expect("raymarch should render");
    let pixels = base64_decode(&result.pixels_base64);
    // The sphere is centered; the middle pixel must be lighter than the corner.
    let stride = 256 * 4;
    let center = &pixels[128 * stride + 128 * 4..128 * stride + 128 * 4 + 3];
    let corner = &pixels[..3];
    let center_lum: u32 = center.iter().map(|&b| b as u32).sum();
    let corner_lum: u32 = corner.iter().map(|&b| b as u32).sum();
    assert!(
        center_lum > corner_lum,
        "expected sphere highlight at center to be brighter than the corner: center={center_lum} corner={corner_lum}"
    );
}

#[test]
fn syntax_error_surfaces_diagnostics() {
    let Some(r) = try_renderer() else { return };
    let mut scene = Scene::default();
    scene.shader.source = "void mainImage(out vec4 c, in vec2 p){ this is not valid glsl }".into();
    let err = r.render_single_frame(&scene).expect_err("should fail");
    match err {
        luxel_render::RenderError::ShaderCompile(sc) => {
            assert!(!sc.diagnostics.is_empty(), "expected at least one diagnostic");
        }
        other => panic!("expected ShaderCompile, got {other:?}"),
    }
}

#[test]
fn scene_file_to_render_round_trip() {
    let Some(r) = try_renderer() else { return };
    let file = SceneFile::default();
    let json = serde_json::to_string(&file).unwrap();
    let parsed: SceneFile = serde_json::from_str(&json).unwrap();
    let result = r.render_single_frame(&parsed.scene).expect("render should succeed");
    assert!(result.pixel_bytes > 0);
}

fn base64_decode(s: &str) -> Vec<u8> {
    const T: [i8; 128] = build_decode_table();
    let s = s.as_bytes();
    let mut out = Vec::with_capacity(s.len() / 4 * 3);
    let mut buf: u32 = 0;
    let mut bits: u32 = 0;
    for &c in s {
        if c == b'=' {
            break;
        }
        if c < 128 {
            let v = T[c as usize];
            if v < 0 {
                continue;
            }
            buf = (buf << 6) | v as u32;
            bits += 6;
            if bits >= 8 {
                bits -= 8;
                out.push((buf >> bits) as u8);
                buf &= (1 << bits) - 1;
            }
        }
    }
    out
}

const fn build_decode_table() -> [i8; 128] {
    let mut t = [-1i8; 128];
    let alpha = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut i = 0;
    while i < 64 {
        t[alpha[i] as usize] = i as i8;
        i += 1;
    }
    t
}
