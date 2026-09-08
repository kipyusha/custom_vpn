use serde_json::{json, Value};

use crate::models::{AppConfig, Profile};
use crate::vless::VlessProfile;

const PROXY_TYPES: &[&str] = &[
    "vless",
    "vmess",
    "trojan",
    "shadowsocks",
    "hysteria",
    "hysteria2",
    "tuic",
    "wireguard",
    "http",
    "socks",
];

/// Пресет сайта: переключатель «через VPN / напрямую».
pub struct PresetSiteDef {
    pub id: &'static str,
    pub domains: &'static [&'static str],
}

pub const PRESET_SITES: &[PresetSiteDef] = &[
    PresetSiteDef {
        id: "youtube",
        domains: &["youtube.com", "youtu.be", "googlevideo.com", "ytimg.com"],
    },
    PresetSiteDef {
        id: "chatgpt",
        domains: &["chatgpt.com", "openai.com"],
    },
    PresetSiteDef {
        id: "instagram",
        domains: &["instagram.com", "cdninstagram.com"],
    },
    PresetSiteDef {
        id: "twitch",
        domains: &["twitch.tv", "jtvnw.net", "ttvnw.net"],
    },
    PresetSiteDef {
        id: "opencode",
        domains: &["opencode.ai"],
    },
];

pub fn vless_outbound(p: &VlessProfile) -> Value {
    let mut ob = json!({
        "type": "vless",
        "tag": "proxy",
        "server": p.host,
        "server_port": p.port,
        "uuid": p.uuid,
    });

    if let Some(flow) = &p.flow {
        ob["flow"] = json!(flow);
    }

    if p.security != "none" {
        let mut tls = json!({ "enabled": true });
        if let Some(sni) = &p.sni {
            tls["server_name"] = json!(sni);
        }
        if p.allow_insecure {
            tls["insecure"] = json!(true);
        }
        if let Some(fp) = &p.fp {
            tls["utls"] = json!({ "enabled": true, "fingerprint": fp });
        }
        if p.security == "reality" {
            let mut reality = json!({ "enabled": true });
            if let Some(pbk) = &p.pbk {
                reality["public_key"] = json!(pbk);
            }
            if let Some(sid) = &p.sid {
                reality["short_id"] = json!(sid);
            }
            tls["reality"] = reality;
        }
        ob["tls"] = tls;
    }

    match p.network.as_str() {
        "ws" => {
            let mut tr = json!({ "type": "ws" });
            if let Some(path) = &p.ws_path {
                tr["path"] = json!(path);
            }
            if let Some(host) = &p.ws_host {
                tr["headers"] = json!({ "Host": host });
            }
            ob["transport"] = tr;
        }
        "grpc" => {
            let mut tr = json!({ "type": "grpc" });
            if let Some(service) = &p.grpc_service {
                tr["service_name"] = json!(service);
            }
            ob["transport"] = tr;
        }
        _ => {}
    }

    ob
}

fn mixed_inbound(port: u16) -> Value {
    json!({
        "type": "mixed",
        "tag": "mixed-in",
        "listen": "127.0.0.1",
        "listen_port": port,
        // Сниффинг домена из TLS/HTTP, чтобы в мониторинге соединений
        // были видны сайты, а не только IP. Перезапись назначения не нужна
        // (маршрутизация по правилам), только определение домена.
        "sniff": true,
        "sniff_override_destination": false
    })
}

fn domain_rule(domain: &str, outbound: &str) -> Value {
    json!({
        "domain_suffix": [domain],
        "action": "route",
        "outbound": outbound
    })
}

fn process_rule(name: &str, outbound: &str) -> Value {
    json!({
        "process_name": [name],
        "action": "route",
        "outbound": outbound
    })
}

