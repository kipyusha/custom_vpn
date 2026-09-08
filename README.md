# CustomVPN

Десктопный VPN-клиент для Windows на основе [sing-box](https://github.com/SagerNet/sing-box).

- Вставка подключения **vless://** (или полного JSON-конфига sing-box)
- Правила по доменам: какие сайты идут через VPN, какие напрямую
- Статус подключения, скорость передачи (входящая/исходящая) с живым графиком
- Пинг до сервера и реальная латентность через прокси
- Системный прокси Windows (уважающие его приложения работают через VPN)

## Стек

- **Tauri 2** (Rust-бэкенд + WebView2)
- **React + TypeScript + Vite**
- **sing-box 1.13.x** как встроенный движок (VLESS, смешанный inbound, Clash API для статистики)
- Статус/скорость через Clash API: `/version` (HTTP) и `/traffic` (WebSocket)

## Сборка

Требования: Rust (MSVC toolchain), Node.js, Visual Studio Build Tools.

```bash
npm install
npm run tauri dev    # режим разработки
npm run tauri build  # production + инсталляторы (NSIS/MSI)
```

> Приложение запускается с правами администратора (UAC), т.к. управляет
> системным прокси и планируется TUN-режим.

## Файлы бинарников

| Файл | Назначение |
| --- | --- |
| `src-tauri/binaries/sing-box-x86_64-pc-windows-msvc.exe` | движок sing-box (externalBin, кладётся рядом с exe) |
| `src-tauri/resources/libcronet.dll` | зависимость sing-box (ресурс, копируется при запуске) |

wintun.dll не требуется: sing-box 1.13 встраивает драйвер в бинарник и загружает
его через memmod.

## Структура (Rust)

- `vless.rs` — парсер ссылок vless:// (reality/tls/ws/grpc)
- `config.rs` — генерация JSON-конфига sing-box
- `singbox.rs` — менеджер процесса + системный прокси (WinINET)
- `clash.rs` — Clash API: статус + поток трафика (WebSocket)
- `ping.rs` — TCP-пинг до сервера и латентность через прокси
- `core.rs` — состояние, фоновые потоки, события в UI
- `commands.rs` — Tauri-команды
- `store.rs` / `models.rs` — хранение профиля и правил

## Лицензии зависимостей

- [sing-box](https://github.com/SagerNet/sing-box) — GPL-3.0
- [wintun](https://www.wintun.net/) — MIT (используется движком)
- Собственный код — на ваше усмотрение

## Дорожная карта

- [x] Фаза 1: профиль vless://, системный прокси, правила по доменам, статистика, пинг
- [ ] Фаза 2: TUN-режим + фильтрация по приложениям (`process_name`/`process_path`), DNS-правила
