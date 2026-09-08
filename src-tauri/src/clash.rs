use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::JoinHandle;
use std::time::Duration;

use futures_util::StreamExt;
use serde_json::Value;
use tokio_tungstenite::tungstenite::Message;

use crate::models::ConnectionInfo;

pub struct ClashClient {
    base: String,
}

impl ClashClient {
    pub fn new(port: u16) -> Self {
        Self {
            base: format!("http://127.0.0.1:{port}"),
        }
    }

    fn agent() -> ureq::Agent {
        ureq::Agent::config_builder()
            .timeout_global(Some(Duration::from_millis(1500)))
            .build()
            .into()
    }

    pub fn alive(&self) -> bool {
        Self::agent()
            .get(&format!("{}/version", self.base))
            .call()
            .is_ok()
    }

    /// Активные соединения sing-box через Clash API (`GET /connections`).
    /// Возвращает пустой список, если API недоступно.
    pub fn connections(&self) -> Vec<ConnectionInfo> {
        let body = match Self::agent()
            .get(&format!("{}/connections", self.base))
            .call()
        {
            Ok(resp) => match resp.into_body().read_to_string() {
                Ok(text) => text,
                Err(_) => return Vec::new(),
            },
            Err(_) => return Vec::new(),
        };
        let v: Value = match serde_json::from_str(&body) {
            Ok(v) => v,
            Err(_) => return Vec::new(),
        };
        v.get("connections")
            .and_then(Value::as_array)
            .map(|arr| arr.iter().filter_map(parse_connection).collect())
            .unwrap_or_default()
    }
}

fn str_field(v: &Value, key: &str) -> String {
    v.get(key).and_then(Value::as_str).unwrap_or("").to_string()
}

fn u64_field(v: &Value, key: &str) -> u64 {
    v.get(key).and_then(Value::as_u64).unwrap_or(0)
}

/// Разбирает одну запись соединения Clash API.
/// Хост: sniffed-домен (`metadata.host`), иначе IP:порт назначения.
fn parse_connection(v: &Value) -> Option<ConnectionInfo> {
    let m = v.get("metadata")?;
    let host = m
        .get("host")
        .and_then(Value::as_str)
        .filter(|h| !h.is_empty())
        .map(String::from)
        .unwrap_or_else(|| {
            let ip = m
                .get("destinationIP")
                .and_then(Value::as_str)
                .unwrap_or("?");
            let port = m.get("destinationPort").and_then(Value::as_u64).unwrap_or(0);
            format!("{ip}:{port}")
        });
    let process = m
        .get("processPath")
        .and_then(Value::as_str)
        .filter(|p| !p.is_empty())
        .map(|p| {
            p.rsplit(['/', '\\'])
                .next()
                .unwrap_or(p)
                .to_string()
        });
    let chains: Vec<String> = v
        .get("chains")
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(Value::as_str)
                .map(String::from)
                .collect()
        })
        .unwrap_or_default();
    let outbound = chains.last().cloned().unwrap_or_default();
    let via_proxy = !outbound.is_empty() && outbound != "direct";
    let src_ip = m.get("sourceIP").and_then(Value::as_str).unwrap_or("?");
    let src_port = m.get("sourcePort").and_then(Value::as_u64).unwrap_or(0);
    Some(ConnectionInfo {
        id: str_field(v, "id"),
        host,
        process,
        network: str_field(m, "network"),
        source: format!("{src_ip}:{src_port}"),
        destination: format!(
            "{}:{}",
            m.get("destinationIP").and_then(Value::as_str).unwrap_or("?"),
            m.get("destinationPort").and_then(Value::as_u64).unwrap_or(0)
        ),
        outbound,
        via_proxy,
        upload: u64_field(v, "upload"),
        download: u64_field(v, "download"),
        start: str_field(v, "start"),
    })
}

/// Запускает фоновый поток, читающий /traffic (WebSocket) и вызывающий
/// callback с мгновенной скоростью (байт/сек) входящего и исходящего трафика.
pub fn spawn_traffic_thread(
    port: u16,
    running: Arc<AtomicBool>,
    on_traffic: impl Fn(u64, u64) + Send + 'static,
) -> JoinHandle<()> {
    std::thread::spawn(move || {
        let rt = tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .worker_threads(2)
            .build()
            .expect("failed to build tokio runtime");
        rt.block_on(traffic_loop(port, running, on_traffic));
    })
}

async fn traffic_loop(
    port: u16,
    running: Arc<AtomicBool>,
    on_traffic: impl Fn(u64, u64) + Send + 'static,
) {
    let mut last_up = 0u64;
    let mut last_down = 0u64;
    let url = format!("ws://127.0.0.1:{port}/traffic");

    while running.load(Ordering::Relaxed) {
        match tokio_tungstenite::connect_async(&url).await {
            Ok((mut ws, _)) => {
                while running.load(Ordering::Relaxed) {
                    match ws.next().await {
                        Some(Ok(Message::Text(text))) => {
                            if let Ok(v) = serde_json::from_str::<Value>(&text) {
                                let up = v.get("up").and_then(Value::as_u64).unwrap_or(0);
                                let down = v.get("down").and_then(Value::as_u64).unwrap_or(0);
                                let (du, dd) = if up < last_up {
                                    (0, 0)
                                } else {
                                    let dd = if down >= last_down { down - last_down } else { 0 };
                                    (up - last_up, dd)
                                };
                                last_up = up;
                                last_down = down;
                                on_traffic(du, dd);
                            }
                        }
                        Some(Ok(Message::Close(_))) => break,
                        Some(Ok(_)) => {}
                        Some(Err(_)) => break,
                        None => break,
                    }
                }
            }
            Err(_) => {}
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
}