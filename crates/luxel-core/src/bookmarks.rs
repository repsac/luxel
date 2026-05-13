use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CameraBookmark {
    pub id: String,
    pub name: String,
    pub position: [f32; 3],
    pub target: [f32; 3],
    pub up: [f32; 3],
    #[serde(rename = "fovYDegrees")]
    pub fov_y_degrees: f32,
}

impl CameraBookmark {
    pub fn default_bookmark() -> Self {
        Self {
            id: "default".to_string(),
            name: "Default".to_string(),
            position: [0.0, 0.0, 5.0],
            target: [0.0, 0.0, 0.0],
            up: [0.0, 1.0, 0.0],
            fov_y_degrees: 45.0,
        }
    }

    /// Apply this bookmark to a camera, preserving the camera's near/far planes.
    pub fn apply_to(&self, camera: &mut crate::CameraState) {
        camera.position = self.position;
        camera.target = self.target;
        camera.up = self.up;
        camera.fov_y_degrees = self.fov_y_degrees;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::CameraState;

    #[test]
    fn default_bookmark_round_trips() {
        let b = CameraBookmark::default_bookmark();
        let s = serde_json::to_string(&b).unwrap();
        let b2: CameraBookmark = serde_json::from_str(&s).unwrap();
        assert_eq!(b, b2);
    }

    #[test]
    fn apply_writes_camera_fields_but_preserves_clip_planes() {
        let mut cam = CameraState {
            near: 0.5,
            far: 500.0,
            ..CameraState::default()
        };
        let mut b = CameraBookmark::default_bookmark();
        b.position = [1.0, 2.0, 3.0];
        b.apply_to(&mut cam);
        assert_eq!(cam.position, [1.0, 2.0, 3.0]);
        assert_eq!(cam.near, 0.5);
        assert_eq!(cam.far, 500.0);
    }
}
