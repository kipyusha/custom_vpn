mod clash;
mod commands;
mod config;
mod core;
mod models;
mod ping;
mod singbox;
mod store;
mod vless;
mod winutil;

use std::sync::Arc;

use core::Core;
use tauri::{Manager, RunEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // Второй запуск (например, портабл + установленная версия):
            // вместо нового окна фокусируем уже открытое.
            use tauri::Manager;
            let _ = app
                .get_webview_window("main")
                .map(|w| w.set_focus());
        }))
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            let resource_dir = app.path().resource_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let core = Arc::new(Core::new(data_dir, resource_dir));
            app.manage(core);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_state,
            commands::set_profile_vless,
            commands::set_profile_json,
            commands::clear_profile,
            commands::connect,
            commands::disconnect,
            commands::get_rules,
            commands::add_domain_rule,
            commands::remove_domain_rule,
            commands::add_process_rule,
            commands::remove_process_rule,
            commands::set_preset_site,
            commands::delete_preset_site,
            commands::restore_preset_sites,
            commands::set_preset_site_include_subdomains,
            commands::add_preset_site_subdomain,
            commands::remove_preset_site_subdomain,
            commands::set_site_hidden,
            commands::add_custom_site,
            commands::remove_custom_site,
            commands::set_custom_site,
            commands::add_custom_site_subdomain,
            commands::remove_custom_site_subdomain,
            commands::set_custom_site_include_subdomains,
            commands::get_status,
            commands::get_ping,
            commands::get_connections,
            commands::cleanup_orphans,
            commands::get_opencode_proxy_env,
            commands::set_opencode_proxy_env,
            commands::clear_opencode_proxy_env,
        ]);

    builder
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app_handle, event| {
            if let RunEvent::Exit = event {
                if let Some(core) = app_handle.try_state::<Arc<Core>>() {
                    core.disconnect(app_handle);
                }
            }
        });
}