use std::sync::Arc;

use serde_json::json;
use tauri::{AppHandle, State};

use crate::core::Core;

#[tauri::command]
pub fn app_state(core: State<'_, Arc<Core>>) -> serde_json::Value {
    let cfg = core.app_config();
    json!({
        "profile": core.profile_summary(),
        "rules": cfg.rules,
        "settings": cfg.settings,
        "presetStates": cfg.preset_sites.states,
        "customSites": cfg.custom_sites,
        "status": core.get_status(),
        "ping": core.get_ping(),
        "traffic": core.get_traffic(),
        "connectedSince": core.connected_since_ms(),
        "binaryAvailable": core.is_binary_available(),
        "admin": Core::is_admin(),
    })
}

#[tauri::command]
pub fn set_profile_vless(
    core: State<'_, Arc<Core>>,
    link: String,
) -> Result<(), String> {
    core.set_profile_vless(&link)
}

#[tauri::command]
pub fn set_profile_json(
    core: State<'_, Arc<Core>>,
    raw: String,
) -> Result<(), String> {
    core.set_profile_json(&raw)
}

#[tauri::command]
pub fn clear_profile(core: State<'_, Arc<Core>>) -> Result<(), String> {
    core.clear_profile()
}

#[tauri::command]
pub fn connect(core: State<'_, Arc<Core>>, app: AppHandle) -> Result<(), String> {
    core.connect(&app)
}

#[tauri::command]
pub fn disconnect(core: State<'_, Arc<Core>>, app: AppHandle) -> Result<(), String> {
    core.disconnect(&app);
    Ok(())
}

#[tauri::command]
pub fn get_rules(core: State<'_, Arc<Core>>) -> crate::models::Rules {
    core.rules()
}

#[tauri::command]
pub fn add_domain_rule(
    core: State<'_, Arc<Core>>,
    domain: String,
    action: String,
) -> Result<(), String> {
    core.add_domain_rule(&domain, &action)
}

#[tauri::command]
pub fn remove_domain_rule(
    core: State<'_, Arc<Core>>,
    domain: String,
    action: String,
) -> Result<(), String> {
    core.remove_domain_rule(&domain, &action)
}

#[tauri::command]
pub fn add_process_rule(
    core: State<'_, Arc<Core>>,
    name: String,
    action: String,
) -> Result<(), String> {
    core.add_process_rule(&name, &action)
}

#[tauri::command]
pub fn remove_process_rule(
    core: State<'_, Arc<Core>>,
    name: String,
    action: String,
) -> Result<(), String> {
    core.remove_process_rule(&name, &action)
}

#[tauri::command]
pub fn set_preset_site(
    core: State<'_, Arc<Core>>,
    id: String,
    enabled: bool,
) -> Result<(), String> {
    core.set_preset_site(&id, enabled)
}

#[tauri::command]
pub fn delete_preset_site(core: State<'_, Arc<Core>>, id: String) -> Result<(), String> {
    core.delete_preset_site(&id)
}

#[tauri::command]
pub fn restore_preset_sites(core: State<'_, Arc<Core>>) -> Result<(), String> {
    core.restore_preset_sites()
}

#[tauri::command]
pub fn set_preset_site_include_subdomains(
    core: State<'_, Arc<Core>>,
    id: String,
    include: bool,
) -> Result<(), String> {
    core.set_preset_site_include_subdomains(&id, include)
}

#[tauri::command]
pub fn add_preset_site_subdomain(
    core: State<'_, Arc<Core>>,
    id: String,
    subdomain: String,
) -> Result<(), String> {
    core.add_preset_site_subdomain(&id, &subdomain)
}

#[tauri::command]
pub fn remove_preset_site_subdomain(
    core: State<'_, Arc<Core>>,
    id: String,
    subdomain: String,
) -> Result<(), String> {
    core.remove_preset_site_subdomain(&id, &subdomain)
}

#[tauri::command]
pub fn set_site_hidden(
    core: State<'_, Arc<Core>>,
    kind: String,
    id: String,
    hidden: bool,
) -> Result<(), String> {
    core.set_site_hidden(&kind, &id, hidden)
}

#[tauri::command]
pub fn add_custom_site(core: State<'_, Arc<Core>>, link: String) -> Result<(), String> {
    core.add_custom_site(&link)
}

#[tauri::command]
pub fn remove_custom_site(core: State<'_, Arc<Core>>, id: String) -> Result<(), String> {
    core.remove_custom_site(&id)
}

#[tauri::command]
pub fn set_custom_site(
    core: State<'_, Arc<Core>>,
    id: String,
    enabled: bool,
) -> Result<(), String> {
    core.set_custom_site(&id, enabled)
}

#[tauri::command]
pub fn add_custom_site_subdomain(
    core: State<'_, Arc<Core>>,
    id: String,
    subdomain: String,
) -> Result<(), String> {
    core.add_custom_site_subdomain(&id, &subdomain)
}

#[tauri::command]
pub fn remove_custom_site_subdomain(
    core: State<'_, Arc<Core>>,
    id: String,
    subdomain: String,
) -> Result<(), String> {
    core.remove_custom_site_subdomain(&id, &subdomain)
}

#[tauri::command]
pub fn set_custom_site_include_subdomains(
    core: State<'_, Arc<Core>>,
    id: String,
    include: bool,
) -> Result<(), String> {
    core.set_custom_site_include_subdomains(&id, include)
}

#[tauri::command]
pub fn get_status(core: State<'_, Arc<Core>>) -> crate::models::StatusInfo {
    core.get_status()
}

#[tauri::command]
pub fn get_ping(core: State<'_, Arc<Core>>) -> crate::models::PingInfo {
    core.get_ping()
}

#[tauri::command]
pub fn get_connections(core: State<'_, Arc<Core>>) -> Vec<crate::models::ConnectionInfo> {
    core.get_connections()
}

#[tauri::command]
pub fn get_opencode_proxy_env(core: State<'_, Arc<Core>>) -> bool {
    let port = core.app_config().settings.mixed_port;
    crate::winutil::get_opencode_proxy_env_status(port)
}

#[tauri::command]
pub fn set_opencode_proxy_env(core: State<'_, Arc<Core>>) -> Result<(), String> {
    let port = core.app_config().settings.mixed_port;
    crate::winutil::set_opencode_proxy_env(port)
}

#[tauri::command]
pub fn clear_opencode_proxy_env() -> Result<(), String> {
    crate::winutil::clear_opencode_proxy_env()
}