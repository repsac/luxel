//! Pinned regression test for naga's accepted GLSL version set.
//!
//! Originally a spike to learn whether `#version 330 core` could feed our
//! prelude (it can't — naga rejects it). The findings are now baked in as a
//! pinning test so a naga bump that changes the supported-version set
//! surfaces here loudly. If you intend to broaden Luxel's accepted GLSL
//! versions, update this test and the `Raw GLSL` documentation in the help
//! modal together.
//!
//! Current state (naga 22):
//!   Accepted: 440, 450, 460
//!   Rejected: every version below 440, ES versions, 410-430
//!
//! Why this matters: the compatibility picker only exposes Shadertoy and
//! Raw GLSL modes precisely because we can't honestly ship a 3.3 mode. If
//! this test starts passing additional versions, we have new options.

use naga::front::glsl::{Frontend, Options as GlslOptions};
use naga::ShaderStage;

/// Minimal body that exercises a uniform block + a fragment output. Anything
/// that *should* be valid in 4.5 — and would surface a frontend-version
/// rejection if 4.5 weren't accepted.
const MINIMAL_BODY: &str = r#"
layout(std140, binding = 0) uniform U {
    vec3 iResolution;
    float iTime;
};

in vec2 v_uv;
layout(location = 0) out vec4 outColor;

void main() {
    outColor = vec4(v_uv, 0.5 + 0.5 * sin(iTime), 1.0);
}
"#;

fn parses(version_directive: &str) -> bool {
    let src = format!("{version_directive}\n{MINIMAL_BODY}");
    Frontend::default()
        .parse(&GlslOptions::from(ShaderStage::Fragment), &src)
        .is_ok()
}

#[test]
fn naga_accepts_440_450_460_only() {
    // These are the versions Luxel can target today.
    for v in ["#version 440", "#version 450", "#version 460"] {
        assert!(parses(v), "expected naga to parse {v}");
    }

    // These are the versions we'd need for a real "GLSL 3.3" picker option
    // (or an ES / Shadertoy-WebGL-style option). They're all rejected — the
    // moment any of them flips to accepted, this test fails and we should
    // reconsider the compatibility-mode lineup.
    let unsupported = [
        "#version 110",
        "#version 130",
        "#version 150 core",
        "#version 300 es",  // WebGL 2 / Shadertoy's actual flavor
        "#version 310 es",
        "#version 330 core",
        "#version 400",
        "#version 420",
        "#version 430",
    ];
    for v in unsupported {
        assert!(
            !parses(v),
            "{v} is now accepted by naga — update the compatibility-mode picker"
        );
    }
}
