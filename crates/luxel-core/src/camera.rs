use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Error, PartialEq, Eq)]
pub enum CameraError {
    #[error("camera position and target must not coincide")]
    DegenerateView,
    #[error("camera up vector must not be zero")]
    ZeroUpVector,
    #[error("fovYDegrees must be in (0, 180)")]
    InvalidFov,
    #[error("near plane must be > 0 and < far plane")]
    InvalidClipPlanes,
    #[error("camera vector contains a non-finite value")]
    NonFinite,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub struct CameraState {
    pub position: [f32; 3],
    pub target: [f32; 3],
    pub up: [f32; 3],
    #[serde(rename = "fovYDegrees")]
    pub fov_y_degrees: f32,
    pub near: f32,
    pub far: f32,
}

impl Default for CameraState {
    fn default() -> Self {
        Self {
            position: [0.0, 0.0, 5.0],
            target: [0.0, 0.0, 0.0],
            up: [0.0, 1.0, 0.0],
            fov_y_degrees: 45.0,
            near: 0.1,
            far: 1000.0,
        }
    }
}

impl CameraState {
    pub fn validate(&self) -> Result<(), CameraError> {
        for v in self
            .position
            .iter()
            .chain(self.target.iter())
            .chain(self.up.iter())
        {
            if !v.is_finite() {
                return Err(CameraError::NonFinite);
            }
        }
        if !self.fov_y_degrees.is_finite() || !self.near.is_finite() || !self.far.is_finite() {
            return Err(CameraError::NonFinite);
        }
        if vec_eq(self.position, self.target) {
            return Err(CameraError::DegenerateView);
        }
        if length(self.up.into()) < 1.0e-6 {
            return Err(CameraError::ZeroUpVector);
        }
        if !(self.fov_y_degrees > 0.0 && self.fov_y_degrees < 180.0) {
            return Err(CameraError::InvalidFov);
        }
        if !(self.near > 0.0 && self.near < self.far) {
            return Err(CameraError::InvalidClipPlanes);
        }
        Ok(())
    }

    /// Distance from position to target.
    pub fn distance(&self) -> f32 {
        length(sub(self.position, self.target))
    }

    /// Reset to default camera.
    pub fn reset(&mut self) {
        *self = Self::default();
    }

    /// Orbit around target. yaw is azimuth (radians) around `up`,
    /// pitch is elevation (radians) above the horizontal plane.
    /// Distance to target is preserved.
    pub fn orbit(&mut self, yaw_delta: f32, pitch_delta: f32) {
        let offset = sub(self.position, self.target);
        let radius = length(offset);
        if radius < 1.0e-6 {
            return;
        }
        let yaw = offset.0.atan2(offset.2) + yaw_delta;
        let horiz = (offset.0 * offset.0 + offset.2 * offset.2).sqrt();
        let mut pitch = offset.1.atan2(horiz) + pitch_delta;
        let limit = std::f32::consts::FRAC_PI_2 - 0.01;
        if pitch > limit {
            pitch = limit;
        }
        if pitch < -limit {
            pitch = -limit;
        }
        let cp = pitch.cos();
        let new = (
            radius * cp * yaw.sin(),
            radius * pitch.sin(),
            radius * cp * yaw.cos(),
        );
        self.position = [
            self.target[0] + new.0,
            self.target[1] + new.1,
            self.target[2] + new.2,
        ];
    }

    /// Pan moves position and target together along the camera's right/up basis.
    pub fn pan(&mut self, right_delta: f32, up_delta: f32) {
        let forward = normalize(sub(self.target, self.position));
        let up = normalize(self.up.into());
        let right = normalize(cross(forward, up));
        let local_up = cross(right, forward);
        let delta = add(scale(right, right_delta), scale(local_up, up_delta));
        self.position = [
            self.position[0] + delta.0,
            self.position[1] + delta.1,
            self.position[2] + delta.2,
        ];
        self.target = [
            self.target[0] + delta.0,
            self.target[1] + delta.1,
            self.target[2] + delta.2,
        ];
    }

