//! Scene file migrations.
//!
//! Each step migrates JSON in place from version N to N+1. The function is
//! defensive: only touch fields that are present, and never error on
//! "extra" fields that the future schema may have introduced.

use luxel_core::SCHEMA_VERSION;
use serde_json::{json, Value};
use thiserror::Error;

#[derive(Debug, Error, PartialEq)]
pub enum MigrationError {
    #[error("scene file schemaVersion is missing")]
    MissingVersion,
    #[error("schemaVersion must be a positive integer")]
    NonIntegerVersion,
    #[error("schemaVersion {0} is newer than supported version {1}")]
    UnsupportedFutureVersion(u32, u32),
}

/// Bring a raw scene file JSON value forward to the current schema version.
pub fn migrate_to_current(value: &mut Value) -> Result<(), MigrationError> {
    let mut version = value
        .get("schemaVersion")
        .ok_or(MigrationError::MissingVersion)?
        .as_u64()
        .ok_or(MigrationError::NonIntegerVersion)? as u32;

    if version == 0 {
        return Err(MigrationError::MissingVersion);
    }
    if version > SCHEMA_VERSION {
        return Err(MigrationError::UnsupportedFutureVersion(
            version,
            SCHEMA_VERSION,
        ));
    }

    while version < SCHEMA_VERSION {
        match version {
            1 => migrate_v1_to_v2(value),
            other => {
                // Unknown intermediate — should never happen because version is
                // bounded above. Bail rather than loop forever.
                return Err(MigrationError::UnsupportedFutureVersion(
                    other,
                    SCHEMA_VERSION,
                ));
            }
        }
        version += 1;
        if let Some(obj) = value.as_object_mut() {
            obj.insert("schemaVersion".into(), Value::from(version));
        }
    }
    Ok(())
}

/// v1 had `scene.layout = { maximizedView, panels: { render, editor, console } }`
/// where each panel had `{ visible, size }`. v2 turns this into a slot-based
/// layout: `{ slots: { topLeft, topRight, bottom }, sizes, maximized }`.
///
/// The migration preserves the user's view-to-place mapping by default:
/// render → topLeft, editor → topRight, console → bottom. Sizes are translated
/// into the new `bottomFraction` + `topLeftFraction` fields when reasonable.
fn migrate_v1_to_v2(value: &mut Value) {
    let layout = match value
        .get_mut("scene")
        .and_then(|s| s.get_mut("layout"))
    {
        Some(l) => l,
        None => return,
    };

    let layout_obj = match layout.as_object() {
        Some(o) => o.clone(),
        None => return,
    };

    let maximized = match layout_obj.get("maximizedView").and_then(|v| v.as_str()) {
        Some("render") => Some("topLeft"),
        Some("editor") => Some("topRight"),
        Some("console") => Some("bottom"),
        _ => None,
    };

    let panels = layout_obj.get("panels").cloned().unwrap_or_else(|| json!({}));
    let render_panel = panels.get("render").cloned();
    let editor_panel = panels.get("editor").cloned();
    let console_panel = panels.get("console").cloned();

    let render_visible = render_panel
        .as_ref()
        .and_then(|v| v.get("visible"))
        .and_then(|v| v.as_bool())
        .unwrap_or(true);
    let editor_visible = editor_panel
        .as_ref()
        .and_then(|v| v.get("visible"))
        .and_then(|v| v.as_bool())
        .unwrap_or(true);
    let console_visible = console_panel
        .as_ref()
        .and_then(|v| v.get("visible"))
        .and_then(|v| v.as_bool())
        .unwrap_or(true);

    // Old sizes were independent fractions per panel (rough proportional hints
    // rather than strictly normalized). Map them to the new normalized fields
    // with conservative defaults.
    let console_size = console_panel
        .as_ref()
        .and_then(|v| v.get("size"))
        .and_then(|v| v.as_f64())
        .map(|x| x.clamp(0.05, 0.6) as f32)
        .unwrap_or(0.25);
    let render_size = render_panel
        .as_ref()
        .and_then(|v| v.get("size"))
        .and_then(|v| v.as_f64())
        .unwrap_or(0.5);
    let editor_size = editor_panel
        .as_ref()
        .and_then(|v| v.get("size"))
        .and_then(|v| v.as_f64())
        .unwrap_or(0.5);
    // Normalize the two top-row entries into a left fraction.
    let denom = (render_size + editor_size).max(1.0e-6);
    let top_left_fraction = (render_size / denom).clamp(0.1, 0.9) as f32;

    let new_layout = json!({
        "slots": {
            "topLeft": { "view": "render", "visible": render_visible },
            "topRight": { "view": "editor", "visible": editor_visible },
            "bottom": { "view": "console", "visible": console_visible },
        },
        "sizes": {
            "bottomFraction": console_size,
            "topLeftFraction": top_left_fraction,
        },
        "maximized": maximized,
    });

    if let Some(layout_obj) = layout.as_object_mut() {
        layout_obj.clear();
        if let Some(new_obj) = new_layout.as_object() {
            for (k, v) in new_obj {
                layout_obj.insert(k.clone(), v.clone());
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn current_version_is_noop() {
        let mut v = json!({"schemaVersion": SCHEMA_VERSION});
        migrate_to_current(&mut v).unwrap();
        assert_eq!(v["schemaVersion"], SCHEMA_VERSION);
    }

    #[test]
    fn future_version_rejected() {
        let mut v = json!({"schemaVersion": SCHEMA_VERSION + 1});
        assert_eq!(
            migrate_to_current(&mut v).unwrap_err(),
            MigrationError::UnsupportedFutureVersion(SCHEMA_VERSION + 1, SCHEMA_VERSION)
        );
    }

    #[test]
    fn missing_version_rejected() {
        let mut v = json!({});
        assert_eq!(
            migrate_to_current(&mut v).unwrap_err(),
            MigrationError::MissingVersion
        );
    }

    #[test]
    fn v1_layout_migrates_to_slots() {
        let mut v = json!({
            "schemaVersion": 1,
            "scene": {
                "layout": {
                    "maximizedView": "editor",
                    "panels": {
                        "render": { "visible": true, "size": 0.4 },
                        "editor": { "visible": true, "size": 0.6 },
                        "console": { "visible": true, "size": 0.2 }
                    }
                }
            }
        });
        migrate_to_current(&mut v).unwrap();
        assert_eq!(v["schemaVersion"], SCHEMA_VERSION);
        let layout = &v["scene"]["layout"];
        assert_eq!(layout["slots"]["topLeft"]["view"], "render");
        assert_eq!(layout["slots"]["topRight"]["view"], "editor");
        assert_eq!(layout["slots"]["bottom"]["view"], "console");
        assert_eq!(layout["maximized"], "topRight");
        let left = layout["sizes"]["topLeftFraction"].as_f64().unwrap();
        assert!((left - 0.4).abs() < 1e-4, "got {left}");
        let bottom = layout["sizes"]["bottomFraction"].as_f64().unwrap();
        assert!((bottom - 0.2).abs() < 1e-4, "got {bottom}");
    }
}
