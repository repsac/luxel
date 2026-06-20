//! End-to-end tests for the GLSL expression evaluator. Like the render e2e
//! tests these need a real GPU adapter and short-circuit (rather than fail)
//! when none is available, so a no-GPU CI box doesn't report false failures.
//!
//! Together these double as the verification that an `Rgba32Float` render
//! target works on the host and that the whole bake-uniforms / fake-fragcoord
//! / read-back-floats path produces correct values.

use luxel_core::CameraState;
use luxel_render::{EvalInputs, GpuBackend, Renderer};

fn try_renderer() -> Option<Renderer> {
    match Renderer::new(GpuBackend::Auto) {
        Ok(r) => Some(r),
        Err(e) => {
            eprintln!("skipping eval e2e test: no GPU adapter ({e})");
            None
        }
    }
}

fn inputs() -> EvalInputs {
    EvalInputs {
        resolution: [320.0, 240.0],
        pixel: [40.0, 100.0],
        time: 0.0,
        frame: 0,
        mouse: [0.0; 4],
        camera: CameraState::default(),
        object: [0.0, 0.0, 0.0],
    }
}

fn approx(a: f32, b: f32) {
    assert!((a - b).abs() < 1e-4, "expected {b}, got {a}");
}

#[test]
fn builtins_evaluate_to_expected_values() {
    let Some(r) = try_renderer() else { return };
    let i = inputs();

    // (expression, expected components, significant count, type)
    let cases: &[(&str, [f32; 4], u32, &str)] = &[
        ("length(vec2(3.0, 4.0))", [5.0, 0.0, 0.0, 0.0], 1, "float"),
        ("dot(vec2(1.0, 2.0), vec2(3.0, 4.0))", [11.0, 0.0, 0.0, 0.0], 1, "float"),
        ("normalize(vec2(3.0, 4.0))", [0.6, 0.8, 0.0, 0.0], 2, "vec2"),
        ("clamp(5.0, 0.0, 1.0)", [1.0, 0.0, 0.0, 0.0], 1, "float"),
        ("mix(0.0, 10.0, 0.25)", [2.5, 0.0, 0.0, 0.0], 1, "float"),
        ("cross(vec3(1.0,0.0,0.0), vec3(0.0,1.0,0.0))", [0.0, 0.0, 1.0, 0.0], 3, "vec3"),
        ("fract(1.25)", [0.25, 0.0, 0.0, 0.0], 1, "float"),
        ("step(0.5, 0.7)", [1.0, 0.0, 0.0, 0.0], 1, "float"),
        ("distance(vec2(0.0,0.0), vec2(3.0,4.0))", [5.0, 0.0, 0.0, 0.0], 1, "float"),
        ("iResolution.xy", [320.0, 240.0, 0.0, 0.0], 2, "vec2"),
    ];

    for (expr, expected, count, type_name) in cases {
        let out = r
            .eval_expression("", expr, &i)
            .unwrap_or_else(|e| panic!("eval `{expr}` failed: {e}"));
        assert_eq!(out.count, *count, "count for `{expr}`");
        assert_eq!(&out.type_name, type_name, "type for `{expr}`");
        for k in 0..*count as usize {
            approx(out.components[k], expected[k]);
        }
    }
}

#[test]
fn fragcoord_uses_the_supplied_pixel() {
    let Some(r) = try_renderer() else { return };
    let i = inputs(); // pixel (40,100), resolution (320,240)
    // (gl_FragCoord.xy - 0.5*iResolution.xy) / iResolution.y
    //   x = (40 - 160) / 240 = -0.5
    //   y = (100 - 120) / 240 = -0.083333...
    let out = r
        .eval_expression(
            "",
            "(gl_FragCoord.xy - 0.5 * iResolution.xy) / iResolution.y",
            &i,
        )
        .expect("fragcoord eval");
    assert_eq!(out.type_name, "vec2");
    approx(out.components[0], -0.5);
    approx(out.components[1], -20.0 / 240.0);
}

#[test]
fn preamble_variables_are_in_scope() {
    let Some(r) = try_renderer() else { return };
    let out = r
        .eval_expression("vec2 a = vec2(3.0, 4.0);", "length(a)", &inputs())
        .expect("preamble eval");
    assert_eq!(out.type_name, "float");
    approx(out.components[0], 5.0);
}

#[test]
fn negative_and_large_values_round_trip() {
    // Confirms the float target preserves values outside [0,1] (the whole
    // reason for Rgba32Float instead of the RGBA8 render path).
    let Some(r) = try_renderer() else { return };
    let out = r.eval_expression("", "vec2(-3.5, 1000.0)", &inputs()).unwrap();
    approx(out.components[0], -3.5);
    approx(out.components[1], 1000.0);
}

#[test]
fn invalid_expression_errors() {
    let Some(r) = try_renderer() else { return };
    let err = r.eval_expression("", "length(", &inputs()).expect_err("should fail");
    assert!(matches!(err, luxel_render::RenderError::ShaderCompile(_)));
}
