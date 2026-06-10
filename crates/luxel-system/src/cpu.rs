use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub struct CpuStats {
    /// Global CPU usage percentage in [0, 100].
    pub usage_percent: f32,
    /// Logical core count, or None if the platform did not report it.
    pub logical_cores: Option<u32>,
}

impl Default for CpuStats {
    fn default() -> Self {
        Self {
            usage_percent: 0.0,
            logical_cores: None,
        }
    }
}