/// Правило на сайт: либо одно `domain_suffix` на все домены и поддомены,
/// либо точный `domain` + отдельные суффиксы на каждый добавленный поддомен.
fn site_rules(base_domains: &[String], subdomains: &[String], include: bool, outbound: &str) -> Vec<Value> {
    let mut rules = Vec::new();
    if include {
        let mut all = base_domains.to_vec();
        all.extend(subdomains.iter().cloned());
        rules.push(json!({
            "domain_suffix": all,
            "action": "route",
            "outbound": outbound
        }));
    } else {
        rules.push(json!({
            "domain": base_domains,
            "action": "route",
            "outbound": outbound
        }));
        for sd in subdomains {
            rules.push(json!({
                "domain_suffix": [sd],
                "action": "route",
                "outbound": outbound
            }));
        }
    }
    rules
}

fn detect_proxy_tag(outbounds: &Value) -> String {
    if let Some(arr) = outbounds.as_array() {
        for ob in arr {
            let t = ob.get("type").and_then(Value::as_str).unwrap_or("");
            if PROXY_TYPES.contains(&t) {
                return ob
                    .get("tag")
                    .and_then(Value::as_str)
                    .unwrap_or("proxy")
                    .to_string();
            }
        }
    }
    "proxy".to_string()
}

fn detect_direct_tag(outbounds: &mut Vec<Value>) -> String {
    for ob in outbounds.iter() {
        if ob.get("type").and_then(Value::as_str) == Some("direct") {
            return ob
                .get("tag")
                .and_then(Value::as_str)
                .unwrap_or("direct")
                .to_string();
        }
    }
    outbounds.push(json!({ "type": "direct", "tag": "direct" }));
    "direct".to_string()
}

fn ensure_inbounds(cfg: &mut Value, port: u16) -> Result<(), String> {
    let has_inbound = cfg
        .get("inbounds")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter().any(|inb| {
                let t = inb.get("type").and_then(Value::as_str).unwrap_or("");
                matches!(t, "mixed" | "http" | "socks" | "tun" | "redirect" | "tproxy")
            })
        })
        .unwrap_or(false);

    if !has_inbound {
        cfg["inbounds"] = json!([mixed_inbound(port)]);
    }
    Ok(())
}

fn ensure_outbounds(cfg: &mut Value) -> Result<String, String> {
    if !cfg.get("outbounds").is_some() {
        return Err(
            "В JSON-конфиге отсутствует поле \"outbounds\". Добавьте список исходящих подключений."
                .into(),
        );
    }
    let outbounds = cfg
        .get_mut("outbounds")
        .and_then(Value::as_array_mut)
        .ok_or_else(|| "Поле \"outbounds\" должно быть массивом".to_string())?;
    Ok(detect_direct_tag(outbounds))
}

