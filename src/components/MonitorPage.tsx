import type { ConnectionInfo } from "../lib/api";
import type { HostGroup } from "../lib/monitor";
import { Icon } from "./icons";

export function MonitorPage({
  connected,
  nowTick,
  search,
  setSearch,
  onlyVpn,
  setOnlyVpn,
  onClear,
  activeList,
  hostGroups,
}: {
  connected: boolean;
  nowTick: number;
  search: string;
  setSearch: (value: string) => void;
  onlyVpn: boolean;
  setOnlyVpn: (value: boolean) => void;
  onClear: () => void;
  activeList: ConnectionInfo[];
  hostGroups: HostGroup[];
}) {
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Мониторинг</h1>
          <p>
            Запросы в реальном времени. Зелёная точка означает, что по
            соединению идёт трафик прямо сейчас.
          </p>
        </div>
        <button className="btn ghost" onClick={onClear}>
          <Icon name="trash" size={16} />
          Очистить журнал
        </button>
      </header>

      <div className="monitor-chips">
        <div className="monitor-chip">
          <span className={`pulse-dot ${connected ? "on" : "off"}`} />
          <span>Активно сейчас</span>
          <strong>{activeList.length}</strong>
        </div>
        <div className="monitor-chip">
          <Icon name="globe" size={16} />
          <span>Сайтов в журнале</span>
          <strong>{hostGroups.length}</strong>
        </div>
        <div className="monitor-chip">
          <Icon name="shield" size={16} />
          <span>VPN</span>
          <strong className={connected ? "ok" : "muted"}>
            {connected ? "подключён" : "отключён"}
          </strong>
        </div>
      </div>

      <section className="card monitor-card">
        <div className="monitor-toolbar">
          <div className="search-box">
            <Icon name="search" size={17} />
            <input
              placeholder="Найти сайт или процесс…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={onlyVpn}
              onChange={(e) => setOnlyVpn(e.target.checked)}
            />
            <span>только через VPN</span>
          </label>
        </div>

        {hostGroups.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">
              <Icon name="activity" size={28} />
            </span>
            <h3>
              {!connected && hostGroups.length === 0
                ? "VPN отключён"
                : search.trim()
                  ? "Ничего не найдено"
                  : onlyVpn
                    ? "Нет запросов через VPN"
                    : "Пока нет запросов"}
            </h3>
            <p>
              {!connected
                ? "Подключите VPN на главной, чтобы видеть запросы в реальном времени."
                : search.trim()
                  ? `По запросу «${search.trim()}» совпадений нет.`
                  : onlyVpn
                    ? "Откройте сайт из правил или отключите фильтр «только через VPN»."
                    : "Откройте любой сайт — соединения появятся здесь."}
            </p>
          </div>
        ) : (
          <div className="conn-table">
            <div className="conn-head">
              <span>Время</span>
              <span>Сайт</span>
              <span>Процесс</span>
              <span>Режим</span>
            </div>
            {hostGroups.map((group) => {
              const ageMs = nowTick - group.firstSeen;
              const isNew = ageMs < 5 * 60 * 1000;
              return (
                <div className="conn-row" key={group.host}>
                  <span className="conn-time">
                    {new Date(group.lastSeen).toLocaleTimeString("ru-RU")}
                  </span>
                  <span className="conn-host" title={group.destination}>
                    <span
                      className={`live-dot ${group.active ? "on" : "off"}`}
                    />
                    <span className="conn-host-name">{group.host}</span>
                    {isNew && (
                      <span className={`new-badge ${group.active ? "on" : "off"}`}>
                        NEW
                      </span>
                    )}
                    {group.count > 1 && (
                      <span className="conn-count">×{group.count}</span>
                    )}
                  </span>
                  <span className="conn-process" title={group.process || ""}>
                    {group.process || "—"}
                  </span>
                  <span className="conn-mode">
                    <span className={`tag sm ${group.viaProxy ? "on" : "off"}`}>
                      {group.viaProxy ? "VPN" : "напрямую"}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
