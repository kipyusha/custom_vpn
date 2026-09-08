use winreg::enums::{HKEY_CURRENT_USER, KEY_READ, KEY_WRITE};
use winreg::RegKey;
use windows_sys::Win32::Networking::WinInet::{
    InternetSetOptionW, INTERNET_OPTION_REFRESH, INTERNET_OPTION_SETTINGS_CHANGED,
};

const INTERNET_SETTINGS: &str =
    r"Software\Microsoft\Windows\CurrentVersion\Internet Settings";

fn refresh_system_proxy() {
    unsafe {
        InternetSetOptionW(
            std::ptr::null_mut(),
            INTERNET_OPTION_SETTINGS_CHANGED,
            std::ptr::null_mut(),
            0,
        );
        InternetSetOptionW(
            std::ptr::null_mut(),
            INTERNET_OPTION_REFRESH,
            std::ptr::null_mut(),
            0,
        );
    }
}

fn open_settings() -> std::io::Result<RegKey> {
    RegKey::predef(HKEY_CURRENT_USER).open_subkey_with_flags(INTERNET_SETTINGS, KEY_WRITE)
}

pub fn set_system_proxy(host: &str, port: u16) -> Result<(), String> {
    let key = open_settings().map_err(|e| format!("Не удалось открыть реестр прокси: {e}"))?;
    key.set_value("ProxyEnable", &1u32)
        .map_err(|e| format!("Ошибка записи ProxyEnable: {e}"))?;
    key.set_value("ProxyServer", &format!("{host}:{port}"))
        .map_err(|e| format!("Ошибка записи ProxyServer: {e}"))?;
    key.set_value("ProxyOverride", &"<local>")
        .map_err(|e| format!("Ошибка записи ProxyOverride: {e}"))?;
    refresh_system_proxy();
    Ok(())
}

pub fn clear_system_proxy() -> Result<(), String> {
    if let Ok(key) = open_settings() {
        let _ = key.set_value("ProxyEnable", &0u32);
        refresh_system_proxy();
    }
    Ok(())
}

pub fn is_admin() -> bool {
    use windows_sys::Win32::UI::Shell::IsUserAnAdmin;
    unsafe { IsUserAnAdmin() != 0 }
}

const ENV_KEY: &str = "Environment";
// GitHub-хосты в исключениях: проверка обновлений обязана ходить напрямую,
// иначе при выключенном VPN мёртвый локальный прокси роняет запрос.
const NO_PROXY_VAL: &str = "localhost,127.0.0.1,::1,github.com,api.github.com,objects.githubusercontent.com,release-assets.githubusercontent.com";

fn broadcast_env_change() {
    use windows_sys::Win32::Foundation::{HWND, LPARAM, WPARAM};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        SendMessageTimeoutW, HWND_BROADCAST, SMTO_ABORTIFHUNG, WM_SETTINGCHANGE,
    };
    unsafe {
        let env_w: Vec<u16> = "Environment\0".encode_utf16().collect();
        SendMessageTimeoutW(
            HWND_BROADCAST,
            WM_SETTINGCHANGE,
            0 as WPARAM,
            env_w.as_ptr() as LPARAM,
            SMTO_ABORTIFHUNG,
            2000,
            std::ptr::null_mut(),
        );
    }
}

fn open_env_key(write: bool) -> Result<RegKey, String> {
    let access = if write { KEY_WRITE } else { KEY_READ };
    RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey_with_flags(ENV_KEY, access)
        .map_err(|e| format!("Не удалось открыть HKCU\\Environment: {e}"))
}

pub fn set_opencode_proxy_env(port: u16) -> Result<(), String> {
    let key = open_env_key(true)?;
    let proxy = format!("http://127.0.0.1:{port}");
    for name in [
        "HTTPS_PROXY",
        "HTTP_PROXY",
        "https_proxy",
        "http_proxy",
    ] {
        key.set_value(name, &proxy)
            .map_err(|e| format!("Ошибка записи {name}: {e}"))?;
    }
    for name in ["NO_PROXY", "no_proxy"] {
        key.set_value(name, &NO_PROXY_VAL)
            .map_err(|e| format!("Ошибка записи {name}: {e}"))?;
    }
    broadcast_env_change();
    Ok(())
}

pub fn clear_opencode_proxy_env() -> Result<(), String> {
    if let Ok(key) = open_env_key(true) {
        for name in [
            "HTTPS_PROXY",
            "HTTP_PROXY",
            "https_proxy",
            "http_proxy",
            "NO_PROXY",
            "no_proxy",
        ] {
            let _ = key.delete_value(name);
        }
        broadcast_env_change();
    }
    Ok(())
}

pub fn get_opencode_proxy_env_status(port: u16) -> bool {
    let expected = format!("http://127.0.0.1:{port}");
    let Ok(key) = open_env_key(false) else {
        return false;
    };
    let check = |name: &str| -> bool {
        key.get_value::<String, _>(name)
            .map(|v| v == expected)
            .unwrap_or(false)
    };
    // считаем включенным если хотя бы HTTPS_PROXY совпадает
    check("HTTPS_PROXY") && check("HTTP_PROXY")
}
