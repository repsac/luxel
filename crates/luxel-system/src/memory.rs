use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub struct MemoryStats {
    /// Used memory in bytes.
    pub used_bytes: u64,
    /// Total memory in bytes.
    pub total_bytes: u64,
}

impl Default for MemoryStats {
    fn default() -> Self {
        Self {
            used_bytes: 0,
            total_bytes: 0,
        }
    }
}
