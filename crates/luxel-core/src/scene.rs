use serde::{Deserialize, Serialize};

use crate::{CameraBookmark, CameraState, LayoutState, RenderSettings, TimelineState};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ShaderLanguage {
    Glsl,
}

impl Default for ShaderLanguage {
    fn default() -> Self {
        Self::Glsl
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ShaderCompatibility {
    /// Shadertoy convention: user writes `mainImage(out vec4, in vec2)` and
    /// the prelude wraps it in a generated `void main()`.
    #[serde(rename = "shadertoy-fragment-v1")]
    ShadertoyFragmentV1,
    /// Raw GLSL 450 fragment shader: user writes their own `void main()` and
    /// writes to the prelude-provided `outColor`. Uniforms and the
    /// `v_uv` input are still injected.
    #[serde(rename = "raw-fragment-v1")]
    RawFragmentV1,
}

impl Default for ShaderCompatibility {
    fn default() -> Self {
        // Raw GLSL is the default: most developers approaching Luxel from
        // outside the shader-art community expect `void main()` semantics.
        // Shadertoy mode remains a first-class alternative via the editor
        // header's compatibility picker.
        Self::RawFragmentV1
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ShaderSource {
    pub language: ShaderLanguage,
    pub source: String,
    #[serde(rename = "entryPoint")]
    pub entry_point: String,
    pub compatibility: ShaderCompatibility,
}

impl Default for ShaderSource {
    fn default() -> Self {
        Self {
            language: ShaderLanguage::Glsl,
            source: DEFAULT_GLSL_RAW.to_string(),
            entry_point: "main".to_string(),
            compatibility: ShaderCompatibility::RawFragmentV1,
        }
    }
}

/// Default raw-GLSL shader source — a simple time-driven UV gradient written
/// in `void main()` style. Used by `Scene::default()` and by `New Scene`.
pub const DEFAULT_GLSL_RAW: &str = r#"// Raw GLSL — you own main(). The prelude supplies:
//   in  vec2 v_uv;        // [0,0] bottom-left, [1,1] top-right
//   out vec4 outColor;
//   + uniforms (iResolution, iTime, iCameraPosition, ...)

void main() {
    vec2 uv = v_uv;
    outColor = vec4(uv.x, uv.y, 0.35 + 0.25 * sin(iTime), 1.0);
}
"#;

/// Equivalent Shadertoy-style default — used when the user explicitly switches
/// the empty scene back to Shadertoy mode.
pub const DEFAULT_GLSL_SHADERTOY: &str = r#"void mainImage(out vec4 fragColor, in vec2 fragCoord)
{
    vec2 uv = fragCoord / iResolution.xy;
    vec3 color = vec3(uv.x, uv.y, 0.35 + 0.25 * sin(iTime));
    fragColor = vec4(color, 1.0);
}
"#;

/// Back-compat alias for code that referenced the old single constant.
pub const DEFAULT_GLSL: &str = DEFAULT_GLSL_RAW;

/// POC: a single manipulable object transform, driven by the move gizmo in
/// the render view and exposed to shaders as the `iObjectPosition` uniform.
///
/// Move-only for now (a `vec3` offset). Rotation/scale would extend this to a
/// full transform plus a `mat4` uniform; the gizmo and shader convention would
/// grow accordingly. Kept additive (`#[serde(default)]` on the Scene field) so
/// it doesn't require a schema bump while it's still proof-of-concept.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub struct ObjectTransform {
    pub position: [f32; 3],
}

impl Default for ObjectTransform {
    fn default() -> Self {
        Self {
            position: [0.0, 0.0, 0.0],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Scene {
    pub name: String,
    pub shader: ShaderSource,
    #[serde(rename = "renderSettings")]
    pub render_settings: RenderSettings,
    pub camera: CameraState,
    #[serde(rename = "cameraBookmarks")]
    pub camera_bookmarks: Vec<CameraBookmark>,
    pub layout: LayoutState,
    /// Frame-based timeline (`firstFrame`, `lastFrame`, `currentFrame`,
    /// `targetFps`). Persisted so a scene reopens at the same playhead.
    #[serde(default)]
    pub timeline: TimelineState,
    /// POC move-gizmo object transform, exposed as `iObjectPosition`.
    /// Additive + defaulted so older scenes (and ones authored before this
    /// feature) load with the object at the origin.
    #[serde(default)]
    pub object: ObjectTransform,
}

impl Default for Scene {
    fn default() -> Self {
        Self {
            name: "Untitled Shader Scene".to_string(),
            shader: ShaderSource::default(),
            render_settings: RenderSettings::default(),
            camera: CameraState::default(),
            camera_bookmarks: vec![CameraBookmark::default_bookmark()],
            layout: LayoutState::default(),
            timeline: TimelineState::default(),
            object: ObjectTransform::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SceneFile {
    #[serde(rename = "schemaVersion")]
    pub schema_version: u32,
    #[serde(rename = "appVersion")]
    pub app_version: String,
    pub scene: Scene,
}

impl Default for SceneFile {
    fn default() -> Self {
        Self {
            schema_version: crate::SCHEMA_VERSION,
            app_version: crate::APP_VERSION.to_string(),
            scene: Scene::default(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_scene_file_round_trips() {
        let f = SceneFile::default();
        let s = serde_json::to_string_pretty(&f).unwrap();
        let f2: SceneFile = serde_json::from_str(&s).unwrap();
        assert_eq!(f, f2);
    }

    #[test]
    fn default_scene_has_default_bookmark() {
        let s = Scene::default();
        assert_eq!(s.camera_bookmarks.len(), 1);
        assert_eq!(s.camera_bookmarks[0].id, "default");
    }

    #[test]
    fn default_compatibility_is_raw() {
        assert_eq!(
            ShaderCompatibility::default(),
            ShaderCompatibility::RawFragmentV1
        );
    }

    #[test]
    fn default_shader_source_is_raw_main() {
        let src = ShaderSource::default();
        assert_eq!(src.compatibility, ShaderCompatibility::RawFragmentV1);
        assert_eq!(src.entry_point, "main");
        // The default source must declare a `void main()` — anything else
        // would fail to compile under the raw prelude.
        assert!(
            src.source.contains("void main()"),
            "default source missing main(): {}",
            src.source
        );
    }

    #[test]
    fn shadertoy_default_template_uses_main_image() {
        // The Shadertoy default template is what the editor's compatibility
        // picker drops in when the user flips back to Shadertoy mode; it
        // must use the `mainImage` entry point.
        assert!(
            DEFAULT_GLSL_SHADERTOY.contains("void mainImage("),
            "Shadertoy default template missing mainImage: {}",
            DEFAULT_GLSL_SHADERTOY
        );
        assert!(!DEFAULT_GLSL_SHADERTOY.contains("void main()"));
    }

    #[test]
    fn raw_default_uses_outcolor_not_fragcolor() {
        // Quick guard so a stray refactor doesn't ship a raw template that
        // assigns to `fragColor` (which only exists in Shadertoy mode).
        assert!(DEFAULT_GLSL_RAW.contains("outColor"));
        assert!(!DEFAULT_GLSL_RAW.contains("fragColor"));
    }

    #[test]
    fn raw_and_shadertoy_compatibilities_serialize_with_expected_strings() {
        assert_eq!(
            serde_json::to_string(&ShaderCompatibility::ShadertoyFragmentV1).unwrap(),
            "\"shadertoy-fragment-v1\""
        );
        assert_eq!(
            serde_json::to_string(&ShaderCompatibility::RawFragmentV1).unwrap(),
            "\"raw-fragment-v1\""
        );
    }
}
