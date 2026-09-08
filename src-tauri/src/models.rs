use serde::{Deserialize, Serialize};

use crate::vless::VlessProfile;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Profile {
    Vless(VlessProfile),
    Json(String),
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Rules {
    /// Домены, которые идут через VPN
    pub domain_proxy: Vec<String>,
    /// Домены, которые идут напрямую
    pub domain_direct: Vec<String>,
    /// Приложения (имена процессов), идущие через VPN
    pub process_proxy: Vec<String>,
    /// Приложения (имена процессов), идущие напрямую
    pub process_direct: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub mixed_port: u16,
    pub clash_port: u16,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            mixed_port: 2080,
            clash_port: 9090,
        }
    }
}

/// Состояние пресетного (встроенного) сайта: перекрытия поверх дефолтов.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PresetSiteState {
    pub id: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub deleted: bool,
    #[serde(default = "default_true")]
    pub include_subdomains: bool,
    #[serde(default)]
    pub subdomains: Vec<String>,
    /// Скрыть название и адрес сайта (глазик).
    #[serde(default)]
    pub hidden: bool,
}

impl PresetSiteState {
    pub fn default_for(id: &str) -> Self {
        Self {
            id: id.to_string(),
            enabled: true,
            deleted: false,
            include_subdomains: true,
            subdomains: Vec::new(),
            hidden: false,
        }
    }
}

/// Список пресетных сайтов. Принимает старый плоский формат
/// `{"youtube": true, ...}` и новый `{"states": [...]}`.
#[derive(Debug, Clone, Default)]
pub struct PresetSites {
    pub states: Vec<PresetSiteState>,
}

impl Serialize for PresetSites {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let mut st = s.serialize_struct("PresetSites", 1)?;
        st.serialize_field("states", &self.states)?;
        st.end()
    }
}

impl<'de> Deserialize<'de> for PresetSites {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let v = serde_json::Value::deserialize(d)?;
        if let Some(states) = v.get("states").and_then(serde_json::Value::as_array) {
            let states = states
                .iter()
                .map(|s| serde_json::from_value(s.clone()))
                .collect::<Result<Vec<PresetSiteState>, _>>()
                .map_err(serde::de::Error::custom)?;
            return Ok(PresetSites { states });
        }
        // старый плоский формат {"youtube": true, ...}
        let ids = ["youtube", "chatgpt", "instagram", "twitch", "opencode"];
        let states = ids
            .iter()
            .map(|id| {
                let mut st = PresetSiteState::default_for(id);
                st.enabled = v
                    .get(*id)
                    .and_then(serde_json::Value::as_bool)
                    .unwrap_or(true);
                st
            })
            .collect();
        Ok(PresetSites { states })
    }
}

impl PresetSites {
    pub fn state(&self, id: &str) -> PresetSiteState {
        self.states
            .iter()
            .find(|s| s.id == id)
            .cloned()
            .unwrap_or_else(|| PresetSiteState::default_for(id))
    }

    fn entry(&mut self, id: &str) -> &mut PresetSiteState {
        if let Some(i) = self.states.iter().position(|s| s.id == id) {
            &mut self.states[i]
        } else {
            self.states.push(PresetSiteState::default_for(id));
            self.states.last_mut().unwrap()
        }
    }

    pub fn set_enabled(&mut self, id: &str, enabled: bool) {
        self.entry(id).enabled = enabled;
    }

    pub fn set_deleted(&mut self, id: &str, deleted: bool) {
        self.entry(id).deleted = deleted;
    }

    pub fn set_include_subdomains(&mut self, id: &str, include: bool) {
        self.entry(id).include_subdomains = include;
    }

    pub fn set_hidden(&mut self, id: &str, hidden: bool) {
        self.entry(id).hidden = hidden;
    }

    pub fn add_subdomain(&mut self, id: &str, sub: String) {
        let st = self.entry(id);
        if !st.subdomains.iter().any(|s| s == &sub) {
            st.subdomains.push(sub);
        }
    }

    pub fn remove_subdomain(&mut self, id: &str, sub: &str) {
        self.entry(id).subdomains.retain(|s| s != sub);
    }

    pub fn restore_all(&mut self) {
        for st in self.states.iter_mut() {
            st.deleted = false;
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    #[serde(default)]
    pub profile: Option<Profile>,
    #[serde(default)]
    pub rules: Rules,
    #[serde(default)]
    pub settings: Settings,
    #[serde(default)]
    pub preset_sites: PresetSites,
    #[serde(default)]
    pub custom_sites: Vec<CustomSite>,
}

fn default_true() -> bool {
    true
}

/// Пользовательский сайт-переключатель. Правило действует на сайт и его
/// поддомены: либо на все (include_subdomains), либо на добавленные вручную.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomSite {
    pub id: String,
    pub label: String,
    pub domain: String,
    pub enabled: bool,
    #[serde(default = "default_true")]
    pub include_subdomains: bool,
    #[serde(default)]
    pub subdomains: Vec<String>,
    /// Скрыть название и адрес сайта (глазик).
    #[serde(default)]
    pub hidden: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusInfo {
    pub running: bool,
    pub connected: bool,
    pub profile_name: Option<String>,
    pub server: Option<String>,
    pub error: Option<String>,
}

impl Default for StatusInfo {
    fn default() -> Self {
        Self {
            running: false,
            connected: false,
            profile_name: None,
            server: None,
            error: None,
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PingInfo {
    pub server_ms: Option<u64>,
    pub latency_ms: Option<u64>,
    pub error: Option<String>,
}

/// Одно активное соединение из Clash API sing-box.
/// `outbound` — тег исходящего подключения (последний в цепочке);
/// `via_proxy` — true, если трафик идёт не через direct (т.е. через VPN).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionInfo {
    pub id: String,
    /// Домен (при включённом sniffing) либо IP:порт назначения.
    pub host: String,
    pub process: Option<String>,
    pub network: String,
    pub source: String,
    pub destination: String,
    pub outbound: String,
    pub via_proxy: bool,
    pub upload: u64,
    pub download: u64,
    pub start: String,
}