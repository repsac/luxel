//! GLSL prelude that wraps a Shadertoy-style `mainImage` fragment shader
//! into a complete GLSL 450 fragment shader compatible with wgpu/naga.
//!
//! Public-facing language is GLSL; the prelude is hidden from the user.

use luxel_core::ShaderCompatibility;

/// Generate a complete GLSL 450 fragment shader source string from a user
/// `mainImage(out vec4, in vec2)` Shadertoy-style entry point.
///
/// The prelude is deterministic: given the same input it always returns the
/// same output, which keeps tests stable.
pub fn wrap_shadertoy_fragment(user_source: &str) -> String {
    let mut s = String::with_capacity(user_source.len() + PRELUDE.len() + EPILOGUE.len());
    s.push_str(PRELUDE);
    s.push_str("\n// ---- user shader ----\n");
    s.push_str(user_source);
    if !user_source.ends_with('\n') {
        s.push('\n');
    }
    s.push_str(EPILOGUE);
    s
}

/// Produce wrapped source for a given compatibility profile.
pub fn wrap(user_source: &str, compat: ShaderCompatibility) -> String {
    match compat {
        ShaderCompatibility::ShadertoyFragmentV1 => wrap_shadertoy_fragment(user_source),
    }
}

/// Number of source lines the prelude takes up. Used to map naga error line
/// numbers back to the user's editor coordinates. Keep this in sync with
/// `PRELUDE` below.
pub const PRELUDE_LINE_COUNT: u32 = 20;

const PRELUDE: &str = r#"#version 450
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

const EPILOGUE: &str = r#"
// ---- entry point ----
void main() {
    vec2 fragCoord = v_uv * iResolution.xy;
    vec4 outFrag = vec4(0.0);
    mainImage(outFrag, fragCoord);
    outColor = outFrag;
}
"#;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prelude_is_deterministic() {
        let a = wrap_shadertoy_fragment("void mainImage(out vec4 c, in vec2 p){ c = vec4(0); }");
        let b = wrap_shadertoy_fragment("void mainImage(out vec4 c, in vec2 p){ c = vec4(0); }");
        assert_eq!(a, b);
    }

    #[test]
    fn user_source_is_preserved() {
        let user = "void mainImage(out vec4 c, in vec2 p){ c = vec4(0.5); }";
        let wrapped = wrap_shadertoy_fragment(user);
        assert!(wrapped.contains(user));
    }

    #[test]
    fn includes_required_uniforms() {
        let wrapped = wrap_shadertoy_fragment("void mainImage(out vec4 c, in vec2 p){}");
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
            assert!(wrapped.contains(u), "prelude missing {u}");
        }
    }

    #[test]
    fn calls_main_image() {
        let wrapped = wrap_shadertoy_fragment("void mainImage(out vec4 c, in vec2 p){}");
        assert!(wrapped.contains("mainImage(outFrag, fragCoord)"));
    }

    #[test]
    fn prelude_line_count_is_accurate() {
        // PRELUDE is followed by a "\n// ---- user shader ----\n" marker which
        // is not counted in PRELUDE_LINE_COUNT; the count covers only the
        // prelude itself. Sanity-check it against the live string so a stray
        // edit can't silently desync error line mapping.
        let actual = PRELUDE.lines().count() as u32;
        assert_eq!(actual, PRELUDE_LINE_COUNT, "PRELUDE_LINE_COUNT is stale; update both");
    }
}
