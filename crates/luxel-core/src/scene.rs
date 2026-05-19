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
        Self::ShadertoyFragmentV1
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
            source: DEFAULT_GLSL.to_string(),
            entry_point: "mainImage".to_string(),
            compatibility: ShaderCompatibility::ShadertoyFragmentV1,
        }
    }
}

pub const DEFAULT_GLSL: &str = r#"void mainImage(out vec4 fragColor, in vec2 fragCoord)
{
    vec2 uv = fragCoord / iResolution.xy;
    vec3 color = vec3(uv.x, uv.y, 0.35 + 0.25 * sin(iTime));
    fragColor = vec4(color, 1.0);
}
"#;

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
}
