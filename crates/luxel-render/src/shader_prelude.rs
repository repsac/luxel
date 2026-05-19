//! GLSL preludes that wrap a user shader into a complete GLSL 450 fragment
//! shader compatible with wgpu/naga.
//!
//! Two flavors:
//!   * `ShadertoyFragmentV1` — the user writes `mainImage(out vec4, in vec2)`,
//!     we generate `void main()` that calls into it. Shadertoy convention.
//!   * `RawFragmentV1` — the user writes their own `void main()` and writes
//!     to the prelude-provided `outColor`. We still inject uniforms and the
//!     `v_uv` input so they get cameras/time for free.
//!
//! Public-facing language is GLSL in both cases; the prelude is hidden.

use luxel_core::ShaderCompatibility;

/// Produce wrapped source for a given compatibility profile.
pub fn wrap(user_source: &str, compat: ShaderCompatibility) -> String {
    match compat {
        ShaderCompatibility::ShadertoyFragmentV1 => wrap_shadertoy_fragment(user_source),
        ShaderCompatibility::RawFragmentV1 => wrap_raw_fragment(user_source),
    }
}

/// Shadertoy `mainImage`-style: inject prelude, then user source, then a
/// generated `void main()` that calls `mainImage`.
pub fn wrap_shadertoy_fragment(user_source: &str) -> String {
    let mut s = String::with_capacity(
        user_source.len() + SHADERTOY_PRELUDE.len() + SHADERTOY_EPILOGUE.len(),
    );
    s.push_str(SHADERTOY_PRELUDE);
    s.push_str("\n// ---- user shader ----\n");
    s.push_str(user_source);
    if !user_source.ends_with('\n') {
        s.push('\n');
    }
    s.push_str(SHADERTOY_EPILOGUE);
    s
}

/// Raw GLSL: emit prelude (uniforms + bindings) and let the user's source
/// stand on its own — they're responsible for `void main()` and writing to
/// `outColor`.
pub fn wrap_raw_fragment(user_source: &str) -> String {
    let mut s = String::with_capacity(user_source.len() + RAW_PRELUDE.len());
    s.push_str(RAW_PRELUDE);
    s.push_str("\n// ---- user shader ----\n");
    s.push_str(user_source);
    if !user_source.ends_with('\n') {
        s.push('\n');
    }
    s
}

/// Number of source lines the prelude takes up for a given compatibility
/// profile. Used to map naga error line numbers back to the user's editor
/// coordinates. Keep these constants in sync with the actual prelude strings.
pub const SHADERTOY_PRELUDE_LINE_COUNT: u32 = 20;
pub const RAW_PRELUDE_LINE_COUNT: u32 = 20;

/// Lines consumed by the prelude (including the trailing
/// `// ---- user shader ----` marker line). Used by the shader compiler to
/// translate naga error lines into user-coordinate lines.
pub fn user_source_line_offset(compat: ShaderCompatibility) -> u32 {
    // Both preludes emit "\n// ---- user shader ----\n" between the prelude
    // body and the user source, so the user's first line lands at
    // prelude_line_count + 2.
    let prelude = match compat {
        ShaderCompatibility::ShadertoyFragmentV1 => SHADERTOY_PRELUDE_LINE_COUNT,
        ShaderCompatibility::RawFragmentV1 => RAW_PRELUDE_LINE_COUNT,
    };
    prelude + 1
}

// ---------------- Shadertoy convention ----------------

const SHADERTOY_PRELUDE: &str = r#"#version 450
precision highp float;

layout(set = 0, binding = 0) uniform LuxelUniforms {
    vec3 iResolution;
    float iTime;
    int iFrame;
    vec4 iMouse;
    // Luxel camera (driven by the viewport mouse / bookmarks).
    // iCameraForward/Right/Up are a right-handed orthonormal basis. Together
    // with iCameraFov (vertical, radians) they fully describe the perspective.
    vec3 iCameraPosition;
    float iCameraFov;
    vec3 iCameraForward;
    vec3 iCameraRight;
    vec3 iCameraUp;
};

layout(location = 0) in vec2 v_uv;
layout(location = 0) out vec4 outColor;
"#;