/// Собирает полный JSON-конфиг sing-box из профиля, правил и настроек.
pub fn build_singbox_config(app: &AppConfig) -> Result<Value, String> {
    let mut cfg: Value = match &app.profile {
        Some(Profile::Vless(p)) => json!({
            "inbounds": [mixed_inbound(app.settings.mixed_port)],
            "outbounds": [vless_outbound(p)]
        }),
        Some(Profile::Json(j)) => serde_json::from_str(j)
            .map_err(|e| format!("Некорректный JSON-конфиг: {e}"))?,
        None => return Err("Профиль не задан. Вставьте ссылку vless:// или JSON-конфиг.".into()),
    };

    ensure_inbounds(&mut cfg, app.settings.mixed_port)?;
    let _direct_tag = ensure_outbounds(&mut cfg)?;

    let proxy_tag = detect_proxy_tag(cfg.get("outbounds").unwrap());
    let direct_tag = detect_direct_tag(
        cfg.get_mut("outbounds")
            .and_then(Value::as_array_mut)
            .ok_or("Поле \"outbounds\" должно быть массивом")?,
    );

    let proxy_domains: Vec<&str> = app.rules.domain_proxy.iter().map(String::as_str).collect();
    let direct_domains: Vec<&str> = app
        .rules
        .domain_direct
        .iter()
        .map(String::as_str)
        .collect();

    let mut rules: Vec<Value> = Vec::new();
    // правила по процессам имеют приоритет над правилами по доменам
    for p in &app.rules.process_direct {
        rules.push(process_rule(p, &direct_tag));
    }
    for p in &app.rules.process_proxy {
        rules.push(process_rule(p, &proxy_tag));
    }
    for d in direct_domains {
        rules.push(domain_rule(d, &direct_tag));
    }
    for d in proxy_domains {
        rules.push(domain_rule(d, &proxy_tag));
    }
    // переключатели сайтов: пресетные и пользовательские, с учётом поддоменов
    for ps in PRESET_SITES {
        let st = app.preset_sites.state(ps.id);
        if st.deleted {
            continue;
        }
        let outbound = if st.enabled { &proxy_tag } else { &direct_tag };
        let base: Vec<String> = ps.domains.iter().map(|s| s.to_string()).collect();
        rules.extend(site_rules(&base, &st.subdomains, st.include_subdomains, outbound));
    }
    for cs in &app.custom_sites {
        let outbound = if cs.enabled { &proxy_tag } else { &direct_tag };
        rules.extend(site_rules(&[cs.domain.clone()], &cs.subdomains, cs.include_subdomains, outbound));
    }
    // по умолчанию весь остальной трафик идёт напрямую (через VPN — только
    // сайты, перечисленные в правилах и переключателях)
    rules.push(json!({ "action": "route", "outbound": direct_tag }));

    cfg["route"] = json!({
        "rules": rules,
        "auto_detect_interface": true
    });

    cfg["experimental"] = json!({
        "clash_api": {
            "external_controller": format!("127.0.0.1:{}", app.settings.clash_port)
        }
    });

    Ok(cfg)
}

