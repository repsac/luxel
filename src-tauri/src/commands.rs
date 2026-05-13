use std::path::PathBuf;

use luxel_core::{validate_scene, SceneFile, ShaderSource};
use luxel_io::{load_scene_file, save_scene_file};
use luxel_render::{compile_glsl_fragment, FrameInputs, GpuBackend, ShaderCompileResult};
use luxel_system::{GpuInfo, SystemStatus};
use serde::Serialize;
use tauri::State;
use thiserror::Error;

use crate::app_state::AppState;
use crate::events::{emit_console, emit_shader_diagnostic, LogLevel, LogSource};

#[derive(Debug, Error, Serialize)]
#[serde(tag = "kind", content = "message", rename_all = "snake_case")]
#[allow(dead_code)]
pub enum AppError {
    #[error("io: {0}")]
    Io(String),
    #[error("validation: {0}")]
    Validation(String),
    #[error("shader: {0}")]
    Shader(String),
    #[error("render: {0}")]
    Render(String),
    #[error("system: {0}")]
    System(String),
}

impl From<luxel_io::SceneFileError> for AppError {
    fn from(e: luxel_io::SceneFileError) -> Self {
        match e {
            luxel_io::SceneFileError::Validation(v) => AppError::Validation(v.to_string()),
            other => AppError::Io(other.to_string()),
        }
    }
}

#[tauri::command]
pub fn load_scene(path: String) -> Result<SceneFile, AppError> {
    let file = load_scene_file(PathBuf::from(&path))?;
    emit_console(
        LogLevel::Info,
        LogSource::Scene,
        &format!("loaded scene: {path}"),
        None,
    );
    Ok(file)
}

#[tauri::command]
pub fn save_scene(path: String, scene: SceneFile) -> Result<(), AppError> {
    save_scene_file(PathBuf::from(&path), &scene)?;
    emit_console(
        LogLevel::Info,
        LogSource::Scene,
        &format!("saved scene: {path}"),
        None,
    );
    Ok(())
}

#[tauri::command]
pub fn validate_scene_cmd(scene: SceneFile) -> Result<(), AppError> {
    validate_scene(&scene).map_err(|e| AppError::Validation(e.to_string()))
}

#[tauri::command]
pub fn default_scene() -> SceneFile {
    SceneFile::default()
}

#[tauri::command]
pub fn initial_scene_path(state: State<'_, AppState>) -> Option<String> {
    state.initial_scene_path.clone()
}

#[tauri::command]
pub fn compile_shader(shader: ShaderSource) -> Result<ShaderCompileResult, AppError> {
    match compile_glsl_fragment(&shader) {
        Ok(r) => {
            emit_console(
                LogLevel::Info,
                LogSource::Shader,
                "shader compiled",
                None,
            );
            Ok(r)
        }
        Err(err) => {
            for d in &err.diagnostics {
                emit_shader_diagnostic(LogLevel::Error, &d.message, d.line, d.column);
            }
            Err(AppError::Shader("shader compile failed".to_string()))
        }
    }
}

#[tauri::command]
pub fn render_single_frame(
    scene: SceneFile,
    #[allow(non_snake_case)] timeOverride: Option<f32>,
    #[allow(non_snake_case)] frameOverride: Option<i32>,
    #[allow(non_snake_case)] widthOverride: Option<u32>,
    #[allow(non_snake_case)] heightOverride: Option<u32>,
    state: State<'_, AppState>,
) -> Result<luxel_render::RenderResult, AppError> {
    validate_scene(&scene).map_err(|e| AppError::Validation(e.to_string()))?;
    // Apply size overrides on a local copy so we can re-validate dimensions.
    let mut effective = scene.scene.clone();
    if let Some(w) = widthOverride {
        effective.render_settings.width = w.clamp(16, 4096);
    }
    if let Some(h) = heightOverride {
        effective.render_settings.height = h.clamp(16, 4096);
    }
    let renderer = state.renderer().map_err(AppError::Render)?;
    let inputs = FrameInputs {
        time: timeOverride.unwrap_or(0.0),
        frame: frameOverride.unwrap_or(0),
        mouse: [0.0; 4],
    };
    match renderer.render_single_frame_with(&effective, inputs) {
        Ok(r) => {
            emit_console(
                LogLevel::Info,
                LogSource::Renderer,
                &format!(
                    "rendered {}x{} in {} ms",
                    r.width, r.height, r.timing.total_ms
                ),
                None,
            );
            Ok(r)
        }
        Err(e) => {
            if let luxel_render::RenderError::ShaderCompile(sc) = &e {
                for d in &sc.diagnostics {
                    emit_shader_diagnostic(LogLevel::Error, &d.message, d.line, d.column);
                }
            }
            emit_console(
                LogLevel::Error,
                LogSource::Renderer,
                &format!("render failed: {e}"),
                None,
            );
            Err(AppError::Render(e.to_string()))
        }
    }
}

#[tauri::command]
pub fn get_system_status(state: State<'_, AppState>) -> Result<SystemStatus, AppError> {
    if let Ok(r) = state.renderer() {
        state.sampler.lock().set_gpu(r.gpu_info().clone());
    }
    Ok(state.sampler.lock().sample())
}

#[tauri::command]
pub fn get_gpu_info(state: State<'_, AppState>) -> Result<GpuInfo, AppError> {
    match state.renderer() {
        Ok(r) => Ok(r.gpu_info().clone()),
        Err(_) => Ok(GpuInfo::default()),
    }
}

#[tauri::command]
pub fn set_gpu_backend(backend: GpuBackend, state: State<'_, AppState>) -> Result<(), AppError> {
    *state.backend.lock() = backend;
    emit_console(
        LogLevel::Info,
        LogSource::Renderer,
        &format!("GPU backend preference set to {backend:?} (requires restart)"),
        None,
    );
    Ok(())
}
