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
            2 => migrate_v2_to_v3(value),
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

/// v2 → v3:
///   * `layout` becomes shape-driven. The v2 `{ slots: { topLeft, topRight,
///     bottom }, sizes: { bottomFraction, topLeftFraction }, maximized }` maps
///     cleanly to `LayoutShape::TwoTopOneBottom` with
///     `slots: [topLeft, topRight, bottom]` (index 0/1/2), `primary` = top
///     fraction (`1 - bottomFraction`), `secondary` = `topLeftFraction`, and
///     `maximized` rebased to a slot index.
///   * `scene.timeline` is added with sensible defaults if absent — the v2
///     scene didn't have one.
///   * Pre-v3 had a per-slot `visible` flag. Hidden slots collapse to the
///     `empty` view so the new shape still has the right slot count.
fn migrate_v2_to_v3(value: &mut Value) {
    let scene = match value.get_mut("scene").and_then(|s| s.as_object_mut()) {
        Some(s) => s,
        None => return,
    };

    // ---- layout ----
    if let Some(layout) = scene.get("layout").cloned() {
        let new_layout = convert_v2_layout(&layout);
        scene.insert("layout".into(), new_layout);
    }

    // ---- timeline ----
    scene.entry("timeline".to_string()).or_insert_with(|| {
        json!({
            "firstFrame": 0,
            "lastFrame": 240,
            "currentFrame": 0,
            "targetFps": 60.0,
        })
    });
}

fn convert_v2_layout(layout: &Value) -> Value {
    let obj = match layout.as_object() {
        Some(o) => o,
        None => return default_v3_layout(),
    };

    let slots_obj = obj.get("slots").and_then(|v| v.as_object());
    let read_slot = |key: &str, default_view: &str| -> Value {
        if let Some(s) = slots_obj.and_then(|o| o.get(key)) {
            let view = s
                .get("view")
                .and_then(|v| v.as_str())
                .unwrap_or(default_view);
            // Collapse hidden slots to the `empty` view; the shape still
            // requires this slot count.
            let visible = s
                .get("visible")
                .and_then(|v| v.as_bool())
                .unwrap_or(true);
            let final_view = if visible { view } else { "empty" };
            json!({ "view": final_view })
        } else {
            json!({ "view": default_view })
        }
    };

    let slots = vec![
        read_slot("topLeft", "render"),
        read_slot("topRight", "editor"),
        read_slot("bottom", "console"),
    ];

    let sizes_obj = obj.get("sizes").and_then(|v| v.as_object());
    let bottom_fraction = sizes_obj
        .and_then(|o| o.get("bottomFraction"))
        .and_then(|v| v.as_f64())
        .unwrap_or(0.25);
    let top_left_fraction = sizes_obj
        .and_then(|o| o.get("topLeftFraction"))
        .and_then(|v| v.as_f64())
        .unwrap_or(0.55);

    let primary = (1.0 - bottom_fraction).clamp(0.05, 0.95);
    let secondary = top_left_fraction.clamp(0.05, 0.95);

    let maximized = match obj.get("maximized").and_then(|v| v.as_str()) {
        Some("topLeft") => Some(0_usize),
        Some("topRight") => Some(1),
        Some("bottom") => Some(2),
        _ => None,
    };

    json!({
        "shape": "twoTopOneBottom",
        "slots": slots,
        "sizes": { "primary": primary, "secondary": secondary },
        "maximized": maximized,
    })
}

fn default_v3_layout() -> Value {
    json!({
        "shape": "twoTopOneBottom",
        "slots": [
            { "view": "render" },
            { "view": "editor" },
            { "view": "console" }
        ],
        "sizes": { "primary": 0.75, "secondary": 0.55 },
        "maximized": null
    })
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
    fn v1_walks_all_the_way_through_to_current() {
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
        assert_eq!(layout["shape"], "twoTopOneBottom");
        assert_eq!(layout["slots"][0]["view"], "render");
        assert_eq!(layout["slots"][1]["view"], "editor");
        assert_eq!(layout["slots"][2]["view"], "console");
        assert_eq!(layout["maximized"], 1); // "editor" → index 1
        let primary = layout["sizes"]["primary"].as_f64().unwrap();
        assert!((primary - 0.8).abs() < 1e-4, "got {primary}"); // 1 - 0.2
        let secondary = layout["sizes"]["secondary"].as_f64().unwrap();
        assert!((secondary - 0.4).abs() < 1e-4, "got {secondary}");
        // Timeline is defaulted in by v2→v3
        let timeline = &v["scene"]["timeline"];
        assert_eq!(timeline["firstFrame"], 0);
        assert_eq!(timeline["lastFrame"], 240);
        assert_eq!(timeline["currentFrame"], 0);
        let fps = timeline["targetFps"].as_f64().unwrap();
        assert!((fps - 60.0).abs() < 1e-4);
    }

    #[test]
    fn v2_layout_becomes_shape_based() {
        let mut v = json!({
            "schemaVersion": 2,
            "scene": {
                "layout": {
                    "slots": {
                        "topLeft": { "view": "render", "visible": true },
                        "topRight": { "view": "editor", "visible": false },
                        "bottom": { "view": "console", "visible": true }
                    },
                    "sizes": { "bottomFraction": 0.3, "topLeftFraction": 0.6 },
                    "maximized": null
                }
            }
        });
        migrate_to_current(&mut v).unwrap();
        assert_eq!(v["schemaVersion"], SCHEMA_VERSION);
        let layout = &v["scene"]["layout"];
        assert_eq!(layout["shape"], "twoTopOneBottom");
        // Hidden v2 slot collapses to "empty" rather than dropping the slot
        // (the shape still requires three).
        assert_eq!(layout["slots"][0]["view"], "render");
        assert_eq!(layout["slots"][1]["view"], "empty");
        assert_eq!(layout["slots"][2]["view"], "console");
        let primary = layout["sizes"]["primary"].as_f64().unwrap();
        assert!((primary - 0.7).abs() < 1e-4);
        let secondary = layout["sizes"]["secondary"].as_f64().unwrap();
        assert!((secondary - 0.6).abs() < 1e-4);
    }

    #[test]
    fn v2_without_timeline_defaults_it_in() {
        let mut v = json!({ "schemaVersion": 2, "scene": {} });
        migrate_to_current(&mut v).unwrap();
        assert_eq!(v["scene"]["timeline"]["lastFrame"], 240);
    }
}
