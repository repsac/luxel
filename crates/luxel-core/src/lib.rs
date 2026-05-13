//! Luxel core: scene model, camera, layout, validation.

pub mod bookmarks;
pub mod camera;
pub mod layout;
pub mod scene;
pub mod settings;
pub mod validation;

pub use bookmarks::CameraBookmark;
pub use camera::{CameraState, CameraError};
pub use layout::{
    LayoutSizes, LayoutSlots, LayoutState, PanelState, SlotId, SlotState, ViewId,
};
// Bump this when the on-disk scene format changes. v1 used a per-view
// panels record; v2 is slot-based. luxel-io owns the actual migration.
pub const SCHEMA_VERSION: u32 = 2;
pub use scene::{Scene, SceneFile, ShaderCompatibility, ShaderLanguage, ShaderSource};
pub use settings::{AspectRatio, AspectRatioError, RenderMode, RenderSettings};
pub use validation::{ValidationError, validate_scene};

/// App version baked into saved scene files.
pub const APP_VERSION: &str = env!("CARGO_PKG_VERSION");
