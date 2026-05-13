//! System status sampler: CPU, memory, GPU info.

pub mod cpu;
pub mod gpu_info;
pub mod memory;
pub mod status;

pub use gpu_info::GpuInfo;
pub use status::{SystemStatus, StatusSampler};
