use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::JoinHandle;
use std::time::Duration;

use futures_util::StreamExt;
use serde_json::Value;
use tokio_tungstenite::tungstenite::Message;

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
            .timeout_global(Some(Duration::from_millis(400)))
            .build()
            .into()
    }

    pub fn alive(&self) -> bool {
        Self::agent()
            .get(&format!("{}/version", self.base))
            .call()
            .is_ok()
    }
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