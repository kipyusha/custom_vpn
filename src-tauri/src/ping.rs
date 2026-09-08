use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream, ToSocketAddrs};
use std::time::{Duration, Instant};

/// Замер TCP-соединения с сервером (включая разрешение DNS).
pub fn server_connect_ms(host: &str, port: u16) -> Option<u64> {
    let start = Instant::now();
    let addrs: Vec<SocketAddr> = (host, port).to_socket_addrs().ok()?.collect();
    let addr = addrs.first()?;
    let stream = TcpStream::connect_timeout(addr, Duration::from_secs(4)).ok()?;
    stream.set_nodelay(true).ok()?;
    Some(start.elapsed().as_millis() as u64)
}

/// Реальная латентность через прокси: CONNECT + GET /generate_204
/// через mixed-inbound sing-box на localhost.
pub fn proxy_latency_ms(proxy_port: u16) -> Option<u64> {
    const HOST: &str = "www.gstatic.com";
    let start = Instant::now();

    let mut stream = TcpStream::connect(("127.0.0.1", proxy_port)).ok()?;
    stream
        .set_read_timeout(Some(Duration::from_secs(5)))
        .ok()?;
    stream
        .set_write_timeout(Some(Duration::from_secs(5)))
        .ok()?;

    let connect = format!("CONNECT {HOST}:443 HTTP/1.1\r\nHost: {HOST}:443\r\n\r\n");
    stream.write_all(connect.as_bytes()).ok()?;

    let mut buf: Vec<u8> = Vec::new();
    let mut byte = [0u8; 1];
    loop {
        if buf.ends_with(b"\r\n\r\n") || buf.len() >= 8192 {
            break;
        }
        if stream.read(&mut byte).ok()? == 0 {
            return None;
        }
        buf.push(byte[0]);
    }

    let status_line = String::from_utf8_lossy(&buf);
    if !status_line.starts_with("HTTP/1.1 200") {
        return None;
    }

    let get = format!(
        "GET /generate_204 HTTP/1.1\r\nHost: {HOST}\r\nConnection: close\r\n\r\n"
    );
    stream.write_all(get.as_bytes()).ok()?;

    let mut resp = [0u8; 64];
    stream.read(&mut resp).ok()?;

    Some(start.elapsed().as_millis() as u64)
}