//! Frustum / aspect-ratio overlay geometry.
//!
//! The overlay itself is drawn by the frontend on top of the rendered image,
//! but the math lives here so it can be tested and reused.

use luxel_core::AspectRatio;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub struct OverlayRect {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

/// Compute a centered rectangle inside `(viewport_w, viewport_h)` that
/// preserves the requested aspect ratio.
pub fn fit_overlay(viewport_w: f32, viewport_h: f32, aspect: AspectRatio) -> OverlayRect {
    let (w, h) = aspect.fit_inside(viewport_w, viewport_h);
    OverlayRect {
        x: (viewport_w - w) * 0.5,
        y: (viewport_h - h) * 0.5,
        width: w,
        height: h,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn overlay_is_centered() {
        let r = fit_overlay(1920.0, 1080.0, AspectRatio::new(16, 9));
        assert!((r.x - 0.0).abs() < 1e-3);
        assert!((r.y - 0.0).abs() < 1e-3);
        assert!((r.width - 1920.0).abs() < 1e-3);
        assert!((r.height - 1080.0).abs() < 1e-3);
    }

    #[test]
    fn overlay_letterboxes_when_viewport_is_wider() {
        let r = fit_overlay(2000.0, 1000.0, AspectRatio::new(16, 9));
        let expected_w = 1000.0_f32 * 16.0 / 9.0;
        assert!((r.width - expected_w).abs() < 1e-3);
        assert!((r.height - 1000.0).abs() < 1e-3);
        assert!(r.x > 0.0);
    }

    #[test]
    fn overlay_pillarboxes_when_viewport_is_taller() {
        let r = fit_overlay(1000.0, 2000.0, AspectRatio::new(16, 9));
        let expected_h = 1000.0_f32 / (16.0 / 9.0);
        assert!((r.height - expected_h).abs() < 1e-3);
        assert!(r.y > 0.0);
    }
}
