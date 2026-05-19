//! GLSL fragment shader compilation via naga (GLSL frontend → WGSL output for wgpu).

use luxel_core::{ShaderCompatibility, ShaderSource};
use naga::back::wgsl::WriterFlags;
use naga::front::glsl::{Frontend, Options as GlslOptions};
use naga::valid::{Capabilities, ValidationFlags, Validator};
use naga::ShaderStage;
use serde::{Deserialize, Serialize};

use crate::errors::{ShaderCompileError, ShaderDiagnostic};
use crate::shader_prelude;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ShaderCompileResult {
    /// Whether compilation succeeded.
    pub ok: bool,
    /// Translated WGSL source (only present on success).
    pub wgsl: Option<String>,
    /// Diagnostics from the GLSL frontend / validator.
    pub diagnostics: Vec<ShaderDiagnostic>,
}

/// Compile a user GLSL fragment shader (Shadertoy-style mainImage) into WGSL.
pub fn compile_glsl_fragment(src: &ShaderSource) -> Result<ShaderCompileResult, ShaderCompileError> {
    let wrapped = shader_prelude::wrap(&src.source, src.compatibility);

    let mut frontend = Frontend::default();
    let options = GlslOptions::from(ShaderStage::Fragment);
    let module = match frontend.parse(&options, &wrapped) {
        Ok(m) => m,
        Err(errors) => {
            let prelude_lines = count_lines_before_user(&wrapped) as u32;
            let diagnostics: Vec<ShaderDiagnostic> = errors
                .errors
                .iter()
                .map(|e| {
                    let loc = e.meta.location(&wrapped);
                    let user_line = if loc.line_number > prelude_lines {
                        Some(loc.line_number - prelude_lines)
                    } else {
                        None
                    };
                    ShaderDiagnostic {
                        message: format!("{}", e.kind),
                        line: user_line,
                        column: Some(loc.line_position),
                    }
                })
                .collect();
            return Err(ShaderCompileError { diagnostics });
        }
    };

    let mut validator = Validator::new(ValidationFlags::all(), Capabilities::all());
    let info = match validator.validate(&module) {
        Ok(info) => info,
        Err(err) => {
            return Err(ShaderCompileError {
                diagnostics: vec![ShaderDiagnostic {
                    message: format!("validation error: {}", err),
                    line: None,
                    column: None,
                }],
            });
        }
    };

    let wgsl = match naga::back::wgsl::write_string(&module, &info, WriterFlags::empty()) {
        Ok(s) => s,
        Err(err) => {
            return Err(ShaderCompileError {
                diagnostics: vec![ShaderDiagnostic {
                    message: format!("wgsl emit error: {}", err),
                    line: None,
                    column: None,
                }],
            });
        }
    };

    Ok(ShaderCompileResult {
        ok: true,
        wgsl: Some(wgsl),
        diagnostics: Vec::new(),
    })
}

/// Locate the line marker for the user shader inside the wrapped source so
/// error lines can be mapped back to the user's editor.
fn count_lines_before_user(wrapped: &str) -> usize {
    let marker = "// ---- user shader ----";
    let idx = wrapped.find(marker).unwrap_or(0);
    // +1 for the marker line itself; user source starts on the next line.
    wrapped[..idx].lines().count() + 1
}

/// Convenience for tests/Tauri: compile from a raw source string with default settings.
pub fn compile_default_compat(source: &str) -> Result<ShaderCompileResult, ShaderCompileError> {
    let src = ShaderSource {
        language: luxel_core::ShaderLanguage::Glsl,
        source: source.to_string(),
        entry_point: "mainImage".to_string(),
        compatibility: ShaderCompatibility::ShadertoyFragmentV1,
    };
    compile_glsl_fragment(&src)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_shader_compiles() {
        let r = compile_default_compat(luxel_core::scene::DEFAULT_GLSL).unwrap();
        assert!(r.ok);
        assert!(r.wgsl.is_some());
    }

    #[test]
    fn syntax_error_returns_diagnostic() {
        let bad = "void mainImage(out vec4 c, in vec2 p){ this is not glsl }";
        let err = compile_default_compat(bad).unwrap_err();
        assert!(!err.diagnostics.is_empty());
    }

    #[test]
    fn raw_glsl_main_compiles() {
        // The user owns `main()` in raw mode; the prelude only supplies
        // uniforms, the v_uv input, and the outColor output.
        let src = ShaderSource {
            language: luxel_core::ShaderLanguage::Glsl,
            source: "void main(){ outColor = vec4(v_uv, 0.5 + 0.5 * sin(iTime), 1.0); }"
                .to_string(),
            entry_point: "main".to_string(),
            compatibility: ShaderCompatibility::RawFragmentV1,
        };
        let r = compile_glsl_fragment(&src).expect("raw main shader should compile");
        assert!(r.ok);
        assert!(r.wgsl.is_some());
    }

    #[test]
    fn raw_glsl_syntax_error_returns_diagnostic() {
        let src = ShaderSource {
            language: luxel_core::ShaderLanguage::Glsl,
            source: "void main(){ this is not valid glsl }".to_string(),
            entry_point: "main".to_string(),
            compatibility: ShaderCompatibility::RawFragmentV1,
        };
        let err = compile_glsl_fragment(&src).expect_err("syntax error expected");
        assert!(!err.diagnostics.is_empty());
    }

    #[test]
    fn user_source_is_not_mutated() {
        let src = ShaderSource::default();
        let original = src.source.clone();
        let _ = compile_glsl_fragment(&src);
        assert_eq!(src.source, original);
    }
}
