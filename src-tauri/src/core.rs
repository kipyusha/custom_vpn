use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::Duration;

use serde_json::json;
use tauri::{AppHandle, Emitter};

use crate::clash::{spawn_traffic_thread, ClashClient};
use crate::config;
use crate::models::{AppConfig, ConnectionInfo, PingInfo, Profile, StatusInfo};
use crate::ping;
use crate::singbox::SingBox;
use crate::store::Store;

#[derive(Default)]
pub struct TrafficState {
    pub up_speed: u64,
    pub down_speed: u64,
}

struct Workers {
    running: Arc<AtomicBool>,
    handles: Vec<JoinHandle<()>>,
}

pub struct Core {
    store: Store,
    singbox: SingBox,
    status: Mutex<StatusInfo>,
    ping: Mutex<PingInfo>,
    traffic: Mutex<TrafficState>,
    connections: Mutex<Vec<ConnectionInfo>>,
    server: Mutex<Option<(String, u16)>>,
    connected_at: Mutex<Option<std::time::SystemTime>>,
    workers: Mutex<Option<Workers>>,
}

impl Core {
    pub fn new(data_dir: std::path::PathBuf, resource_dir: std::path::PathBuf) -> Self {
        let cfg = Store::new(data_dir.clone()).load();
        let singbox = SingBox::new(
            data_dir.clone(),
            resource_dir,
            cfg.settings.mixed_port,
            cfg.settings.clash_port,
        );
        let server = profile_server(&cfg);
        let store = Store::new(data_dir);
        Self {
            store,
            singbox,
            status: Mutex::new(StatusInfo::default()),
            ping: Mutex::new(PingInfo::default()),
            traffic: Mutex::new(TrafficState::default()),
            connections: Mutex::new(Vec::new()),
            server: Mutex::new(server),
            connected_at: Mutex::new(None),
            workers: Mutex::new(None),
        }
    }

    pub fn is_binary_available(&self) -> bool {
        self.singbox.is_available()
    }

    pub fn is_admin() -> bool {
        crate::winutil::is_admin()
    }

    // ---------- профиль ----------

    pub fn app_config(&self) -> AppConfig {
        self.store.load()
    }

    pub fn set_profile_vless(&self, link: &str) -> Result<(), String> {
        let p = crate::vless::parse_vless(link)?;
        let mut cfg = self.store.load();
        cfg.profile = Some(Profile::Vless(p.clone()));
        self.store.save(&cfg)?;
        *self.server.lock().unwrap() = Some((p.host.clone(), p.port));
        Ok(())
    }

    pub fn set_profile_json(&self, raw: &str) -> Result<(), String> {
        config::validate_json_config(raw)?;
        let mut cfg = self.store.load();
        cfg.profile = Some(Profile::Json(raw.to_string()));
        self.store.save(&cfg)?;
        if let Some(addr) = json_profile_server(raw) {
            *self.server.lock().unwrap() = Some(addr);
        }
        Ok(())
    }

    pub fn clear_profile(&self) -> Result<(), String> {
        let mut cfg = self.store.load();
        cfg.profile = None;
        self.store.save(&cfg)?;
        *self.server.lock().unwrap() = None;
        Ok(())
    }

    pub fn profile_summary(&self) -> Option<serde_json::Value> {
        match &self.store.load().profile {
            Some(Profile::Vless(p)) => Some(json!({
                "kind": "vless",
                "name": p.name,
                "server": format!("{}:{}", p.host, p.port),
                "security": p.security,
                "network": p.network,
            })),
            Some(Profile::Json(raw)) => Some(json!({
                "kind": "json",
                "name": "JSON-конфиг",
                "raw": raw,
            })),
            None => None,
        }
    }

    // ---------- правила ----------

