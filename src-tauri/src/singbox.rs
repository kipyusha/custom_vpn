use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::Mutex;

use serde_json::{json, Value};

use crate::winutil;

pub struct SingBox {
    bin_dir: PathBuf,
    data_dir: PathBuf,
    mixed_port: u16,
    clash_port: u16,
    child: Mutex<Option<Child>>,
    config_path: PathBuf,
    log_path: PathBuf,
}

impl SingBox {
    pub fn new(data_dir: PathBuf, resource_dir: PathBuf, mixed_port: u16, clash_port: u16) -> Self {
        let bin_dir = current_bin_dir().unwrap_or_else(|| data_dir.clone());
        ensure_dlls(&bin_dir, &resource_dir);
        let config_path = data_dir.join("singbox-config.json");
        let log_path = data_dir.join("singbox.log");
        Self {
            bin_dir,
            data_dir,
            mixed_port,
            clash_port,
            child: Mutex::new(None),
            config_path,
            log_path,
        }
    }

    pub fn mixed_port(&self) -> u16 {
        self.mixed_port
    }

    pub fn clash_port(&self) -> u16 {
        self.clash_port
    }

    pub fn singbox_path(&self) -> PathBuf {
        self.bin_dir.join("sing-box.exe")
    }

    pub fn is_available(&self) -> bool {
        self.singbox_path().exists()
    }

    pub fn start(&self, cfg: &Value) -> Result<(), String> {
        if !self.singbox_path().exists() {
            return Err(
                "sing-box.exe не найден. Проверьте, что бинарник встроен в приложение.".into(),
            );
        }
        self.stop_inner();
        // Прибиваем осиротевшие sing-box от прошлых запусков (например,
        // после обновления через установщик): они держат файлы занятыми
        // и мешают установке/перезапуску. Узнаём свои по пути конфига
        // в командной строке, чужие процессы не трогаем.
        kill_orphans(&self.config_path);

        fs::create_dir_all(&self.data_dir).map_err(|e| format!("Ошибка каталога данных: {e}"))?;
        let mut cfg = cfg.clone();
        cfg["log"] = json!({
            "level": "info",
            "output": self.log_path,
        });
        let raw = serde_json::to_string_pretty(&cfg)
            .map_err(|e| format!("Ошибка сериализации конфига: {e}"))?;
        fs::write(&self.config_path, raw).map_err(|e| format!("Ошибка записи конфига: {e}"))?;
        if self.log_path.exists() {
            let _ = fs::remove_file(&self.log_path);
        }

        let mut cmd = Command::new(self.singbox_path());
        cmd.arg("run")
            .arg("-c")
            .arg(&self.config_path)
            .current_dir(&self.data_dir);

        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        let child = cmd
            .spawn()
            .map_err(|e| format!("Не удалось запустить sing-box: {e}"))?;
        *self.child.lock().unwrap() = Some(child);

        // ждём, пока поднимется Clash API
        let clash = crate::clash::ClashClient::new(self.clash_port);
        for _ in 0..30 {
            std::thread::sleep(std::time::Duration::from_millis(200));
            if clash.alive() {
                winutil::set_system_proxy("127.0.0.1", self.mixed_port)?;
                return Ok(());
            }
            if !self.is_running() {
                return Err(format!(
                    "sing-box завершился с ошибкой. Лог: {}",
                    read_tail(&self.log_path).unwrap_or_else(|| "нет лога".into())
                ));
            }
        }
        Err("Таймаут ожидания sing-box. Проверьте корректность профиля.".into())
    }

    pub fn stop(&self) {
        self.stop_inner();
        let _ = winutil::clear_system_proxy();
    }

    /// Прибивает осиротевшие процессы с нашим конфигом (для вызова
    /// извне, например перед установкой обновления).
    pub fn kill_stale(&self) {
        kill_orphans(&self.config_path);
    }

    fn stop_inner(&self) {
        if let Some(mut child) = self.child.lock().unwrap().take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }

    pub fn is_running(&self) -> bool {
        let mut guard = self.child.lock().unwrap();
        match guard.as_mut() {
            Some(child) => match child.try_wait() {
                Ok(Some(_)) => {
                    *guard = None;
                    false
                }
                Ok(None) => true,
                Err(_) => false,
            },
            None => false,
        }
    }
}

fn current_bin_dir() -> Option<PathBuf> {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
}

/// Копирует вспомогательные DLL (libcronet.dll и, при наличии, wintun.dll)
/// рядом с sing-box.exe, чтобы он мог их загрузить.
fn ensure_dlls(bin_dir: &Path, resource_dir: &Path) {
    for dll in ["libcronet.dll", "wintun.dll"] {
        let dest = bin_dir.join(dll);
        if dest.exists() {
            continue;
        }
        for candidate in [
            resource_dir.join(dll),
            resource_dir.join("resources").join(dll),
            bin_dir.join(dll),
        ] {
            if candidate.exists() {
                let _ = fs::copy(&candidate, &dest);
                break;
            }
        }
    }
}

/// Завершает процессы sing-box.exe, запущенные с нашим конфигом
/// (остатки прошлых запусков/обновлений). Чужие процессы не трогает.
#[cfg(windows)]
fn kill_orphans(config_path: &Path) {
    let pattern = format!("*{}*", config_path.to_string_lossy());
    let script = format!(
        "Get-CimInstance Win32_Process -Filter \"Name = 'sing-box.exe'\" \
         | Where-Object {{ $_.CommandLine -like '{pattern}' }} \
         | ForEach-Object {{ try {{ Stop-Process -Id $_.ProcessId -Force }} catch {{}} }}"
    );
    let _ = std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command", &script])
        .output();
}

#[cfg(not(windows))]
fn kill_orphans(_config_path: &Path) {}

fn read_tail(path: &Path) -> Option<String> {    let raw = fs::read_to_string(path).ok()?;
    let lines: Vec<&str> = raw.lines().collect();
    let start = lines.len().saturating_sub(30);
    Some(lines[start..].join("\n"))
}
