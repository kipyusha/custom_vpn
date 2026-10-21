import { useEffect, useState } from "react";
import type { ProfileSummary } from "../lib/api";
import { Icon } from "./icons";
import { Modal } from "./Modal";

export function ProfileModal({
  open,
  onClose,
  profile,
  connected,
  busy,
  mode,
  setMode,
  vlessLink,
  setVlessLink,
  jsonConfig,
  setJsonConfig,
  onSave,
  onClear,
}: {
  open: boolean;
  onClose: () => void;
  profile: ProfileSummary | null | undefined;
  connected: boolean;
  busy: boolean;
  mode: "vless" | "json";
  setMode: (mode: "vless" | "json") => void;
  vlessLink: string;
  setVlessLink: (value: string) => void;
  jsonConfig: string;
  setJsonConfig: (value: string) => void;
  onSave: () => void;
  onClear: () => void;
}) {
  const [replace, setReplace] = useState(false);

  useEffect(() => {
    if (open) setReplace(!profile);
  }, [open, profile]);

  const showForm = !profile || replace;

  return (
    <Modal open={open} onClose={onClose} title="Профиль подключения">
      {!showForm && profile ? (
        <>
          <div className="profile-summary">
            <span className="profile-summary-icon">
              <Icon name="server" size={22} />
            </span>
            <div>
              <strong>{profile.name}</strong>
              <span>{profile.server || "по конфигу"}</span>
            </div>
            <span className="tag on">{profile.kind === "vless" ? "VLESS" : "JSON"}</span>
          </div>

          <div className="settings-rows">
            {profile.security && (
              <div className="setting-row">
                <span className="setting-label">Шифрование</span>
                <span className="setting-value">{profile.security}</span>
              </div>
            )}
            {profile.network && (
              <div className="setting-row">
                <span className="setting-label">Транспорт</span>
                <span className="setting-value">{profile.network}</span>
              </div>
            )}
          </div>

          <div className="button-row end">
            <button
              className="btn ghost"
              onClick={onClear}
              disabled={busy || connected}
              title={connected ? "Сначала отключите VPN" : undefined}
            >
              <Icon name="trash" size={15} />
              Удалить профиль
            </button>
            <button className="btn primary" onClick={() => setReplace(true)}>
              Заменить профиль
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="modal-hint">
            Вставьте ссылку <code>vless://</code> или полный JSON-конфиг
            sing-box. Для замены текущего профиля сохранение перезапишет его.
          </p>

          <div className="mode-switch">
            <button
              className={mode === "vless" ? "active" : ""}
              onClick={() => setMode("vless")}
            >
              Ссылка vless://
            </button>
            <button
              className={mode === "json" ? "active" : ""}
              onClick={() => setMode("json")}
            >
              JSON-конфиг
            </button>
          </div>

          {mode === "vless" ? (
            <input
              className="input"
              placeholder="vless://uuid@host:port?security=reality&sni=...#Название"
              value={vlessLink}
              onChange={(e) => setVlessLink(e.target.value)}
            />
          ) : (
            <textarea
              className="input mono"
              placeholder='{"outbounds":[...], ...}'
              rows={7}
              value={jsonConfig}
              onChange={(e) => setJsonConfig(e.target.value)}
            />
          )}

          <div className="button-row end">
            {profile && (
              <button className="btn ghost" onClick={() => setReplace(false)}>
                Отмена
              </button>
            )}
            <button className="btn primary" onClick={onSave} disabled={busy}>
              <Icon name="check" size={16} />
              Сохранить профиль
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