/// Базовая проверка JSON-конфига: валидный JSON + наличие outbounds.
pub fn validate_json_config(raw: &str) -> Result<(), String> {
    let v: Value =
        serde_json::from_str(raw).map_err(|e| format!("Некорректный JSON: {e}"))?;
    if !v.get("outbounds").is_some() {
        return Err("В конфиге отсутствует поле \"outbounds\"".into());
    }
    if !v.get("outbounds").and_then(Value::as_array).is_some() {
        return Err("Поле \"outbounds\" должно быть массивом".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{Rules, Settings};
    use crate::vless::parse_vless;

    fn sample_app() -> AppConfig {
        let link = "vless://6f9b0fce-2d6e-4b2e-9b6a-3d0a1e7f4c22@example.com:443?security=reality&sni=www.example.com&fp=chrome&pbk=testpbk&sid=abcd1234&flow=xtls-rprx-vision&encryption=none#Srv";
        AppConfig {
            profile: Some(Profile::Vless(parse_vless(link).unwrap())),
            rules: Rules {
                domain_direct: vec!["yandex.ru".into()],
                domain_proxy: vec!["google.com".into()],
                ..Default::default()
            },
            settings: Settings::default(),
            preset_sites: Default::default(),
            custom_sites: Vec::new(),
        }
    }

    #[test]
    fn builds_full_config() {
        let cfg = build_singbox_config(&sample_app()).unwrap();
        assert_eq!(cfg["inbounds"][0]["type"], "mixed");
        assert_eq!(cfg["outbounds"][0]["type"], "vless");
        assert_eq!(cfg["outbounds"][0]["server"], "example.com");
        assert_eq!(cfg["outbounds"][0]["tls"]["reality"]["enabled"], true);
        let rules = cfg["route"]["rules"].as_array().unwrap();
        // 1 прямая + 1 через VPN (ручные домены) + 5 пресетных + финальное = 8
        assert_eq!(rules.len(), 8);
        // по умолчанию трафик идёт напрямую
        assert_eq!(rules.last().unwrap()["outbound"], "direct");
        // пресеты включены по умолчанию → один суффиксный rule со всеми доменами
        let proxy_suffix: Vec<&Value> = rules
            .iter()
            .filter(|r| r.get("outbound").and_then(Value::as_str) == Some("proxy"))
            .filter(|r| r.get("domain_suffix").is_some())
            .collect();
        assert!(proxy_suffix.iter().any(|r| r["domain_suffix"]
            .as_array()
            .map(|a| a.contains(&json!("youtube.com")))
            == Some(true)));
        assert!(proxy_suffix.iter().any(|r| r["domain_suffix"]
            .as_array()
            .map(|a| a.contains(&json!("openai.com")))
            == Some(true)));
        assert_eq!(
            cfg["experimental"]["clash_api"]["external_controller"],
            "127.0.0.1:9090"
        );
    }

    #[test]
    fn preset_disabled_goes_direct() {
        let mut app = sample_app();
        app.preset_sites.set_enabled("youtube", false);
        let cfg = build_singbox_config(&app).unwrap();
        let rules = cfg["route"]["rules"].as_array().unwrap();
        // у выключенного пресета все его домены идут в суффиксном правиле напрямую
        let direct_suffix: Vec<&Value> = rules
            .iter()
            .filter(|r| r.get("outbound").and_then(Value::as_str) == Some("direct"))
            .filter(|r| r.get("domain_suffix").is_some())
            .collect();
        assert!(direct_suffix.iter().any(|r| r["domain_suffix"]
            .as_array()
            .map(|a| a.contains(&json!("youtube.com")))
            == Some(true)));
        assert!(direct_suffix.iter().any(|r| r["domain_suffix"]
            .as_array()
            .map(|a| a.contains(&json!("googlevideo.com")))
            == Some(true)));
    }

    #[test]
    fn preset_state_overrides() {
        use crate::models::PresetSiteState;
        let mut app = sample_app();
        app.preset_sites.states.push(PresetSiteState {
            id: "youtube".into(),
            enabled: true,
            deleted: false,
            include_subdomains: false,
            subdomains: vec!["api.youtube.com".into()],
            hidden: true,
        });
        app.preset_sites.states.push(PresetSiteState {
            id: "twitch".into(),
            enabled: true,
            deleted: true,
            include_subdomains: true,
            subdomains: Vec::new(),
            hidden: false,
        });
        let cfg = build_singbox_config(&app).unwrap();
        let rules = cfg["route"]["rules"].as_array().unwrap();
        // youtube: include=false → точный domain rule с базовыми доменами
        let exact: Vec<&Value> = rules.iter().filter(|r| r.get("domain").is_some()).collect();
        assert!(exact.iter().any(|r| r["domain"]
            .as_array()
            .map(|a| a.contains(&json!("youtube.com")))
            == Some(true)));
        // добавленный поддомен api.youtube.com уходит через VPN суффиксом
        let proxy_suffix: Vec<&str> = rules
            .iter()
            .filter(|r| r.get("outbound").and_then(Value::as_str) == Some("proxy"))
            .filter_map(|r| {
                r.get("domain_suffix")
                    .and_then(Value::as_array)
                    .and_then(|a| a.first())
                    .and_then(Value::as_str)
            })
            .collect();
        assert!(proxy_suffix.contains(&"api.youtube.com"));
        // twitch удалён → его доменов нет ни в одном правиле
        let all_suffix: Vec<String> = rules
            .iter()
            .filter_map(|r| r.get("domain_suffix").and_then(Value::as_array))
            .flat_map(|a| a.iter().filter_map(Value::as_str).map(String::from))
            .collect();
        assert!(!all_suffix.iter().any(|d| d == "twitch.tv"));
        assert!(!all_suffix.iter().any(|d| d == "jtvnw.net"));
    }

    #[test]
    fn custom_site_with_subdomains() {
        use crate::models::CustomSite;
        let mut app = sample_app();
        app.custom_sites = vec![
            CustomSite {
                id: "c1".into(),
                label: "netflix.com".into(),
                domain: "netflix.com".into(),
                enabled: true,
                include_subdomains: true,
                subdomains: vec!["api.netflix.com".into()],
                hidden: false,
            },
            CustomSite {
                id: "c2".into(),
                label: "foo.com".into(),
                domain: "foo.com".into(),
                enabled: false,
                include_subdomains: false,
                subdomains: vec!["sub.foo.com".into()],
                hidden: false,
            },
        ];
        let cfg = build_singbox_config(&app).unwrap();
        let rules = cfg["route"]["rules"].as_array().unwrap();
        // c1 (через VPN, включая поддомены) — один rule с domain_suffix из 2 доменов
        let proxy_suffix: Vec<&Value> = rules
            .iter()
            .filter(|r| r.get("outbound").and_then(Value::as_str) == Some("proxy"))
            .collect();
        assert!(proxy_suffix
            .iter()
            .any(|r| r["domain_suffix"].as_array().map(|a| a.len() == 2) == Some(true)));
        // c2 (напрямую, только точный домен) — точный domain для foo.com
        let direct_exact: Vec<&Value> = rules
            .iter()
            .filter(|r| {
                r.get("outbound").and_then(Value::as_str) == Some("direct")
                    && r.get("domain").is_some()
            })
            .collect();
        assert!(direct_exact.iter().any(|r| r["domain"] == json!(["foo.com"])));
        // добавленный поддомен sub.foo.com уходит напрямую
        let direct_suffix: Vec<&str> = rules
            .iter()
            .filter(|r| r.get("outbound").and_then(Value::as_str) == Some("direct"))
            .filter_map(|r| {
                r.get("domain_suffix")
                    .and_then(Value::as_array)
                    .and_then(|a| a.first())
                    .and_then(Value::as_str)
            })
            .collect();
        assert!(direct_suffix.contains(&"sub.foo.com"));
    }

    #[test]
    fn process_rules_route() {
        let mut app = sample_app();
        app.rules.process_proxy = vec!["Telegram.exe".into()];
        app.rules.process_direct = vec!["notepad.exe".into()];
        let cfg = build_singbox_config(&app).unwrap();
        let rules = cfg["route"]["rules"].as_array().unwrap();
        // правила по процессам идут первыми
        assert_eq!(rules[0]["process_name"][0], "notepad.exe");
        assert_eq!(rules[0]["outbound"], "direct");
        assert_eq!(rules[1]["process_name"][0], "Telegram.exe");
        assert_eq!(rules[1]["outbound"], "proxy");
    }

    #[test]
    fn json_profile_is_wrapped() {
        let raw = r#"{"outbounds":[{"type":"vless","tag":"myproxy","server":"a.com","server_port":443,"uuid":"abc"}]}"#;
        let app = AppConfig {
            profile: Some(Profile::Json(raw.into())),
            rules: Rules {
                domain_direct: vec!["local.dev".into()],
                ..Default::default()
            },
            settings: Settings::default(),
            preset_sites: Default::default(),
            custom_sites: Vec::new(),
        };
        let cfg = build_singbox_config(&app).unwrap();
        // default rule goes to direct outbound
        let last = cfg["route"]["rules"]
            .as_array()
            .unwrap()
            .last()
            .unwrap()
            .clone();
        assert_eq!(last["outbound"], "direct");
        // а наш пресетный/ручной через VPN — в myproxy
        let proxy_rules = cfg["route"]["rules"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|r| r.get("outbound").and_then(Value::as_str) == Some("myproxy"));
        assert!(proxy_rules.count() >= 1);
    }

    #[test]
    fn missing_profile_errors() {
        assert!(build_singbox_config(&AppConfig::default()).is_err());
    }
}