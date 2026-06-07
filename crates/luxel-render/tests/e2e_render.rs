//! End-to-end smoke tests that actually drive the wgpu pipeline.
//!
//! These require a working GPU adapter (Metal/DX12/Vulkan). On a headless CI
//! box with no adapter, `Renderer::new` returns `NoAdapter` and the tests
//! short-circuit with `eprintln!` rather than failing — that way a developer
//! laptop run is meaningful but CI without a GPU isn't a false positive.

use luxel_core::{Scene, SceneFile, ShaderCompatibility};
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
    assert_eq!(result.pixel_bytes(), expected, "pixel byte count");
    assert_eq!(result.width, scene.render_settings.width);
    assert_eq!(result.height, scene.render_settings.height);
    // The default gradient varies across the frame — top-left and bottom-right
    // pixels must differ on at least one channel.
    let pixels = &result.pixels;
    let tl = &pixels[..4];
    let br_offset = pixels.len() - 4;
    let br = &pixels[br_offset..];
    assert_ne!(tl, br, "gradient should not be uniform");
}

#[test]
fn raymarch_scene_renders() {
    let Some(r) = try_renderer() else { return };
    let mut scene = Scene::default();
    // The fixture is a Shadertoy-style `mainImage` shader. The default
    // ShaderSource is now raw GLSL, so we have to flip compatibility back
    // for this test to exercise the Shadertoy prelude path with the
    // checked-in disk fixture.
    scene.shader.compatibility = ShaderCompatibility::ShadertoyFragmentV1;
    scene.shader.entry_point = "mainImage".to_string();
    scene.shader.source = include_str!("../../../examples/shaders/raymarch_sphere.glsl").to_string();
    scene.render_settings.width = 256;
    scene.render_settings.height = 256;
    let result = r.render_single_frame(&scene).expect("raymarch should render");
    let pixels = &result.pixels;
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
    assert!(result.pixel_bytes() > 0);
}

#[test]
fn raw_glsl_scene_renders_a_gradient() {
    let Some(r) = try_renderer() else { return };
    let mut scene = Scene::default();
    scene.shader.compatibility = ShaderCompatibility::RawFragmentV1;
    scene.shader.entry_point = "main".to_string();
    // A simple raw shader that writes v_uv into red/green so the corners differ.
    scene.shader.source = "void main(){ outColor = vec4(v_uv.x, v_uv.y, 0.25, 1.0); }".to_string();
    scene.render_settings.width = 64;
    scene.render_settings.height = 64;
    let result = r.render_single_frame(&scene).expect("raw glsl render");
    let pixels = &result.pixels;
    // Top-left: v_uv ≈ (0, 1) → green high, red low.
    // Bottom-right: v_uv ≈ (1, 0) → red high, green low.
    let tl = &pixels[..4];
    let stride = 64 * 4;
    let br_offset = 63 * stride + 63 * 4;
    let br = &pixels[br_offset..br_offset + 4];
    assert!(
        tl[1] > tl[0],
        "top-left should be greener than red, got R={} G={}",
        tl[0],
        tl[1]
    );
    assert!(
        br[0] > br[1],
        "bottom-right should be redder than green, got R={} G={}",
        br[0],
        br[1]
    );
}