    pub fn add_domain_rule(&self, domain: &str, action: &str) -> Result<(), String> {
        let domain = domain.trim().to_lowercase();
        if domain.is_empty() {
            return Err("Домен не может быть пустым".into());
        }
        let mut cfg = self.store.load();
        let list = match action {
            "proxy" => &mut cfg.rules.domain_proxy,
            "direct" => &mut cfg.rules.domain_direct,
            _ => return Err("Неизвестное действие правила".into()),
        };
        if !list.contains(&domain) {
            list.push(domain);
        }
        self.store.save(&cfg)
    }

    pub fn remove_domain_rule(&self, domain: &str, action: &str) -> Result<(), String> {
        let mut cfg = self.store.load();
        let list = match action {
            "proxy" => &mut cfg.rules.domain_proxy,
            "direct" => &mut cfg.rules.domain_direct,
            _ => return Err("Неизвестное действие правила".into()),
        };
        list.retain(|d| d != domain);
        self.store.save(&cfg)
    }

    pub fn rules(&self) -> crate::models::Rules {
        self.store.load().rules
    }

    /// Добавляет правило по имени процесса (например «Telegram.exe»).
    /// Применяется сразу, если VPN подключён.
    pub fn add_process_rule(&self, name: &str, action: &str) -> Result<(), String> {
        let name = name.trim();
        if name.is_empty() {
            return Err("Имя процесса не может быть пустым".into());
        }
        let mut cfg = self.store.load();
        let list = match action {
            "proxy" => &mut cfg.rules.process_proxy,
            "direct" => &mut cfg.rules.process_direct,
            _ => return Err("Неизвестное действие правила".into()),
        };
        if !list.iter().any(|n| n == name) {
            list.push(name.to_string());
        }
        self.persist(cfg)
    }

    pub fn remove_process_rule(&self, name: &str, action: &str) -> Result<(), String> {
        let mut cfg = self.store.load();
        let list = match action {
            "proxy" => &mut cfg.rules.process_proxy,
            "direct" => &mut cfg.rules.process_direct,
            _ => return Err("Неизвестное действие правила".into()),
        };
        list.retain(|n| n != name);
        self.persist(cfg)
    }

    /// Переключатель пресета сайта. Если VPN подключён — применяет новые
    /// правила сразу (перезапуск sing-box с обновлённым конфигом).
    pub fn set_preset_site(&self, id: &str, enabled: bool) -> Result<(), String> {
        let mut cfg = self.store.load();
        cfg.preset_sites.set_enabled(id, enabled);
        self.persist(cfg)
    }

    /// Удаляет пресетный сайт из списка (можно вернуть restore_preset_sites).
    pub fn delete_preset_site(&self, id: &str) -> Result<(), String> {
        let mut cfg = self.store.load();
        cfg.preset_sites.set_deleted(id, true);
        self.persist(cfg)
    }

    /// Возвращает удалённые пресетные сайты.
    pub fn restore_preset_sites(&self) -> Result<(), String> {
        let mut cfg = self.store.load();
        cfg.preset_sites.restore_all();
        self.persist(cfg)
    }

    pub fn set_preset_site_include_subdomains(&self, id: &str, include: bool) -> Result<(), String> {
        let mut cfg = self.store.load();
        cfg.preset_sites.set_include_subdomains(id, include);
        self.persist(cfg)
    }

    /// Добавляет поддомен к пресетному сайту.
    pub fn add_preset_site_subdomain(&self, id: &str, subdomain: &str) -> Result<(), String> {
        let sub = parse_site_domain(subdomain)?;
        let def = config::PRESET_SITES
            .iter()
            .find(|p| p.id == id)
            .ok_or("Сайт не найден")?;
        if def.domains.contains(&sub.as_str()) {
            return Err("Это основной домен сайта".into());
        }
        let mut cfg = self.store.load();
        if cfg.preset_sites.state(id).subdomains.iter().any(|d| d == &sub) {
            return Err(format!("Поддомен {sub} уже добавлен"));
        }
        cfg.preset_sites.add_subdomain(id, sub.clone());
        self.persist(cfg)
    }

    pub fn remove_preset_site_subdomain(&self, id: &str, subdomain: &str) -> Result<(), String> {
        let mut cfg = self.store.load();
        cfg.preset_sites.remove_subdomain(id, subdomain);
        self.persist(cfg)
    }

