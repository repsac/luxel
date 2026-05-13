use std::sync::OnceLock;

use luxel_render::{GpuBackend, Renderer};
use luxel_system::StatusSampler;
use parking_lot::Mutex;

pub struct AppState {
    pub renderer: OnceLock<Result<Renderer, String>>,
    pub backend: Mutex<GpuBackend>,
    pub sampler: Mutex<StatusSampler>,
    pub initial_scene_path: Option<String>,
}

impl AppState {
    pub fn new() -> Self {
        let backend = std::env::var("LUXEL_GPU_BACKEND")
            .ok()
            .and_then(|s| match s.to_ascii_lowercase().as_str() {
                "auto" => Some(GpuBackend::Auto),
                "metal" => Some(GpuBackend::Metal),
                "dx12" => Some(GpuBackend::Dx12),
                "vulkan" => Some(GpuBackend::Vulkan),
                "gl" => Some(GpuBackend::Gl),
                _ => None,
            })
            .unwrap_or(GpuBackend::Auto);
        let initial_scene_path = std::env::var("LUXEL_INITIAL_SCENE").ok();
        Self {
            renderer: OnceLock::new(),
            backend: Mutex::new(backend),
            sampler: Mutex::new(StatusSampler::new()),
            initial_scene_path,
        }
    }

    /// Lazily initialize the renderer using the current backend selection.
    /// The result is memoized: changing the backend requires restarting the app.
    pub fn renderer(&self) -> Result<&Renderer, String> {
        let backend = *self.backend.lock();
        self.renderer
            .get_or_init(|| Renderer::new(backend).map_err(|e| e.to_string()))
            .as_ref()
            .map_err(|e| e.clone())
    }
}
