import { useMemo, useState } from "react";
import { formatBytes, type AppState } from "../lib/api";
import type { Point } from "./SpeedGraph";
import { SpeedGraph } from "./SpeedGraph";
import { Icon, type IconName } from "./icons";

const RANGES = [
  { seconds: 60, label: "1 мин" },
  { seconds: 300, label: "5 мин" },
  { seconds: 1800, label: "30 мин" },
];

function downsample(points: Point[], max: number) {
  if (points.length <= max) return points;
  const bucket = Math.ceil(points.length / max);
  const out: Point[] = [];
  for (let i = 0; i < points.length; i += bucket) {
    const slice = points.slice(i, i + bucket);
    out.push({
      t: slice[0].t,
      up: Math.max(...slice.map((p) => p.up)),
      down: Math.max(...slice.map((p) => p.down)),
    });
  }
  return out;
}

function InfoCard({
  icon,
  label,
  value,
  sub,
  onClick,
}: {
  icon: IconName;
  label: string;
  value: string;
  sub?: string | null;
  onClick?: () => void;
}) {
  return (
    <button className="info-card" onClick={onClick} disabled={!onClick}>
      <span className="info-icon">
        <Icon name={icon} size={19} />
      </span>
      <span className="info-text">
        <span className="info-label">{label}</span>
        <span className="info-value">{value}</span>
        {sub && <span className="info-sub">{sub}</span>}
      </span>
      {onClick && <Icon name="chevronRight" size={15} className="info-chevron" />}
    </button>
  );
}

