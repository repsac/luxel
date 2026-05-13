use thiserror::Error;

use crate::{CameraError, SceneFile, TimelineError, SCHEMA_VERSION};

#[derive(Debug, Error, PartialEq)]
pub enum ValidationError {
    #[error("scene schemaVersion is missing or 0")]
    MissingSchemaVersion,
    #[error("scene schemaVersion {0} is newer than supported version {1}")]
    UnsupportedFutureVersion(u32, u32),
    #[error("render width must be between 16 and 16384, got {0}")]
    RenderWidth(u32),
    #[error("render height must be between 16 and 16384, got {0}")]
    RenderHeight(u32),
    #[error("shader source must not be empty")]
    EmptyShaderSource,
    #[error("shader entry point must not be empty")]
    EmptyEntryPoint,
    #[error("camera: {0}")]
    Camera(#[from] CameraError),
    #[error("timeline: {0}")]
    Timeline(#[from] TimelineError),
    #[error("bookmark id '{0}' is duplicated")]
    DuplicateBookmarkId(String),
    #[error("layout has {0} slots but shape requires {1}")]
    LayoutSlotCount(usize, usize),
}

pub fn validate_scene(file: &SceneFile) -> Result<(), ValidationError> {
    if file.schema_version == 0 {
        return Err(ValidationError::MissingSchemaVersion);
    }
    if file.schema_version > SCHEMA_VERSION {
        return Err(ValidationError::UnsupportedFutureVersion(
            file.schema_version,
            SCHEMA_VERSION,
        ));
    }
    let rs = &file.scene.render_settings;
    if !(16..=16384).contains(&rs.width) {
        return Err(ValidationError::RenderWidth(rs.width));
    }
    if !(16..=16384).contains(&rs.height) {
        return Err(ValidationError::RenderHeight(rs.height));
    }
    if file.scene.shader.source.trim().is_empty() {
        return Err(ValidationError::EmptyShaderSource);
    }
    if file.scene.shader.entry_point.trim().is_empty() {
        return Err(ValidationError::EmptyEntryPoint);
    }
    file.scene.camera.validate()?;
    file.scene.timeline.validate()?;

    let expected_slots = file.scene.layout.shape.slot_count();
    let actual_slots = file.scene.layout.slots.len();
    if actual_slots != expected_slots {
        return Err(ValidationError::LayoutSlotCount(actual_slots, expected_slots));
    }

    let mut seen = std::collections::HashSet::new();
    for b in &file.scene.camera_bookmarks {
        if !seen.insert(b.id.as_str()) {
            return Err(ValidationError::DuplicateBookmarkId(b.id.clone()));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{CameraBookmark, Scene};

    #[test]
    fn default_scene_validates() {
        validate_scene(&SceneFile::default()).unwrap();
    }

    #[test]
    fn missing_schema_version_rejected() {
        let mut f = SceneFile::default();
        f.schema_version = 0;
        assert_eq!(
            validate_scene(&f).unwrap_err(),
            ValidationError::MissingSchemaVersion
        );
    }

    #[test]
    fn future_version_rejected() {
        let mut f = SceneFile::default();
        f.schema_version = SCHEMA_VERSION + 1;
        match validate_scene(&f).unwrap_err() {
            ValidationError::UnsupportedFutureVersion(got, sup) => {
                assert_eq!(got, SCHEMA_VERSION + 1);
                assert_eq!(sup, SCHEMA_VERSION);
            }
            other => panic!("unexpected error: {other:?}"),
        }
    }

    #[test]
    fn empty_shader_rejected() {
        let mut f = SceneFile::default();
        f.scene.shader.source = "   \n".to_string();
        assert_eq!(
            validate_scene(&f).unwrap_err(),
            ValidationError::EmptyShaderSource
        );
    }

    #[test]
    fn duplicate_bookmark_rejected() {
        let mut s = Scene::default();
        s.camera_bookmarks.push(CameraBookmark::default_bookmark());
        let f = SceneFile {
            scene: s,
            ..SceneFile::default()
        };
        match validate_scene(&f).unwrap_err() {
            ValidationError::DuplicateBookmarkId(id) => assert_eq!(id, "default"),
            other => panic!("unexpected: {other:?}"),
        }
    }
}
