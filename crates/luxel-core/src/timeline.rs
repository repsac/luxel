use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Frame-based timeline. `iTime` and `iFrame` uniforms passed to the shader
/// are derived from this state: `iFrame = currentFrame` and
/// `iTime = currentFrame / targetFps`.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub struct TimelineState {
    #[serde(rename = "firstFrame")]
    pub first_frame: i32,
    #[serde(rename = "lastFrame")]
    pub last_frame: i32,
    #[serde(rename = "currentFrame")]
    pub current_frame: i32,
    #[serde(rename = "targetFps")]
    pub target_fps: f32,
}

impl Default for TimelineState {
    fn default() -> Self {
        Self {
            first_frame: 0,
            last_frame: 240,
            current_frame: 0,
            target_fps: 60.0,
        }
    }
}

#[derive(Debug, Error, PartialEq)]
pub enum TimelineError {
    #[error("firstFrame must be <= lastFrame")]
    InvertedRange,
    #[error("targetFps must be > 0 and finite")]
    InvalidFps,
}

impl TimelineState {
    pub fn validate(&self) -> Result<(), TimelineError> {
        if self.first_frame > self.last_frame {
            return Err(TimelineError::InvertedRange);
        }
        if !(self.target_fps.is_finite() && self.target_fps > 0.0) {
            return Err(TimelineError::InvalidFps);
        }
        Ok(())
    }

    /// Clamp the current frame into [first_frame, last_frame].
    pub fn clamp_current(&self) -> i32 {
        self.current_frame
            .clamp(self.first_frame, self.last_frame)
    }

    /// Time in seconds corresponding to the current frame at the target rate.
    pub fn current_time_seconds(&self) -> f32 {
        if self.target_fps <= 0.0 {
            0.0
        } else {
            self.current_frame as f32 / self.target_fps
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_validates() {
        TimelineState::default().validate().unwrap();
    }

    #[test]
    fn inverted_range_fails() {
        let t = TimelineState {
            first_frame: 50,
            last_frame: 10,
            ..TimelineState::default()
        };
        assert_eq!(t.validate(), Err(TimelineError::InvertedRange));
    }

    #[test]
    fn nonpositive_fps_fails() {
        let mut t = TimelineState::default();
        t.target_fps = 0.0;
        assert_eq!(t.validate(), Err(TimelineError::InvalidFps));
        t.target_fps = -1.0;
        assert_eq!(t.validate(), Err(TimelineError::InvalidFps));
        t.target_fps = f32::NAN;
        assert_eq!(t.validate(), Err(TimelineError::InvalidFps));
    }

    #[test]
    fn current_time_is_frame_over_fps() {
        let t = TimelineState {
            current_frame: 60,
            target_fps: 30.0,
            ..TimelineState::default()
        };
        assert!((t.current_time_seconds() - 2.0).abs() < 1.0e-6);
    }

    #[test]
    fn clamp_current_respects_bounds() {
        let mut t = TimelineState {
            first_frame: 10,
            last_frame: 20,
            current_frame: 5,
            ..TimelineState::default()
        };
        assert_eq!(t.clamp_current(), 10);
        t.current_frame = 25;
        assert_eq!(t.clamp_current(), 20);
        t.current_frame = 15;
        assert_eq!(t.clamp_current(), 15);
    }
}
