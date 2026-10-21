import { Icon } from "./icons";

export function StatusBar({
  connected,
  profileName,
  server,
  protocol,
  rulesCount,
  onOpenRules,
}: {
  connected: boolean;
  profileName: string | null;
  server: string | null;
  protocol: string;
  rulesCount: number;
  onOpenRules: () => void;
}) {
  return (
    <footer className="status-bar">
      <span className={`status-bar-state ${connected ? "on" : "off"}`}>
        <span className="dot" />
        {connected ? "VPN подключён" : "VPN отключён"}
      </span>
      <span className="status-bar-divider" />
      <span className="status-bar-item">{profileName || "Профиль не настроен"}</span>
      {server && (
        <>
          <span className="status-bar-divider" />
          <span className="status-bar-item muted">{server}</span>
        </>
      )}
      <span className="status-bar-divider" />
      <span className="status-bar-item muted">{protocol}</span>
      <button className="status-bar-rules" onClick={onOpenRules}>
        <Icon name="shield" size={14} />
        Активных правил: {rulesCount}
        <Icon name="chevronRight" size={13} />
      </button>
    </footer>
  );
}
