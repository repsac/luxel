use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ShaderDiagnostic {
    pub message: String,
    pub line: Option<u32>,
    pub column: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Error)]
#[error("shader compilation failed")]
pub struct ShaderCompileError {
    pub diagnostics: Vec<ShaderDiagnostic>,
}

#[derive(Debug, Error)]
pub enum RenderError {
    #[error("no compatible GPU adapter found")]
    NoAdapter,
    #[error("requested device failed: {0}")]
    RequestDevice(String),
    #[error("shader compile error")]
    ShaderCompile(#[from] ShaderCompileError),
    #[error("readback failed: {0}")]
    Readback(String),
    #[error("render target too large: {0}")]
    TargetTooLarge(String),
    #[error("surface error: {0}")]
    Surface(String),
}
