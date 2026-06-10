use std::sync::OnceLock;

use serde::Serialize;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
#[allow(dead_code)]
pub enum LogLevel {
    Debug,
    Info,
    Warn,
    Error,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
#[allow(dead_code)]
pub enum LogSource {
    App,
    Renderer,
    Shader,
    System,
    Scene,
}

#[derive(Debug, Clone, Serialize)]
pub struct ConsoleEvent {
    pub timestamp: String,
    pub level: LogLevel,
    pub source: LogSource,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub line: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub column: Option<u32>,
}

static EMITTER: OnceLock<AppHandle> = OnceLock::new();

pub fn set_emitter(handle: AppHandle) {
    let _ = EMITTER.set(handle);
}

pub fn emit_console(level: LogLevel, source: LogSource, message: &str, details: Option<String>) {
    let event = ConsoleEvent {
        timestamp: chrono::Utc::now().to_rfc3339(),
        level,
        source,
        message: message.to_string(),
        details,
        file: None,
        line: None,
        column: None,
    };
    if let Some(h) = EMITTER.get() {
        let _ = h.emit("luxel://console", event.clone());
    }
    match level {
        LogLevel::Debug => tracing::debug!(?event, "{}", message),
        LogLevel::Info => tracing::info!("{}", message),
        LogLevel::Warn => tracing::warn!("{}", message),
        LogLevel::Error => tracing::error!("{}", message),
    }
}

/// Emit a shader compile diagnostic with line/column info if available.
pub fn emit_shader_diagnostic(
    level: LogLevel,
    message: &str,
    line: Option<u32>,
    column: Option<u32>,
) {
    let event = ConsoleEvent {
        timestamp: chrono::Utc::now().to_rfc3339(),
        level,
        source: LogSource::Shader,
        message: message.to_string(),
        details: None,
        file: None,
        line,
        column,
    };
    if let Some(h) = EMITTER.get() {
        let _ = h.emit("luxel://console", event);
    }
}