    /// Dolly toward (positive) or away from (negative) the target.
    /// The camera will not pass through the target — a small minimum distance is preserved.
    pub fn dolly(&mut self, amount: f32) {
        let offset = sub(self.position, self.target);
        let d = length(offset);
        if d < 1.0e-6 {
            return;
        }
        let new_d = (d - amount).max(0.01);
        let factor = new_d / d;
        self.position = [
            self.target[0] + offset.0 * factor,
            self.target[1] + offset.1 * factor,
            self.target[2] + offset.2 * factor,
        ];
    }
}

#[derive(Clone, Copy)]
struct V3(f32, f32, f32);

impl From<[f32; 3]> for V3 {
    fn from(v: [f32; 3]) -> Self {
        V3(v[0], v[1], v[2])
    }
}

fn sub(a: [f32; 3], b: [f32; 3]) -> V3 {
    V3(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}
fn add(a: V3, b: V3) -> V3 {
    V3(a.0 + b.0, a.1 + b.1, a.2 + b.2)
}
fn scale(a: V3, s: f32) -> V3 {
    V3(a.0 * s, a.1 * s, a.2 * s)
}
fn length(v: V3) -> f32 {
    (v.0 * v.0 + v.1 * v.1 + v.2 * v.2).sqrt()
}
fn normalize(v: V3) -> V3 {
    let l = length(v);
    if l < 1.0e-12 {
        V3(0.0, 0.0, 0.0)
    } else {
        V3(v.0 / l, v.1 / l, v.2 / l)
    }
}
fn cross(a: V3, b: V3) -> V3 {
    V3(
        a.1 * b.2 - a.2 * b.1,
        a.2 * b.0 - a.0 * b.2,
        a.0 * b.1 - a.1 * b.0,
    )
}
fn vec_eq(a: [f32; 3], b: [f32; 3]) -> bool {
    a.iter().zip(b.iter()).all(|(x, y)| (x - y).abs() < 1.0e-7)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_is_valid() {
        CameraState::default().validate().unwrap();
    }

    #[test]
    fn reset_restores_default() {
        let mut c = CameraState::default();
        c.position = [10.0, 20.0, 30.0];
        c.reset();
        assert_eq!(c, CameraState::default());
    }

    #[test]
    fn orbit_preserves_distance() {
        let mut c = CameraState::default();
        let d0 = c.distance();
        c.orbit(0.5, 0.3);
        let d1 = c.distance();
        assert!((d0 - d1).abs() < 1.0e-4, "{} vs {}", d0, d1);
    }

    #[test]
    fn pan_moves_position_and_target_together() {
        let mut c = CameraState::default();
        let p0 = c.position;
        let t0 = c.target;
        c.pan(1.0, 0.5);
        let dp = [c.position[0] - p0[0], c.position[1] - p0[1], c.position[2] - p0[2]];
        let dt = [c.target[0] - t0[0], c.target[1] - t0[1], c.target[2] - t0[2]];
        for i in 0..3 {
            assert!((dp[i] - dt[i]).abs() < 1.0e-5);
        }
    }

    #[test]
    fn dolly_decreases_distance_without_crossing() {
        let mut c = CameraState::default();
        let d0 = c.distance();
        c.dolly(1.0);
        assert!(c.distance() < d0);
        c.dolly(1000.0);
        assert!(c.distance() > 0.0);
    }

    #[test]
    fn degenerate_camera_rejected() {
        let mut c = CameraState::default();
        c.target = c.position;
        assert_eq!(c.validate(), Err(CameraError::DegenerateView));
    }

    #[test]
    fn invalid_fov_rejected() {
        let mut c = CameraState::default();
        c.fov_y_degrees = 0.0;
        assert_eq!(c.validate(), Err(CameraError::InvalidFov));
        c.fov_y_degrees = 180.0;
        assert_eq!(c.validate(), Err(CameraError::InvalidFov));
    }

    #[test]
    fn invalid_clip_planes_rejected() {
        let mut c = CameraState::default();
        c.near = 10.0;
        c.far = 1.0;
        assert_eq!(c.validate(), Err(CameraError::InvalidClipPlanes));
    }
}