export function HomePage({
  state,
  connected,
  busy,
  elapsed,
  history,
  fmtDur,
  onConnect,
  onEditProfile,
  onOpenRules,
}: {
  state: AppState;
  connected: boolean;
  busy: boolean;
  elapsed: number;
  history: Point[];
  fmtDur: (seconds: number) => string;
  onConnect: () => void;
  onEditProfile: () => void;
  onOpenRules: () => void;
}) {
  const [range, setRange] = useState(60);
  const profile = state.profile;
  const downSpeed = state.traffic?.[0] ?? 0;
  const upSpeed = state.traffic?.[1] ?? 0;
  const ping = state.ping.latencyMs ?? state.ping.serverMs;

  const chartPoints = useMemo(() => {
    const cutoff = Date.now() - range * 1000;
    const filtered = history.filter((p) => p.t >= cutoff);
    return downsample(filtered, 320);
  }, [history, range]);

  const server = state.status.server || profile?.server || "—";
  const profileName = state.status.profileName || profile?.name || "Профиль не настроен";
  const isJson = profile?.kind === "json";
  const network = (profile?.network || "tcp").toUpperCase();
  const security = profile?.security
    ? profile.security === "reality"
      ? "reality"
      : profile.security.toUpperCase()
    : isJson
      ? "по конфигу"
      : "—";
  const rangeLabel = RANGES.find((r) => r.seconds === range)?.label ?? "1 мин";

  const metrics = [
    {
      icon: "download" as IconName,
      label: "Скачивание",
      value: connected ? formatBytes(downSpeed) : "—",
      tone: "down",
    },
    {
      icon: "upload" as IconName,
      label: "Отправка",
      value: connected ? formatBytes(upSpeed) : "—",
      tone: "up",
    },
    {
      icon: "activity" as IconName,
      label: "Пинг",
      value: connected && ping != null ? `${ping} мс` : "—",
      tone: "ping",
    },
    {
      icon: "clock" as IconName,
      label: "Время",
      value: connected ? fmtDur(elapsed) : "—",
      tone: "time",
    },
  ];

  const canConnect = !!profile && state.binaryAvailable;

  return (
    <div className="home-main">
      <section className={`hero-card ${connected ? "on" : "off"}`}>
        <div className="hero-aurora" aria-hidden="true" />
        <div className="hero-sheen" aria-hidden="true" />
        <div className="hero-top">
          <div className={`hero-status-icon ${connected ? "on" : ""}`}>
            <Icon name={connected ? "shield" : "power"} size={30} />
          </div>
          <div className="hero-status-text">
            <div className="hero-title-row">
              <h2>
                {!profile
                  ? "Профиль не настроен"
                  : connected
                    ? "VPN подключён"
                    : "VPN отключён"}
              </h2>
              <span className={`tag ${connected ? "on" : "off"}`}>
                {connected ? "защищено" : "не защищено"}
              </span>
            </div>
            <p>
              {!profile
                ? "Добавьте vless:// или JSON-конфиг, чтобы подключиться"
                : connected
                  ? "Вы в безопасности — трафик идёт через VPN"
                  : "Готов к подключению. Нажмите кнопку питания"}
            </p>
            {profile && (
              <div className="hero-server">
                <Icon name="globe" size={15} />
                <span className="hero-server-name">{profileName}</span>
                <span className="hero-server-sep">·</span>
                <span className="hero-server-addr">{server}</span>
                <button className="link-btn" onClick={onEditProfile}>
                  Изменить
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="hero-metrics">
          {metrics.map((metric) => (
            <div className={`metric metric-${metric.tone}`} key={metric.label}>
              <span className="metric-icon">
                <Icon name={metric.icon} size={17} />
              </span>
              <span className="metric-value">{metric.value}</span>
              <span className="metric-label">{metric.label}</span>
            </div>
          ))}
        </div>

        <div className="hero-actions">
          <button
            className={`power-btn ${connected ? "on" : ""}`}
            onClick={onConnect}
            disabled={busy || !canConnect}
            title={
              !profile
                ? "Сначала добавьте профиль"
                : connected
                  ? "Отключить VPN"
                  : "Подключить VPN"
            }
            aria-label={connected ? "Отключить VPN" : "Подключить VPN"}
          >
            <Icon name="power" size={34} />
          </button>
          <button
            className={`btn ${connected ? "danger" : "primary"} wide`}
            onClick={onConnect}
            disabled={busy || !canConnect}
          >
            {busy
              ? "Подключение…"
              : connected
                ? "Отключить"
                : profile
                  ? "Подключить"
                  : "Добавить профиль"}
          </button>
          {!profile && (
            <button className="btn ghost wide" onClick={onEditProfile}>
              Настроить профиль
            </button>
          )}
        </div>
      </section>

      <section className="card graph-card">
        <div className="chart-head">
          <div className="chart-title">
            <span className="section-icon">
              <Icon name="chart" size={18} />
            </span>
            <h2>Скорость</h2>
          </div>
          <div className="chart-controls">
            <span className="legend">
              <i className="sw down" /> Скачивание
              <i className="sw up" /> Отправка
            </span>
            <div className="range-switch">
              {RANGES.map((item) => (
                <button
                  key={item.seconds}
                  className={range === item.seconds ? "active" : ""}
                  onClick={() => setRange(item.seconds)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <SpeedGraph points={chartPoints} rangeLabel={rangeLabel} />
      </section>

      <div className="info-grid">
        <InfoCard
          icon="server"
          label="Сервер"
          value={profile?.name || "Не настроен"}
          sub={profile?.server}
          onClick={onEditProfile}
        />
        <InfoCard
          icon="shield"
          label="Протокол"
          value={isJson ? "JSON" : profile ? "VLESS" : "—"}
          sub={isJson ? "по конфигу" : profile ? network : undefined}
          onClick={onEditProfile}
        />
        <InfoCard
          icon="lock"
          label="Шифрование"
          value={security}
          sub={profile?.security === "reality" ? "REALITY" : undefined}
          onClick={onEditProfile}
        />
        <InfoCard
          icon="route"
          label="Транспорт"
          value={isJson ? "по конфигу" : profile ? network : "—"}
          sub={isJson ? undefined : "TCP / TLS"}
          onClick={onEditProfile}
        />
      </div>

      <button className="btn ghost mobile-rules-link" onClick={onOpenRules}>
        <Icon name="shield" size={17} />
        Открыть правила
      </button>
    </div>
  );
}
