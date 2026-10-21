import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import ghostLogo from "../assets/ghost.png";
import { Icon } from "./icons";

export function TitleBar({
  version,
  connected,
  onOpenSettings,
}: {
  version: string | null;
  connected: boolean;
  onOpenSettings: () => void;
}) {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;
    const win = getCurrentWindow();
    win.isMaximized().then(setMaximized).catch(() => {});
    let unlisten: (() => void) | undefined;
    win
      .onResized(() => {
        win.isMaximized().then(setMaximized).catch(() => {});
      })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {});
    return () => unlisten?.();
  }, []);

  const minimize = () => {
    if (!isTauri()) return;
    getCurrentWindow().minimize().catch(() => {});
  };

  const toggleMaximize = () => {
    if (!isTauri()) return;
    const win = getCurrentWindow();
    win
      .toggleMaximize()
      .then(() => win.isMaximized())
      .then(setMaximized)
      .catch(() => {});
  };

  const close = () => {
    if (!isTauri()) return;
    getCurrentWindow().close().catch(() => {});
  };

  return (
    <header
      className="titlebar"
      data-tauri-drag-region
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest("button")) return;
        toggleMaximize();
      }}
    >
      <div className="titlebar-brand" data-tauri-drag-region>
        <span className="logo-badge">
          <img src={ghostLogo} alt="" />
        </span>
        <span className="titlebar-name" data-tauri-drag-region>
          CustomVPN
        </span>
        {version && <span className="titlebar-version">v{version}</span>}
      </div>

      <div className="titlebar-right">
        <span className={`status-pill ${connected ? "on" : "off"}`}>
          <span className="dot" />
          {connected ? "ONLINE" : "OFFLINE"}
        </span>
        <button
          className="titlebar-icon"
          onClick={onOpenSettings}
          title="Настройки"
          aria-label="Настройки"
        >
          <Icon name="settings" size={17} />
        </button>
        <div className="window-controls">
          <button
            className="window-control"
            onClick={minimize}
            title="Свернуть"
            aria-label="Свернуть"
          >
            <Icon name="minimize" size={14} />
          </button>
          <button
            className="window-control"
            onClick={toggleMaximize}
            title={maximized ? "Восстановить" : "Развернуть"}
            aria-label={maximized ? "Восстановить" : "Развернуть"}
          >
            <Icon name={maximized ? "restore" : "maximize"} size={13} />
          </button>
          <button
            className="window-control close"
            onClick={close}
            title="Закрыть"
            aria-label="Закрыть"
          >
            <Icon name="close" size={15} />
          </button>
        </div>
      </div>
    </header>
  );
}
