use std::fs;
use std::path::PathBuf;

use crate::models::AppConfig;

pub struct Store {
    path: PathBuf,
}

impl Store {
    pub fn new(data_dir: PathBuf) -> Self {
        Self {
            path: data_dir.join("config.json"),
        }
    }

    pub fn load(&self) -> AppConfig {
        match fs::read_to_string(&self.path) {
            Ok(raw) => serde_json::from_str(&raw).unwrap_or_default(),
            Err(_) => AppConfig::default(),
        }
    }

    pub fn save(&self, cfg: &AppConfig) -> Result<(), String> {
        let raw = serde_json::to_string_pretty(cfg)
            .map_err(|e| format!("Ошибка сериализации: {e}"))?;
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("Ошибка создания каталога: {e}"))?;
        }
        fs::write(&self.path, raw).map_err(|e| format!("Ошибка записи: {e}"))
    }
}