//! Luxel core: scene model, camera, layout, validation.

pub mod bookmarks;
pub mod camera;
pub mod layout;
pub mod scene;
pub mod settings;
pub mod timeline;
pub mod validation;

pub use bookmarks::CameraBookmark;
pub use camera::{CameraError, CameraState};
pub use layout::{
    LayoutShape, LayoutSizes, LayoutState, PanelState, SlotState, ViewId,
};
pub use scene::{Scene, SceneFile, ShaderCompatibility, ShaderLanguage, ShaderSource};
pub use settings::{AspectRatio, AspectRatioError, RenderMode, RenderSettings};
pub use timeline::{TimelineError, TimelineState};
pub use validation::{validate_scene, ValidationError};

/// Bump this when the on-disk scene format changes.
///
/// v1 → v2: per-view panels (`panels.render/editor/console`) replaced by an
///   anonymous slot-based layout (`slots: { topLeft, topRight, bottom }`).
/// v2 → v3: slot-based layout generalized into `LayoutShape` with an indexed
///   `slots: Vec<...>`. Scene gains a frame-based `timeline` section.
pub const SCHEMA_VERSION: u32 = 3;

/// App version baked into saved scene files.
pub const APP_VERSION: &str = env!("CARGO_PKG_VERSION");