const SHADERTOY_EPILOGUE: &str = r#"
// ---- entry point ----
void main() {
    vec2 fragCoord = v_uv * iResolution.xy;
    vec4 outFrag = vec4(0.0);
    mainImage(outFrag, fragCoord);
    outColor = outFrag;
}
"#;

// ---------------- Raw GLSL convention ----------------

/// Raw mode: same uniform block, `v_uv` input, and `outColor` output as the
/// Shadertoy prelude, but no generated `main()`. The user writes their own.
const RAW_PRELUDE: &str = r#"#version 450
precision highp float;

layout(set = 0, binding = 0) uniform LuxelUniforms {
    vec3 iResolution;
    float iTime;
    int iFrame;
    vec4 iMouse;
    // Luxel camera (driven by the viewport mouse / bookmarks).
    // iCameraForward/Right/Up are a right-handed orthonormal basis. Together
    // with iCameraFov (vertical, radians) they fully describe the perspective.
    vec3 iCameraPosition;
    float iCameraFov;
    vec3 iCameraForward;
    vec3 iCameraRight;
    vec3 iCameraUp;
};

layout(location = 0) in vec2 v_uv;
layout(location = 0) out vec4 outColor;
"#;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shadertoy_prelude_is_deterministic() {
        let a = wrap_shadertoy_fragment("void mainImage(out vec4 c, in vec2 p){ c = vec4(0); }");
        let b = wrap_shadertoy_fragment("void mainImage(out vec4 c, in vec2 p){ c = vec4(0); }");
        assert_eq!(a, b);
    }

    #[test]
    fn raw_prelude_is_deterministic() {
        let a = wrap_raw_fragment("void main(){ outColor = vec4(1.0); }");
        let b = wrap_raw_fragment("void main(){ outColor = vec4(1.0); }");
        assert_eq!(a, b);
    }

    #[test]
    fn shadertoy_calls_main_image() {
        let wrapped = wrap_shadertoy_fragment("void mainImage(out vec4 c, in vec2 p){}");
        assert!(wrapped.contains("mainImage(outFrag, fragCoord)"));
    }

    #[test]
    fn raw_does_not_inject_main() {
        // The raw prelude must not emit its own `void main()`; that's the
        // user's responsibility. If we accidentally did, a user-supplied main
        // would collide with our injected one at compile time.
        let wrapped = wrap_raw_fragment("void main(){ outColor = vec4(1.0); }");
        let main_decls = wrapped.matches("void main(").count();
        assert_eq!(
            main_decls, 1,
            "raw prelude must not inject its own main(); found {main_decls} declarations"
        );
    }

    #[test]
    fn both_preludes_expose_camera_uniforms() {
        for compat in [
            ShaderCompatibility::ShadertoyFragmentV1,
            ShaderCompatibility::RawFragmentV1,
        ] {
            let wrapped = wrap("", compat);
            for u in [
                "iResolution",
                "iTime",
                "iFrame",
                "iMouse",
                "iCameraPosition",
                "iCameraFov",
                "iCameraForward",
                "iCameraRight",
                "iCameraUp",
            ] {
                assert!(wrapped.contains(u), "{compat:?} prelude missing {u}");
            }
        }
    }

    #[test]
    fn user_source_is_preserved_in_both_modes() {
        let user_st = "void mainImage(out vec4 c, in vec2 p){ c = vec4(0.5); }";
        let user_raw = "void main(){ outColor = vec4(v_uv, 0.0, 1.0); }";
        assert!(wrap_shadertoy_fragment(user_st).contains(user_st));
        assert!(wrap_raw_fragment(user_raw).contains(user_raw));
    }

    #[test]
    fn prelude_line_counts_are_accurate() {
        let actual_shadertoy = SHADERTOY_PRELUDE.lines().count() as u32;
        assert_eq!(
            actual_shadertoy, SHADERTOY_PRELUDE_LINE_COUNT,
            "SHADERTOY_PRELUDE_LINE_COUNT is stale; update both"
        );
        let actual_raw = RAW_PRELUDE.lines().count() as u32;
        assert_eq!(
            actual_raw, RAW_PRELUDE_LINE_COUNT,
            "RAW_PRELUDE_LINE_COUNT is stale; update both"
        );
    }
}
