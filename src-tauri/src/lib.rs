//! Luxel Tauri application shell.

mod app_state;
mod commands;
mod events;

use tracing_subscriber::{fmt, prelude::*, EnvFilter};

pub fn run() {
    let _ = tracing_subscriber::registry()
        .with(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("info,luxel=debug")),
        )
        .with(fmt::layer())
        .try_init();

    tracing::info!("starting Luxel v{}", env!("CARGO_PKG_VERSION"));

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .manage(app_state::AppState::new())
        .invoke_handler(tauri::generate_handler![
            commands::load_scene,
            commands::save_scene,
            commands::validate_scene_cmd,
            commands::default_scene,
            commands::initial_scene_path,
            commands::compile_shader,
            commands::render_single_frame,
            commands::get_system_status,
            commands::get_gpu_info,
            commands::set_gpu_backend,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            events::set_emitter(handle);
            events::emit_console(
                events::LogLevel::Info,
                events::LogSource::App,
                "Luxel started",
                None,
            );
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Luxel");
}
