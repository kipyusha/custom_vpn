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
use tauri::{
    menu::{Menu, MenuItemBuilder, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, RunEvent, WindowEvent,
};

/// Перестраивает меню трея и подсказку под текущее состояние
/// (подключено/отключено, окно видно/скрыто).
pub fn sync_tray(app: &AppHandle) {
    let connected = app
        .try_state::<Arc<Core>>()
        .map(|c| c.get_status().connected)
        .unwrap_or(false);
    let visible = app
        .get_webview_window("main")
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false);
    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_tooltip(Some(format!(
            "CustomVPN — {}",
            if connected { "подключено" } else { "отключено" }
        )));
        if let Ok(menu) = build_tray_menu(app, connected, visible) {
            let _ = tray.set_menu(Some(menu));
        }
    }
}

fn build_tray_menu(
    app: &AppHandle,
    connected: bool,
    visible: bool,
) -> tauri::Result<Menu<tauri::Wry>> {
    let show = MenuItemBuilder::with_id(
        "show",
        if visible { "Скрыть" } else { "Показать" },
    )
    .build(app)?;
    let connect = MenuItemBuilder::with_id(
        "connect",
        if connected { "Отключить" } else { "Подключить" },
    )
    .build(app)?;
    let update = MenuItemBuilder::with_id("update", "Проверить обновления").build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Выход").build(app)?;
    let sep = PredefinedMenuItem::separator(app)?;
    Menu::with_items(app, &[&show, &connect, &update, &sep, &quit])
}

fn toggle_main_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        if w.is_visible().unwrap_or(false) {
            let _ = w.hide();
        } else {
            let _ = w.show();
            let _ = w.set_focus();
        }
    }
    sync_tray(app);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // Второй запуск (например, портабл + установленная версия):
            // вместо нового окна фокусируем уже открытое.
            let _ = app
                .get_webview_window("main")
                .map(|w| { let _ = w.show(); let _ = w.set_focus(); });
            crate::sync_tray(app);
        }))
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            let resource_dir = app.path().resource_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let core = Arc::new(Core::new(data_dir, resource_dir));
            app.manage(core);
            // Иконка в трее с меню. Окно при старте показывается как обычно.
            if let Some(icon) = app.default_window_icon().cloned() {
                let menu = build_tray_menu(app.handle(), false, true)?;
                let _tray = TrayIconBuilder::with_id("main")
                    .icon(icon)
                    .tooltip("CustomVPN — отключено")
                    .menu(&menu)
                    .show_menu_on_left_click(false)
                    .on_menu_event(|app, event| {
                        match event.id().as_ref() {
                            "show" => toggle_main_window(app),
                            "connect" => {
                                if let Some(core) = app.try_state::<Arc<Core>>() {
                                    if core.get_status().connected {
                                        core.disconnect(app);
                                    } else if let Err(e) = core.connect(app) {
                                        if let Some(w) = app.get_webview_window("main") {
                                            let _ = w.show();
                                            let _ = w.set_focus();
                                        }
                                        let _ = app.emit("tray-error", e);
                                    }
                                }
                                sync_tray(app);
                            }
                            "update" => {
                                let _ = app.emit("check-updates", ());
                            }
                            "quit" => {
                                app.exit(0);
                            }
                            _ => {}
                        }
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event
                        {
                            toggle_main_window(tray.app_handle());
                        }
                    })
                    .build(app)?;
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            // Крестик сворачивает в трей, а не закрывает приложение.
            // Выход — через пункт «Выход» в меню иконки трея.
            if let WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
                let app = window.app_handle();
                let _ = app.emit("tray-minimized", ());
                sync_tray(app);
            }
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
            commands::refresh_tray,
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