use std::collections::HashMap;

use percent_encoding::percent_decode_str;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VlessProfile {
    pub name: String,
    pub uuid: String,
    pub host: String,
    pub port: u16,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub flow: Option<String>,
    /// none | tls | reality
    pub security: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sni: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fp: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pbk: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sid: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub spx: Option<String>,
    pub allow_insecure: bool,
    /// tcp | ws | grpc
    pub network: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ws_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ws_host: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub grpc_service: Option<String>,
}

fn pct_decode(s: &str) -> String {
    percent_decode_str(s)
        .decode_utf8_lossy()
        .into_owned()
}

pub fn parse_vless(input: &str) -> Result<VlessProfile, String> {
    let raw = input.trim();
    if !raw.starts_with("vless://") {
        return Err("Это не ссылка vless://".into());
    }
    let body = &raw["vless://".len()..];

    let (authority_and_query, fragment) = match body.split_once('#') {
        Some((a, f)) => (a, Some(pct_decode(f))),
        None => (body, None),
    };

    let (authority, query) = match authority_and_query.split_once('?') {
        Some((a, q)) => (a, Some(q)),
        None => (authority_and_query, None),
    };

    let mut params: HashMap<String, String> = HashMap::new();
    if let Some(q) = query {
        for pair in q.split('&') {
            if let Some((k, v)) = pair.split_once('=') {
                params.insert(k.to_string(), pct_decode(v));
            }
        }
    }

    // authority: uuid@host:port  (host may be [::1])
    let (uuid, addr) = authority
        .split_once('@')
        .ok_or_else(|| "Некорректная ссылка: не найден '@'".to_string())?;

    let host;
    let port;
    if addr.starts_with('[') {
        let end = addr
            .find(']')
            .ok_or_else(|| "Некорректный IPv6 адрес".to_string())?;
        host = addr[1..end].to_string();
        let rest = &addr[end + 1..];
        let p = rest
            .strip_prefix(':')
            .ok_or_else(|| "Не указан порт".to_string())?;
        port = p
            .parse::<u16>()
            .map_err(|_| "Некорректный порт".to_string())?;
    } else {
        let (h, p) = addr
            .rsplit_once(':')
            .ok_or_else(|| "Не указан порт".to_string())?;
        host = h.to_string();
        port = p
            .parse::<u16>()
            .map_err(|_| "Некорректный порт".to_string())?;
    }

    let security = params
        .get("security")
        .cloned()
        .unwrap_or_else(|| "none".into());
    let network = params
        .get("type")
        .cloned()
        .unwrap_or_else(|| "tcp".into());

    let grpc_service = if network == "grpc" {
        Some(params.get("serviceName").cloned().unwrap_or_default())
    } else {
        None
    };

    Ok(VlessProfile {
        name: fragment.unwrap_or_else(|| format!("{}:{}", host, port)),
        uuid: pct_decode(&uuid),
        host,
        port,
        flow: params.get("flow").cloned().filter(|s| !s.is_empty()),
        security,
        sni: params.get("sni").cloned().filter(|s| !s.is_empty()),
        fp: params.get("fp").cloned().filter(|s| !s.is_empty()),
        pbk: params.get("pbk").cloned().filter(|s| !s.is_empty()),
        sid: params.get("sid").cloned().filter(|s| !s.is_empty()),
        spx: params.get("spx").cloned().filter(|s| !s.is_empty()),
        allow_insecure: params
            .get("allowInsecure")
            .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
            .unwrap_or(false),
        network,
        ws_path: params.get("path").cloned().filter(|s| !s.is_empty()),
        ws_host: params.get("host").cloned().filter(|s| !s.is_empty()),
        grpc_service,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_reality_link() {
        let link = "vless://6f9b0fce-2d6e-4b2e-9b6a-3d0a1e7f4c22@example.com:443?security=reality&sni=www.example.com&fp=chrome&pbk=testpbk&sid=abcd1234&type=tcp&flow=xtls-rprx-vision&encryption=none#My%20Server";
        let p = parse_vless(link).unwrap();
        assert_eq!(p.uuid, "6f9b0fce-2d6e-4b2e-9b6a-3d0a1e7f4c22");
        assert_eq!(p.host, "example.com");
        assert_eq!(p.port, 443);
        assert_eq!(p.security, "reality");
        assert_eq!(p.sni.as_deref(), Some("www.example.com"));
        assert_eq!(p.flow.as_deref(), Some("xtls-rprx-vision"));
        assert_eq!(p.name, "My Server");
    }

    #[test]
    fn parses_ws_link() {
        let link = "vless://6f9b0fce-2d6e-4b2e-9b6a-3d0a1e7f4c22@host.io:8443?security=tls&sni=host.io&type=ws&path=%2Fpath&host=cdn.host.io&encryption=none#ws";
        let p = parse_vless(link).unwrap();
        assert_eq!(p.network, "ws");
        assert_eq!(p.ws_path.as_deref(), Some("/path"));
        assert_eq!(p.ws_host.as_deref(), Some("cdn.host.io"));
    }

    #[test]
    fn parses_ipv6() {
        let link = "vless://6f9b0fce-2d6e-4b2e-9b6a-3d0a1e7f4c22@[2606:4700::1]:443?encryption=none#v6";
        let p = parse_vless(link).unwrap();
        assert_eq!(p.host, "2606:4700::1");
        assert_eq!(p.port, 443);
    }

    #[test]
    fn rejects_non_vless() {
        assert!(parse_vless("vmess://...").is_err());
    }
}