    /// Скрывает/показывает название и адрес сайта (глазик). Сохраняется,
    /// но не влияет на маршрутизацию — перезапуск VPN не требуется.
    pub fn set_site_hidden(&self, kind: &str, id: &str, hidden: bool) -> Result<(), String> {
        let mut cfg = self.store.load();
        match kind {
            "preset" => cfg.preset_sites.set_hidden(id, hidden),
            "custom" => {
                let site = cfg
                    .custom_sites
                    .iter_mut()
                    .find(|s| s.id == id)
                    .ok_or("Сайт не найден")?;
                site.hidden = hidden;
            }
            _ => return Err("Неизвестный тип сайта".into()),
        }
        self.persist_quiet(cfg)
    }

    /// Добавляет пользовательский сайт-переключатель из ссылки или домена.
    pub fn add_custom_site(&self, link: &str) -> Result<(), String> {
        let domain = parse_site_domain(link)?;
        let mut cfg = self.store.load();
        if cfg.custom_sites.iter().any(|s| s.domain == domain) {
            return Err(format!("Сайт {domain} уже добавлен"));
        }
        let id = format!(
            "c{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        );
        cfg.custom_sites.push(crate::models::CustomSite {
            id,
            label: domain.clone(),
            domain,
            enabled: true,
            include_subdomains: true,
            subdomains: Vec::new(),
            hidden: false,
        });
        self.persist(cfg)
    }

    pub fn remove_custom_site(&self, id: &str) -> Result<(), String> {
        let mut cfg = self.store.load();
        cfg.custom_sites.retain(|s| s.id != id);
        self.persist(cfg)
    }

    pub fn set_custom_site(&self, id: &str, enabled: bool) -> Result<(), String> {
        let mut cfg = self.store.load();
        let site = cfg
            .custom_sites
            .iter_mut()
            .find(|s| s.id == id)
            .ok_or("Сайт не найден")?;
        site.enabled = enabled;
        self.persist(cfg)
    }

    /// Добавляет поддомен к пользовательскому сайту. Переключатель сайта
    /// распространяется и на добавленные поддомены.
    pub fn add_custom_site_subdomain(&self, id: &str, subdomain: &str) -> Result<(), String> {
        let sub = parse_site_domain(subdomain)?;
        let mut cfg = self.store.load();
        let site = cfg
            .custom_sites
            .iter_mut()
            .find(|s| s.id == id)
            .ok_or("Сайт не найден")?;
        if sub == site.domain {
            return Err("Это основной домен сайта".into());
        }
        if site.subdomains.iter().any(|d| d == &sub) {
            return Err(format!("Поддомен {sub} уже добавлен"));
        }
        site.subdomains.push(sub);
        self.persist(cfg)
    }

    pub fn remove_custom_site_subdomain(&self, id: &str, subdomain: &str) -> Result<(), String> {
        let mut cfg = self.store.load();
        let site = cfg
            .custom_sites
            .iter_mut()
            .find(|s| s.id == id)
            .ok_or("Сайт не найден")?;
        site.subdomains.retain(|d| d != subdomain);
        self.persist(cfg)
    }

    /// Переключает, покрывает ли правило сайта все его поддомены
    /// (domain_suffix) или только точный домен (domain).
    pub fn set_custom_site_include_subdomains(&self, id: &str, include: bool) -> Result<(), String> {
        let mut cfg = self.store.load();
        let site = cfg
            .custom_sites
            .iter_mut()
            .find(|s| s.id == id)
            .ok_or("Сайт не найден")?;
        site.include_subdomains = include;
        self.persist(cfg)
    }

    fn persist(&self, cfg: crate::models::AppConfig) -> Result<(), String> {
        self.store.save(&cfg)?;
        if self.status.lock().unwrap().connected {
            self.apply_rules_now()?;
        }
        Ok(())
    }

    /// Сохраняет конфиг без перезапуска sing-box (для изменений, не влияющих
    /// на маршрутизацию — например, скрытие названия сайта).
    fn persist_quiet(&self, cfg: crate::models::AppConfig) -> Result<(), String> {
        self.store.save(&cfg)
    }

    fn apply_rules_now(&self) -> Result<(), String> {
        let cfg = self.store.load();
        let built = config::build_singbox_config(&cfg)?;
        self.singbox.start(&built)
    }

    // ---------- подключение ----------

    pub fn connect(self: &Arc<Self>, app: &AppHandle) -> Result<(), String> {
        if self.status.lock().unwrap().connected {
            return Err("Уже подключено".into());
        }
        let cfg = self.store.load();
        let built = config::build_singbox_config(&cfg)?;
        self.singbox.start(&built)?;

        self.start_workers(app.clone());

        let (name, server) = match &cfg.profile {
            Some(Profile::Vless(p)) => (p.name.clone(), format!("{}:{}", p.host, p.port)),
            Some(Profile::Json(_)) => ("JSON-конфиг".into(), "по конфигу".into()),
            None => ("-".into(), "-".into()),
        };
        *self.status.lock().unwrap() = StatusInfo {
            running: true,
            connected: true,
            profile_name: Some(name),
            server: Some(server),
            error: None,
        };
        *self.connected_at.lock().unwrap() = Some(std::time::SystemTime::now());
        self.emit_status(app);
        Ok(())
    }

    pub fn disconnect(self: &Arc<Self>, app: &AppHandle) {
        self.stop_workers();
        self.singbox.stop();
        *self.connected_at.lock().unwrap() = None;
        *self.status.lock().unwrap() = StatusInfo::default();
        self.connections.lock().unwrap().clear();
        self.emit_status(app);
    }

    pub fn get_status(&self) -> StatusInfo {
        self.status.lock().unwrap().clone()
    }

    pub fn get_ping(&self) -> PingInfo {
        self.ping.lock().unwrap().clone()
    }

    pub fn get_traffic(&self) -> (u64, u64) {
        let t = self.traffic.lock().unwrap();
        (t.up_speed, t.down_speed)
    }

    /// Последний снимок активных соединений (обновляется фоновым потоком).
    pub fn get_connections(&self) -> Vec<ConnectionInfo> {
        self.connections.lock().unwrap().clone()
    }

    /// Время начала подключения в unix-миллисекундах (None, если не подключено).
    pub fn connected_since_ms(&self) -> Option<u64> {
        self.connected_at
            .lock()
            .unwrap()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
    }

    // ---------- потоки ----------

    fn start_workers(self: &Arc<Self>, app: AppHandle) {
        self.stop_workers();
        let running = Arc::new(AtomicBool::new(true));

        let mut handles: Vec<JoinHandle<()>> = Vec::new();

        // трафик
        let core = self.clone();
        let app_t = app.clone();
        let clash_port = self.singbox.clash_port();
        handles.push(spawn_traffic_thread(
            clash_port,
            running.clone(),
            move |up, down| {
                {
                    let mut t = core.traffic.lock().unwrap();
                    t.up_speed = up;
                    t.down_speed = down;
                }
                let _ = app_t.emit("traffic", json!({ "up": up, "down": down }));
            },
        ));

        // соединения (для вкладки мониторинга)
        let core = self.clone();
        let app_c = app.clone();
        let r_conn = running.clone();
        handles.push(std::thread::spawn(move || {
            while r_conn.load(Ordering::Relaxed) {
                std::thread::sleep(Duration::from_secs(1));
                if !r_conn.load(Ordering::Relaxed) {
                    break;
                }
                let list = ClashClient::new(core.singbox.clash_port()).connections();
                *core.connections.lock().unwrap() = list.clone();
                let _ = app_c.emit("connections", &list);
            }
        }));

        // пинг
        let core = self.clone();
        let app_p = app.clone();
        let mixed_port = self.singbox.mixed_port();
        let r_ping = running.clone();
        handles.push(std::thread::spawn(move || {
            while r_ping.load(Ordering::Relaxed) {
                std::thread::sleep(Duration::from_secs(4));
                if !r_ping.load(Ordering::Relaxed) {
                    break;
                }
                let (host, port) = core
                    .server
                    .lock()
                    .unwrap()
                    .clone()
                    .unwrap_or_else(|| (String::new(), 0));
                let server_ms = if host.is_empty() {
                    None
                } else {
                    ping::server_connect_ms(&host, port)
                };
                let latency_ms = ping::proxy_latency_ms(mixed_port);
                let info = PingInfo {
                    server_ms,
                    latency_ms,
                    error: None,
                };
                *core.ping.lock().unwrap() = info.clone();
                let _ = app_p.emit("ping", &info);
            }
        }));

        // статус
        let core = self.clone();
        let app_s = app.clone();
        let r_status = running.clone();
        handles.push(std::thread::spawn(move || {
            while r_status.load(Ordering::Relaxed) {
                std::thread::sleep(Duration::from_secs(2));
                if !r_status.load(Ordering::Relaxed) {
                    break;
                }
                let alive =
                    core.singbox.is_running() && ClashClient::new(core.singbox.clash_port()).alive();
                let mut st = core.status.lock().unwrap();
                let changed = st.connected != alive;
                st.connected = alive;
                st.running = alive;
                drop(st);
                if changed {
                    core.emit_status(&app_s);
                }
            }
        }));

        *self.workers.lock().unwrap() = Some(Workers { running, handles });
    }

    fn stop_workers(&self) {
        if let Some(workers) = self.workers.lock().unwrap().take() {
            workers.running.store(false, Ordering::Relaxed);
            for h in workers.handles {
                let _ = h.join();
            }
        }
    }

    fn emit_status(&self, app: &AppHandle) {
        let st = self.status.lock().unwrap().clone();
        let _ = app.emit("status", &st);
    }
}

fn profile_server(cfg: &AppConfig) -> Option<(String, u16)> {
    match &cfg.profile {
        Some(Profile::Vless(p)) => Some((p.host.clone(), p.port)),
        Some(Profile::Json(raw)) => json_profile_server(raw),
        None => None,
    }
}

fn json_profile_server(raw: &str) -> Option<(String, u16)> {
    let v: serde_json::Value = serde_json::from_str(raw).ok()?;
    let outbounds = v.get("outbounds")?.as_array()?;
    let first = outbounds.first()?;
    let host = first.get("server")?.as_str()?.to_string();
    let port = first.get("server_port")?.as_u64()? as u16;
    Some((host, port))
}

/// Извлекает базовый домен из ссылки или имени хоста (без схемы и «www.»).
fn parse_site_domain(link: &str) -> Result<String, String> {
    let mut input = link.trim().to_string();
    if !input.contains("://") {
        input = format!("https://{input}");
    }
    let url = url::Url::parse(&input)
        .map_err(|_| String::from("Не удалось распознать адрес сайта"))?;
    let host = url
        .host_str()
        .ok_or_else(|| String::from("В адресе нет домена"))?
        .to_lowercase();
    let domain = host.strip_prefix("www.").unwrap_or(&host).to_string();
    if domain.is_empty() {
        return Err(String::from("В адресе нет домена"));
    }
    Ok(domain)
}

#[cfg(test)]
mod tests {
    use super::parse_site_domain;

    #[test]
    fn parses_full_url() {
        assert_eq!(
            parse_site_domain("https://www.netflix.com/watch/123").unwrap(),
            "netflix.com"
        );
        assert_eq!(parse_site_domain("https://rutracker.org/forum/").unwrap(), "rutracker.org");
    }

    #[test]
    fn parses_bare_domain() {
        assert_eq!(parse_site_domain("netflix.com").unwrap(), "netflix.com");
        assert_eq!(parse_site_domain(" www.reddit.com ").unwrap(), "reddit.com");
    }

    #[test]
    fn rejects_garbage() {
        assert!(parse_site_domain("не адрес").is_err());
        assert!(parse_site_domain("").is_err());
    }
}