use serde::{Deserialize, Serialize};
use std::fmt;
use std::str::FromStr;
use thiserror::Error;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RenderMode {
    SingleFrame,
}

impl Default for RenderMode {
    fn default() -> Self {
        Self::SingleFrame
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AspectRatio {
    pub num: u32,
    pub den: u32,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum AspectRatioError {
    #[error("aspect ratio must be 'W:H' with positive integers")]
    Syntax,
    #[error("aspect ratio components must be positive non-zero integers")]
    NonPositive,
}

impl AspectRatio {
    pub const fn new(num: u32, den: u32) -> Self {
        Self { num, den }
    }

    pub fn as_f32(&self) -> f32 {
        self.num as f32 / self.den as f32
    }

    /// Fit the largest rectangle with this aspect ratio inside (viewport_w, viewport_h).
    /// Returns (width, height) of the inset rect.
    pub fn fit_inside(&self, viewport_w: f32, viewport_h: f32) -> (f32, f32) {
        let target = self.as_f32();
        let viewport_aspect = viewport_w / viewport_h;
        if viewport_aspect > target {
            // viewport wider than target; clamp width
            let h = viewport_h;
            let w = h * target;
            (w, h)
        } else {
            let w = viewport_w;
            let h = w / target;
            (w, h)
        }
    }
}

impl Default for AspectRatio {
    fn default() -> Self {
        Self::new(16, 9)
    }
}

impl fmt::Display for AspectRatio {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}:{}", self.num, self.den)
    }
}

impl FromStr for AspectRatio {
    type Err = AspectRatioError;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let s = s.trim();
        let (n, d) = s.split_once(':').ok_or(AspectRatioError::Syntax)?;
        let num: u32 = n.trim().parse().map_err(|_| AspectRatioError::Syntax)?;
        let den: u32 = d.trim().parse().map_err(|_| AspectRatioError::Syntax)?;
        if num == 0 || den == 0 {
            return Err(AspectRatioError::NonPositive);
        }
        Ok(Self::new(num, den))
    }
}

impl Serialize for AspectRatio {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

impl<'de> Deserialize<'de> for AspectRatio {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let s = String::deserialize(d)?;
        s.parse().map_err(serde::de::Error::custom)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RenderSettings {
    pub mode: RenderMode,
    pub width: u32,
    pub height: u32,
    #[serde(rename = "aspectRatio")]
    pub aspect_ratio: AspectRatio,
    #[serde(rename = "showFrustumOverlay")]
    pub show_frustum_overlay: bool,
}

impl Default for RenderSettings {
    fn default() -> Self {
        Self {
            mode: RenderMode::SingleFrame,
            width: 1280,
            height: 720,
            aspect_ratio: AspectRatio::default(),
            // Off by default — most of the time the user just wants to see
            // the rendered image without the dashed guide rectangle. The
            // toggle remains in AspectRatioControl; the frontend remembers
            // the user's last choice via localStorage.
            show_frustum_overlay: false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_common_ratios() {
        for (s, n, d) in [("16:9", 16, 9), ("4:3", 4, 3), ("1:1", 1, 1), ("21:9", 21, 9)] {
            let a: AspectRatio = s.parse().unwrap();
            assert_eq!(a, AspectRatio::new(n, d));
        }
    }

    #[test]
    fn parse_custom_with_whitespace() {
        let a: AspectRatio = "  3 : 2 ".parse().unwrap();
        assert_eq!(a, AspectRatio::new(3, 2));
    }

    #[test]
    fn parse_rejects_invalid() {
        assert!("16x9".parse::<AspectRatio>().is_err());
        assert!("16:".parse::<AspectRatio>().is_err());
        assert!(":9".parse::<AspectRatio>().is_err());
        assert!("a:b".parse::<AspectRatio>().is_err());
    }

    #[test]
    fn parse_rejects_zero() {
        assert_eq!(
            "0:9".parse::<AspectRatio>().unwrap_err(),
            AspectRatioError::NonPositive
        );
        assert_eq!(
            "9:0".parse::<AspectRatio>().unwrap_err(),
            AspectRatioError::NonPositive
        );
    }

    #[test]
    fn fit_inside_preserves_ratio_and_fits() {
        let a = AspectRatio::new(16, 9);
        let (w, h) = a.fit_inside(800.0, 600.0);
        assert!(w <= 800.0 + 1e-3 && h <= 600.0 + 1e-3);
        assert!(((w / h) - (16.0 / 9.0)).abs() < 1e-3);
        let (w, h) = a.fit_inside(1920.0, 1080.0);
        assert!((w - 1920.0).abs() < 1e-3 && (h - 1080.0).abs() < 1e-3);
    }

    #[test]
    fn serde_round_trip_via_string() {
        let s = serde_json::to_string(&AspectRatio::new(21, 9)).unwrap();
        assert_eq!(s, "\"21:9\"");
        let a: AspectRatio = serde_json::from_str(&s).unwrap();
        assert_eq!(a, AspectRatio::new(21, 9));
    }

    #[test]
    fn default_frustum_overlay_is_off() {
        // The frustum overlay defaults off so a fresh scene doesn't ship with
        // a dashed rectangle drawn over the render. The user can opt in via
        // the AspectRatioControl checkbox; that preference is persisted on
        // the frontend side via localStorage.
        let rs = RenderSettings::default();
        assert!(
            !rs.show_frustum_overlay,
            "expected showFrustumOverlay = false by default"
        );
    }

    #[test]
    fn default_render_size_and_aspect_are_sane() {
        // Lightweight regression guard so a stray default refactor can't
        // ship a 0×0 render size or break the aspect default.
        let rs = RenderSettings::default();
        assert!(rs.width >= 16);
        assert!(rs.height >= 16);
        assert_eq!(rs.aspect_ratio, AspectRatio::new(16, 9));
    }
}
