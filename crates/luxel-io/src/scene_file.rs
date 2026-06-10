use std::path::Path;

use luxel_core::{SceneFile, ValidationError, validate_scene};
use thiserror::Error;

use crate::migrations::{MigrationError, migrate_to_current};

#[derive(Debug, Error)]
pub enum SceneFileError {
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("json parse error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("migration error: {0}")]
    Migration(#[from] MigrationError),
    #[error("validation error: {0}")]
    Validation(#[from] ValidationError),
}

/// Parse a scene file from a JSON string, running migrations and validation.
pub fn parse_scene_file(text: &str) -> Result<SceneFile, SceneFileError> {
    let mut value: serde_json::Value = serde_json::from_str(text)?;
    migrate_to_current(&mut value)?;
    let file: SceneFile = serde_json::from_value(value)?;
    validate_scene(&file)?;
    Ok(file)
}

/// Serialize a validated scene file to JSON.
pub fn serialize_scene_file(file: &SceneFile) -> Result<String, SceneFileError> {
    validate_scene(file)?;
    Ok(serde_json::to_string_pretty(file)?)
}

/// Load a scene from a path on disk.
pub fn load_scene_file<P: AsRef<Path>>(path: P) -> Result<SceneFile, SceneFileError> {
    let text = std::fs::read_to_string(path)?;
    parse_scene_file(&text)
}

/// Save a scene to a path on disk.
pub fn save_scene_file<P: AsRef<Path>>(path: P, file: &SceneFile) -> Result<(), SceneFileError> {
    let text = serialize_scene_file(file)?;
    std::fs::write(path, text)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip_default_scene() {
        let f = SceneFile::default();
        let text = serialize_scene_file(&f).unwrap();
        let f2 = parse_scene_file(&text).unwrap();
        assert_eq!(f, f2);
    }

    #[test]
    fn round_trip_preserves_shader_source() {
        let mut f = SceneFile::default();
        let unusual = "void mainImage(out vec4 c, in vec2 p){ c = vec4(0.0); }\n// tail comment\n";
        f.scene.shader.source = unusual.to_string();
        let text = serialize_scene_file(&f).unwrap();
        let f2 = parse_scene_file(&text).unwrap();
        assert_eq!(f2.scene.shader.source, unusual);
    }

    #[test]
    fn parsing_missing_version_fails() {
        let mut v = serde_json::to_value(SceneFile::default()).unwrap();
        v.as_object_mut().unwrap().remove("schemaVersion");
        let text = serde_json::to_string(&v).unwrap();
        let err = parse_scene_file(&text).unwrap_err();
        assert!(matches!(
            err,
            SceneFileError::Migration(MigrationError::MissingVersion)
        ));
    }

    #[test]
    fn write_then_read_through_disk() {
        let dir = std::env::temp_dir().join("luxel-io-test");
        let _ = std::fs::create_dir_all(&dir);
        let path = dir.join("scene.luxel.json");
        let f = SceneFile::default();
        save_scene_file(&path, &f).unwrap();
        let loaded = load_scene_file(&path).unwrap();
        assert_eq!(f, loaded);
    }
}
