use std::path::PathBuf;

use luxel_core::{validate_scene, SceneFile, ShaderSource};
use luxel_io::{load_scene_file, save_scene_file};
use luxel_render::{
    compile_glsl_fragment, EvalInputs, EvalResult, FrameInputs, GpuBackend, ShaderCompileResult,
};
use luxel_system::{GpuInfo, SystemStatus};
use serde::Serialize;
use tauri::ipc::Response;
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

/// Size (in bytes) of the metadata header prepended to the pixel payload.
/// Layout (little-endian):
///   bytes  0..4   : width  (u32)
///   bytes  4..8   : height (u32)
///   bytes  8..12  : total_ms (u32)
///   bytes 12..16  : gpu_ms (u32)
///   bytes 16..    : RGBA8 pixels, row-major, top-to-bottom
///
/// Keeping the header tiny and self-describing avoids a second IPC roundtrip
/// for metadata and is much faster to construct than a JSON object.
pub const RENDER_HEADER_BYTES: usize = 16;

#[tauri::command]
pub fn render_single_frame(
    scene: SceneFile,
    #[allow(non_snake_case)] timeOverride: Option<f32>,
    #[allow(non_snake_case)] frameOverride: Option<i32>,
    #[allow(non_snake_case)] widthOverride: Option<u32>,
    #[allow(non_snake_case)] heightOverride: Option<u32>,
    #[allow(non_snake_case)] mouseOverride: Option<[f32; 4]>,
    state: State<'_, AppState>,
) -> Result<Response, AppError> {
    // Apply size overrides on a local copy so we can re-validate dimensions.
    let mut effective = scene.scene.clone();
    if let Some(w) = widthOverride {
        effective.render_settings.width = w.clamp(16, 4096);
    }
    if let Some(h) = heightOverride {
        effective.render_settings.height = h.clamp(16, 4096);
    }
    let effective_file = SceneFile {
        scene: effective,
        ..scene
    };
    validate_scene(&effective_file).map_err(|e| AppError::Validation(e.to_string()))?;
    let renderer = state.renderer().map_err(AppError::Render)?;
    let inputs = FrameInputs {
        time: timeOverride.unwrap_or(0.0),
        frame: frameOverride.unwrap_or(0),
        mouse: mouseOverride.unwrap_or([0.0; 4]),
    };
    match renderer.render_single_frame_with(&effective_file.scene, inputs) {
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
            // Pack the metadata header in front of the pixel buffer in a
            // single allocation. The whole thing flows over the Tauri IPC
            // boundary as raw bytes (no JSON/base64), and the frontend reads
            // a 16-byte header off the front before handing the rest straight
            // to ImageData.
            let mut payload = Vec::with_capacity(RENDER_HEADER_BYTES + r.pixels.len());
            payload.extend_from_slice(&r.width.to_le_bytes());
            payload.extend_from_slice(&r.height.to_le_bytes());
            payload.extend_from_slice(&r.timing.total_ms.to_le_bytes());
            payload.extend_from_slice(&r.timing.gpu_ms.to_le_bytes());
            payload.extend_from_slice(&r.pixels);
            Ok(Response::new(payload))
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

/// Evaluate a single GLSL expression at a pixel and return its value. Backs
/// the Scratchpad. Uniforms come from the scene (so the result matches the
/// live shader) but the resolution, pixel, time, frame, and mouse can be
/// overridden so the user can probe hypotheticals. `preamble` is extra GLSL
/// (e.g. REPL variable declarations) placed before the generated `main`.
#[tauri::command]
#[allow(non_snake_case, clippy::too_many_arguments)]
pub fn eval_glsl(
    scene: SceneFile,
    expr: String,
    preamble: Option<String>,
    resolution: [u32; 2],
    pixel: [f32; 2],
    timeOverride: Option<f32>,
    frameOverride: Option<i32>,
    mouseOverride: Option<[f32; 4]>,
    state: State<'_, AppState>,
) -> Result<EvalResult, AppError> {
    let renderer = state.renderer().map_err(AppError::Render)?;
    let inputs = EvalInputs {
        resolution: [resolution[0].max(1) as f32, resolution[1].max(1) as f32],
        pixel,
        time: timeOverride.unwrap_or(0.0),
        frame: frameOverride.unwrap_or(0),
        mouse: mouseOverride.unwrap_or([0.0; 4]),
        camera: scene.scene.camera,
        object: scene.scene.object.position,
    };
    renderer
        .eval_expression(preamble.as_deref().unwrap_or(""), &expr, &inputs)
        .map_err(|e| {
            // Surface the first compile diagnostic as the message so the
            // Scratchpad can show what went wrong.
            if let luxel_render::RenderError::ShaderCompile(sc) = &e {
                if let Some(d) = sc.diagnostics.first() {
                    return AppError::Shader(d.message.clone());
                }
            }
            AppError::Render(e.to_string())
        })
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
