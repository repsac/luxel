//! Luxel Tauri application shell.

mod app_state;
mod commands;
mod events;

use tauri::Manager;
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
            // Override the static "Luxel" title set in tauri.conf.json with a
            // version + build-number label so users can identify the running
            // build from the OS title bar. Format mirrors the in-app toolbar:
            //   "Luxel v0.1.0 · #127"        (clean)
            //   "Luxel v0.1.0 · #127-dirty"  (uncommitted changes)
            //   "Luxel v0.1.0 · dev"         (no git history available)
            let version = env!("CARGO_PKG_VERSION");
            let number = env!("LUXEL_BUILD_NUMBER");
            let dirty = env!("LUXEL_BUILD_DIRTY") == "true";
            let number_part = if number == "dev" {
                "dev".to_string()
            } else {
                format!("#{number}{}", if dirty { "-dirty" } else { "" })
            };
            let title = format!("Luxel v{version} · {number_part}");
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_title(&title);
            }
            events::emit_console(
                events::LogLevel::Info,
                events::LogSource::App,
                &format!("Luxel started ({})", title),
                None,
            );
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Luxel");
}
