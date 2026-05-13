use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum GpuBackend {
    Auto,
    Metal,
    Dx12,
    Vulkan,
    Gl,
}

impl Default for GpuBackend {
    fn default() -> Self {
        Self::Auto
    }
}

impl GpuBackend {
    pub fn as_wgpu(&self) -> wgpu::Backends {
        match self {
            GpuBackend::Auto => wgpu::Backends::PRIMARY,
            GpuBackend::Metal => wgpu::Backends::METAL,
            GpuBackend::Dx12 => wgpu::Backends::DX12,
            GpuBackend::Vulkan => wgpu::Backends::VULKAN,
            GpuBackend::Gl => wgpu::Backends::GL,
        }
    }
}

/// Choose a sensible default backend for the current platform.
pub fn select_backend(requested: GpuBackend) -> wgpu::Backends {
    if matches!(requested, GpuBackend::Auto) {
        if cfg!(target_os = "macos") {
            wgpu::Backends::METAL
        } else if cfg!(target_os = "windows") {
            wgpu::Backends::DX12 | wgpu::Backends::VULKAN
        } else {
            wgpu::Backends::PRIMARY
        }
    } else {
        requested.as_wgpu()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn auto_picks_platform_default() {
        let b = select_backend(GpuBackend::Auto);
        assert!(!b.is_empty());
    }

    #[test]
    fn explicit_backend_round_trip() {
        let b = select_backend(GpuBackend::Vulkan);
        assert!(b.contains(wgpu::Backends::VULKAN));
    }
}
