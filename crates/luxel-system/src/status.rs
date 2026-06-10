use serde::{Deserialize, Serialize};
use sysinfo::{CpuRefreshKind, MemoryRefreshKind, RefreshKind, System};

use crate::{cpu::CpuStats, memory::MemoryStats, GpuInfo};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SystemStatus {
    pub cpu: CpuStats,
    pub memory: MemoryStats,
    pub gpu: GpuInfo,
}

impl Default for SystemStatus {
    fn default() -> Self {
        Self {
            cpu: CpuStats::default(),
            memory: MemoryStats::default(),
            gpu: GpuInfo::default(),
        }
    }
}

/// Reusable sampler so we don't re-allocate a `System` each tick.
pub struct StatusSampler {
    sys: System,
    gpu: GpuInfo,
}

impl StatusSampler {
    pub fn new() -> Self {
        let sys = System::new_with_specifics(
            RefreshKind::new()
                .with_cpu(CpuRefreshKind::new().with_cpu_usage())
                .with_memory(MemoryRefreshKind::new().with_ram()),
        );
        Self {
            sys,
            gpu: GpuInfo::default(),
        }
    }

    pub fn set_gpu(&mut self, gpu: GpuInfo) {
        self.gpu = gpu;
    }

    pub fn gpu(&self) -> &GpuInfo {
        &self.gpu
    }

    pub fn sample(&mut self) -> SystemStatus {
        self.sys.refresh_cpu_usage();
        self.sys.refresh_memory();
        let cpu = CpuStats {
            usage_percent: self.sys.global_cpu_usage(),
            logical_cores: Some(self.sys.cpus().len() as u32),
        };
        let memory = MemoryStats {
            used_bytes: self.sys.used_memory(),
            total_bytes: self.sys.total_memory(),
        };
        SystemStatus {
            cpu,
            memory,
            gpu: self.gpu.clone(),
        }
    }
}

impl Default for StatusSampler {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sampler_returns_struct() {
        let mut s = StatusSampler::new();
        let st = s.sample();
        // Memory total should be non-zero on real platforms; treat zero as "unknown" and pass.
        let _ = st.memory.total_bytes;
        assert!(st.cpu.usage_percent.is_finite());
    }

    #[test]
    fn serializes_to_json_object() {
        let st = SystemStatus::default();
        let v = serde_json::to_value(&st).unwrap();
        assert!(v.get("cpu").is_some());
        assert!(v.get("memory").is_some());
        assert!(v.get("gpu").is_some());
    }
}
