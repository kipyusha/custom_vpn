import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  formatBytes,
  type AppState,
  type ConnectionInfo,
  type PingInfo,
  type StatusInfo,
} from "./lib/api";
import { SpeedGraph, type Point } from "./components/SpeedGraph";
import "./App.css";

type Tab = "connect" | "rules" | "monitor";
type ProfileMode = "vless" | "json";

const PRESET_SITES = [
  { id: "youtube", label: "YouTube", url: "https://www.youtube.com/" },
  { id: "chatgpt", label: "ChatGPT", url: "https://chatgpt.com" },
  { id: "instagram", label: "Instagram", url: "https://www.instagram.com/" },
  { id: "twitch", label: "Twitch", url: "https://www.twitch.tv/" },
  { id: "opencode", label: "OpenCode / Muse Spark", url: "https://opencode.ai/" },
];

interface SiteItem {
  kind: "preset" | "custom";
  id: string;
  label: string;
  url: string;
  enabled: boolean;
  includeSubdomains: boolean;
  subdomains: string[];
  hidden: boolean;
}

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {off ? (
        <>
          <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
          <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
          <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
          <line x1="2" y1="2" x2="22" y2="22" />
        </>
      ) : (
        <>
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  );
}

export default function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [tab, setTab] = useState<Tab>("connect");
  const [profileMode, setProfileMode] = useState<ProfileMode>("vless");
  const [vlessLink, setVlessLink] = useState("");
  const [jsonConfig, setJsonConfig] = useState("");
  const [ruleInput, setRuleInput] = useState("");
  const [ruleAction, setRuleAction] = useState<"proxy" | "direct">("proxy");
  const [procInput, setProcInput] = useState("");
  const [procAction, setProcAction] = useState<"proxy" | "direct">("proxy");
  const [siteLink, setSiteLink] = useState("");
  const [subOpen, setSubOpen] = useState<string | null>(null);
  const [subInput, setSubInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [proxyEnvOn, setProxyEnvOn] = useState<boolean | null>(null);
  const [history, setHistory] = useState<Point[]>([]);
  const historyRef = useRef<Point[]>([]);
  const [elapsed, setElapsed] = useState(0);
  // Журнал соединений для вкладки мониторинга: время первого обращения + сайт.
  // Соединение считается "живым", только если по нему был трафик
  // за последние IDLE_TIMEOUT (браузер держит keep-alive соединения
  // открытыми ещё долго после закрытия вкладки).
  const IDLE_TIMEOUT = 10 * 1000;
  const [connLog, setConnLog] = useState<
    {
      conn: ConnectionInfo;
      firstSeen: number;
      lastSeen: number;
      live: boolean;
      lastFlow: number;
    }[]
  >([]);
  const [activeList, setActiveList] = useState<ConnectionInfo[]>([]);
  const [onlyVpn, setOnlyVpn] = useState(true);
  const [search, setSearch] = useState("");
  // Тикающие часы, чтобы бейдж NEW гас через 5 минут без новых данных.
  const [nowTick, setNowTick] = useState(Date.now());
  const trackRef = useRef<
    Map<string, { first: number; up: number; down: number; flow: number }>
  >(new Map());

  const mergeConnections = useCallback(
    (list: ConnectionInfo[]) => {
      const now = Date.now();
      const track = trackRef.current;
      const liveById = new Map<string, boolean>();
      for (const c of list) {
        const total = c.upload + c.download;
        const prev = track.get(c.id);
        if (!prev) {
          track.set(c.id, { first: now, up: c.upload, down: c.download, flow: now });
        } else if (total !== prev.up + prev.down) {
          prev.up = c.upload;
          prev.down = c.download;
          prev.flow = now;
        }
        liveById.set(c.id, now - track.get(c.id)!.flow < IDLE_TIMEOUT);
      }
      setActiveList(list.filter((c) => liveById.get(c.id)));
      setConnLog((prev) => {
        const byId = new Map(prev.map((e) => [e.conn.id, e]));
        for (const c of list) {
          const t = track.get(c.id)!;
          byId.set(c.id, {
            conn: c,
            firstSeen: t.first,
            lastSeen: now,
            live: liveById.get(c.id) ?? false,
            lastFlow: t.flow,
          });
        }
        // соединения, пропавшие из снимка, уже не живые
        for (const [id, e] of byId) {
          if (!liveById.has(id) && e.live) {
            byId.set(id, { ...e, live: false });
          }
        }
        const all = [...byId.values()].sort((a, b) => b.firstSeen - a.firstSeen);
        if (all.length > 200) {
          for (const e of all.slice(200)) track.delete(e.conn.id);
          return all.slice(0, 200);
        }
        return all;
      });
    },
    [IDLE_TIMEOUT],
  );

  const clearConnLog = useCallback(() => {
    trackRef.current.clear();
    setConnLog([]);
    setActiveList([]);
  }, []);

  interface HostGroup {
    host: string;
    count: number;
    firstSeen: number;
    lastSeen: number;
    lastFlow: number;
    active: boolean;
    process?: string | null;
    viaProxy: boolean;
    destination: string;
  }

  // Группировка записей по сайтам: один сайт — одна строка.
  const hostGroups = useMemo(() => {
    const activeHosts = new Set(activeList.map((c) => c.host));
    const q = search.trim().toLowerCase();
    const map = new Map<string, HostGroup>();
    for (const e of connLog) {
      if (onlyVpn && !e.conn.viaProxy) continue;
      if (
        q &&
        !e.conn.host.toLowerCase().includes(q) &&
        !(e.conn.process ?? "").toLowerCase().includes(q)
      ) {
        continue;
      }
      const g = map.get(e.conn.host);
      if (g) {
        g.count += 1;
        g.firstSeen = Math.min(g.firstSeen, e.firstSeen);
        g.lastFlow = Math.max(g.lastFlow, e.lastFlow);
        if (e.lastSeen >= g.lastSeen) {
          g.lastSeen = e.lastSeen;
          g.process = e.conn.process;
          g.viaProxy = e.conn.viaProxy;
          g.destination = e.conn.destination;
        }
      } else {
        map.set(e.conn.host, {
          host: e.conn.host,
          count: 1,
          firstSeen: e.firstSeen,
          lastSeen: e.lastSeen,
          lastFlow: e.lastFlow,
          active: false,
          process: e.conn.process,
          viaProxy: e.conn.viaProxy,
          destination: e.conn.destination,
        });
      }
    }
    const groups = [...map.values()];
    for (const g of groups) g.active = activeHosts.has(g.host);
    // сначала активные, затем по времени последнего обращения
    groups.sort(
      (a, b) =>
        Number(b.active) - Number(a.active) || b.lastSeen - a.lastSeen,
    );
    return groups;
  }, [connLog, activeList, onlyVpn, search]);

  useEffect(() => {
    if (!state || !state.status.connected || !state.connectedSince) {
      setElapsed(0);
      return;
    }
    const tick = () =>
      setElapsed(
        Math.max(0, Math.floor((Date.now() - (state.connectedSince as number)) / 1000)),
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [state?.status.connected, state?.connectedSince]);

  const refresh = useCallback(async () => {
    try {
      const st = await api.appState();
      setState(st);
      if (st.traffic) {
        pushPoint(st.traffic[0], st.traffic[1]);
      }
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const pushPoint = useCallback((up: number, down: number) => {
    const pts = [...historyRef.current, { t: Date.now(), up, down }];
    if (pts.length > 150) pts.splice(0, pts.length - 150);
    historyRef.current = pts;
    setHistory(pts);
  }, []);

  const refreshProxyEnv = useCallback(async () => {
    try {
      const v = await api.getOpencodeProxyEnv();
      setProxyEnvOn(v);
    } catch {}
  }, []);

  useEffect(() => {
    refreshProxyEnv();
  }, [refreshProxyEnv]);

  useEffect(() => {
    refresh();
    const unsubs = [
      api.onTraffic((up, down) => {
        pushPoint(up, down);
        setState((s) =>
          s ? { ...s, traffic: [up, down] } : s,
        );
      }),
      api.onStatus((status: StatusInfo) => {
        setState((s) => (s ? { ...s, status } : s));
      }),
      api.onPing((ping: PingInfo) => {
        setState((s) => (s ? { ...s, ping } : s));
      }),
      api.onConnections((list) => {
        mergeConnections(list);
      }),
    ];
    return () => {
      unsubs.forEach((u) => u.then((f) => f()));
    };
  }, [refresh, pushPoint, mergeConnections]);

  // При открытии вкладки мониторинга подтянуть текущий снимок соединений.
  useEffect(() => {
    if (tab === "monitor" && state?.status.connected) {
      api.getConnections().then(mergeConnections).catch(() => {});
    }
  }, [tab, state?.status.connected, mergeConnections]);

  // После отключения активных соединений нет.
  useEffect(() => {
    if (!state?.status.connected) setActiveList([]);
  }, [state?.status.connected]);

  // Обновление бейджа NEW, пока открыта вкладка мониторинга.
  useEffect(() => {
    if (tab !== "monitor") return;
    const id = setInterval(() => setNowTick(Date.now()), 10000);
    return () => clearInterval(id);
  }, [tab]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const saveProfile = () => {
    if (profileMode === "vless") {
      if (!vlessLink.trim()) {
        setError("Вставьте ссылку vless://");
        return;
      }
      run(async () => {
        await api.setProfileVless(vlessLink.trim());
        setVlessLink("");
        setNotice("Профиль сохранён");
      });
    } else {
      if (!jsonConfig.trim()) {
        setError("Вставьте JSON-конфиг");
        return;
      }
      run(async () => {
        await api.setProfileJson(jsonConfig.trim());
        setJsonConfig("");
        setNotice("JSON-профиль сохранён");
      });
    }
  };

  const onConnect = () => {
    if (state?.status.connected) {
      run(() => api.disconnect());
    } else {
      run(() => api.connect());
    }
  };

  const addRule = () => {
    const d = ruleInput.trim();
    if (!d) return;
    run(async () => {
      await api.addDomainRule(d, ruleAction);
      setRuleInput("");
      setNotice(`Домен ${d} → ${ruleAction === "proxy" ? "VPN" : "напрямую"}`);
    });
  };

  const removeRule = (domain: string, action: "proxy" | "direct") => {
    run(() => api.removeDomainRule(domain, action));
  };

  const addProcess = () => {
    const n = procInput.trim();
    if (!n) return;
    run(async () => {
      await api.addProcessRule(n, procAction);
      setProcInput("");
      setNotice(
        `Приложение ${n} → ${procAction === "proxy" ? "VPN" : "напрямую"}`,
      );
    });
  };

  const removeProcess = (name: string, action: "proxy" | "direct") => {
    run(() => api.removeProcessRule(name, action));
  };

  const sites = useMemo<SiteItem[]>(() => {
    const presetStates = state?.presetStates || [];
    const customSites = state?.customSites || [];
    const presets: SiteItem[] = PRESET_SITES.map((p): SiteItem => {
      const st = presetStates.find((s) => s.id === p.id);
      return {
        kind: "preset",
        id: p.id,
        label: p.label,
        url: p.url,
        enabled: st ? st.enabled : true,
        includeSubdomains: st ? st.includeSubdomains : true,
        subdomains: st ? st.subdomains : [],
        hidden: st ? !!st.hidden : false,
      };
    }).filter((s) => {
      const st = presetStates.find((x) => x.id === s.id);
      return !(st && st.deleted);
    });
    const customs: SiteItem[] = customSites.map((s): SiteItem => ({
      kind: "custom",
      id: s.id,
      label: s.label,
      url: s.domain,
      enabled: s.enabled,
      includeSubdomains: s.includeSubdomains,
      subdomains: s.subdomains,
      hidden: !!s.hidden,
    }));
    return [...presets, ...customs];
  }, [state?.presetStates, state?.customSites]);

  const siteKey = (s: SiteItem) => `${s.kind}-${s.id}`;

  const toggleSite = (s: SiteItem) => {
    run(() =>
      s.kind === "preset"
        ? api.setPresetSite(s.id, !s.enabled)
        : api.setCustomSite(s.id, !s.enabled),
    );
  };

  const toggleInclude = (s: SiteItem, include: boolean) => {
    run(() =>
      s.kind === "preset"
        ? api.setPresetSiteIncludeSubdomains(s.id, include)
        : api.setCustomSiteIncludeSubdomains(s.id, include),
    );
  };

  const removeSiteItem = (s: SiteItem) => {
    run(() =>
      s.kind === "preset"
        ? api.deletePresetSite(s.id)
        : api.removeCustomSite(s.id),
    );
  };

  const toggleHidden = (s: SiteItem) => {
    run(() => api.setSiteHidden(s.kind, s.id, !s.hidden));
  };

  const addSite = () => {
    if (!siteLink.trim()) {
      setError("Введите адрес сайта");
      return;
    }
    run(async () => {
      await api.addCustomSite(siteLink.trim());
      setSiteLink("");
      setNotice("Сайт добавлен");
    });
  };

  const openSubInput = (key: string) => {
    setSubOpen(subOpen === key ? null : key);
    setSubInput("");
  };

  const addSub = () => {
    if (!subOpen || !subInput.trim()) return;
    const s = sites.find((x) => siteKey(x) === subOpen);
    if (!s) return;
    const sd = subInput.trim();
    run(async () => {
      if (s.kind === "preset") await api.addPresetSiteSubdomain(s.id, sd);
      else await api.addCustomSiteSubdomain(s.id, sd);
      setSubInput("");
      setNotice(`Поддомен ${sd} добавлен`);
    });
  };

  const removeSub = (s: SiteItem, sd: string) => {
    run(() =>
      s.kind === "preset"
        ? api.removePresetSiteSubdomain(s.id, sd)
        : api.removeCustomSiteSubdomain(s.id, sd),
    );
  };

  const enableProxyEnv = () =>
    run(async () => {
      await api.setOpencodeProxyEnv();
      await refreshProxyEnv();
      setNotice("Переменные HTTPS_PROXY/NO_PROXY прописаны. Перезапусти OpenCode Desktop");
    });
  const disableProxyEnv = () =>
    run(async () => {
      await api.clearOpencodeProxyEnv();
      await refreshProxyEnv();
      setNotice("Переменные прокси удалены. Перезапусти OpenCode Desktop");
    });

  if (!state) {
    return <div className="center">Загрузка…</div>;
  }

  const connected = state.status.connected;
  const ping = state.ping;
  const [upSpeed, downSpeed] = state.traffic || [0, 0];

  const fmtDur = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
  };

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <span className="logo">SV</span>
          <h1>CustomVPN</h1>
        </div>
        <nav className="tabs">
          <button
            className={tab === "connect" ? "active" : ""}
            onClick={() => setTab("connect")}
          >
            Подключение
          </button>
          <button
            className={tab === "rules" ? "active" : ""}
            onClick={() => setTab("rules")}
          >
            Правила
          </button>
          <button
            className={tab === "monitor" ? "active" : ""}
            onClick={() => setTab("monitor")}
          >
            Мониторинг
          </button>
        </nav>
        <div
          className={`pill ${connected ? "on" : "off"}`}
          title={connected ? "Подключено" : "Отключено"}
        >
          <span className="dot" />
          {connected ? "ONLINE" : "OFFLINE"}
        </div>
      </header>

      {!state.admin && (
        <div className="banner warn">
          Приложение работает без прав администратора — возможны ограничения.
        </div>
      )}
      {!state.binaryAvailable && (
        <div className="banner error">
          sing-box.exe не найден. Пересоберите приложение с бинарником.
        </div>
      )}

      {error && (
        <div className="banner error">
          <span>{error}</span>
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}
      {notice && (
        <div className="banner ok">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)}>✕</button>
        </div>
      )}

      {tab === "monitor" ? (
        <main className="content">
          <section className="profile-card">
            <h2>Мониторинг трафика</h2>
            <p className="hint">
              {connected
                ? "Запросы в реальном времени: время обращения и сайт. Зелёная точка — по соединению идёт трафик прямо сейчас (без трафика дольше 10 сек считается закрытым)."
                : "Подключите VPN во вкладке «Подключение», чтобы видеть запросы в реальном времени."}
            </p>
            <div className="rule-form">
              <input
                className="input"
                placeholder="Найти сайт или процесс…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ minWidth: 200 }}
              />
              <label className="sub-check">
                <input
                  type="checkbox"
                  checked={onlyVpn}
                  onChange={(e) => setOnlyVpn(e.target.checked)}
                />
                <span>только через VPN</span>
              </label>
              <button className="btn ghost" onClick={clearConnLog}>
                Очистить журнал
              </button>
            </div>
            <div style={{ fontSize: 12, opacity: 0.75, margin: "8px 0" }}>
              Активно сейчас: {activeList.length} · Сайтов в журнале:{" "}
              {hostGroups.length}
            </div>
            {(() => {
              if (!connected && hostGroups.length === 0) {
                return <p className="empty">Нет данных — VPN отключён</p>;
              }
              if (hostGroups.length === 0) {
                return (
                  <p className="empty">
                    {search.trim()
                      ? `По запросу «${search.trim()}» ничего не найдено`
                      : onlyVpn
                        ? "Пока нет запросов через VPN — откройте сайт из правил"
                        : "Пока нет запросов — откройте любой сайт"}
                  </p>
                );
              }
              return (
                <div className="rule-lists">
                  <div className="rule-col" style={{ flex: "1 1 100%" }}>
                    {hostGroups.map((g) => {
                      const ageMs = nowTick - g.firstSeen;
                      // NEW виден 5 минут: зелёный — соединение активно,
                      // оранжевый — уже закрыто.
                      const newTone =
                        ageMs >= 5 * 60 * 1000
                          ? null
                          : g.active
                            ? "green"
                            : "orange";
                      return (
                        <div className="rule-row" key={g.host}>
                          {newTone && (
                            <span
                              title={`Сайт впервые открыт ${new Date(g.firstSeen).toLocaleTimeString("ru-RU")}`}
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                padding: "2px 6px",
                                borderRadius: 6,
                                flexShrink: 0,
                                marginRight: 6,
                                color:
                                  newTone === "green" ? "#4ade80" : "#fb923c",
                                background:
                                  newTone === "green"
                                    ? "rgba(34,197,94,.15)"
                                    : "rgba(249,115,22,.15)",
                                border: `1px solid ${newTone === "green" ? "rgba(34,197,94,.4)" : "rgba(249,115,22,.4)"}`,
                              }}
                            >
                              NEW
                            </span>
                          )}
                          <span
                            title={`Первое: ${new Date(g.firstSeen).toLocaleString("ru-RU")}\nПоследнее: ${new Date(g.lastSeen).toLocaleString("ru-RU")}\nТрафик: ${new Date(g.lastFlow).toLocaleString("ru-RU")}`}
                            style={{ minWidth: 70 }}
                          >
                            {new Date(g.lastSeen).toLocaleTimeString("ru-RU")}
                          </span>
                          <span
                            title={g.destination}
                            style={{
                              flex: 1,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            <span
                              style={{
                                color: g.active
                                  ? "#4ade80"
                                  : "rgba(255,255,255,.3)",
                              }}
                            >
                              {g.active ? "●" : "○"}
                            </span>{" "}
                            {g.host}
                          </span>
                          {g.count > 1 && (
                            <span
                              title={`Обращений: ${g.count}`}
                              style={{ fontSize: 12, opacity: 0.7 }}
                            >
                              ×{g.count}
                            </span>
                          )}
                          {g.process && (
                            <span
                              title={`Процесс: ${g.process}`}
                              style={{ fontSize: 12, opacity: 0.7 }}
                            >
                              {g.process}
                            </span>
                          )}
                          <span
                            className={`preset-state ${g.viaProxy ? "on" : "off"}`}
                            style={{ marginLeft: 6 }}
                          >
                            {g.viaProxy ? "VPN" : "напрямую"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </section>
        </main>
      ) : tab === "connect" ? (
        <main className="content">
          <section className="profile-card">
            <h2>Профиль подключения</h2>
            {state.profile ? (
              <div className="profile-info">
                <div className="profile-name">{state.profile.name}</div>
                <div className="profile-meta">
                  {state.profile.server && <span>Сервер: {state.profile.server}</span>}
                  {state.profile.security && (
                    <span>Шифрование: {state.profile.security}</span>
                  )}
                  {state.profile.network && <span>Транспорт: {state.profile.network}</span>}
                  {state.profile.kind === "json" && <span>JSON-конфиг</span>}
                </div>
                <button
                  className="btn ghost"
                  onClick={() => run(() => api.clearProfile())}
                  disabled={busy || connected}
                >
                  Удалить профиль
                </button>
              </div>
            ) : (
              <div className="profile-form">
                <div className="mode-switch">
                  <button
                    className={profileMode === "vless" ? "active" : ""}
                    onClick={() => setProfileMode("vless")}
                  >
                    Ссылка vless://
                  </button>
                  <button
                    className={profileMode === "json" ? "active" : ""}
                    onClick={() => setProfileMode("json")}
                  >
                    JSON-конфиг
                  </button>
                </div>
                {profileMode === "vless" ? (
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
                    rows={6}
                    value={jsonConfig}
                    onChange={(e) => setJsonConfig(e.target.value)}
                  />
                )}
                <button
                  className="btn primary"
                  onClick={saveProfile}
                  disabled={busy || connected}
                >
                  Сохранить профиль
                </button>
              </div>
            )}
          </section>

          <section className="stats-grid">
            <div className="stat-card">
              <div className="stat-label">↓ Скачивание</div>
              <div className="stat-value down">{formatBytes(downSpeed)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">↑ Отправка</div>
              <div className="stat-value up">{formatBytes(upSpeed)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Пинг сервера</div>
              <div className="stat-value">
                {ping.serverMs != null ? `${ping.serverMs} мс` : "—"}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Латентность (через VPN)</div>
              <div className="stat-value">
                {ping.latencyMs != null ? `${ping.latencyMs} мс` : "—"}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Время работы</div>
              <div className="stat-value">
                {connected ? fmtDur(elapsed) : "—"}
              </div>
            </div>
          </section>

          <section className="graph-card">
            <div className="graph-header">
              <h2>Скорость</h2>
              <span className="legend">
                <i className="sw down" /> ↓ &nbsp;
                <i className="sw up" /> ↑
              </span>
            </div>
            <SpeedGraph points={history} />
          </section>

          <div className="connect-bar">
            <button
              className={`btn big ${connected ? "danger" : "primary"}`}
              onClick={onConnect}
              disabled={busy || !state.profile || !state.binaryAvailable}
            >
              {connected
                ? "Отключить"
                : busy
                  ? "Подключение…"
                  : "Подключить"}
            </button>
            {connected && state.status.server && (
              <span className="server-info">
                {state.status.profileName} · {state.status.server} ·{" "}
                {fmtDur(elapsed)}
              </span>
            )}
          </div>
        </main>
      ) : (
        <main className="content">
          <section className="profile-card">
            <h2>Сайты</h2>
            <p className="hint">
              Через VPN идут только отмеченные сайты. Все остальные сайты
              открываются напрямую, без VPN. Стандартные сайты можно удалять
              (кнопка ✕) и возвращать кнопкой «Вернуть стандартные сайты»,
              а также добавлять поддомены. Кнопка-глаз скрывает название и
              адрес сайта — скрытие сохраняется до повторного нажатия.
              Изменения применяются сразу. Для Muse Spark включи тумблер
              <b> OpenCode / Muse Spark</b> (домен <code>opencode.ai</code>) — без
              него трафик <code>opencode</code> идёт напрямую и будет
              <code>403 RegionError</code>.
            </p>
            <div className="preset-list">
              {sites.map((s) => {
                const on = s.enabled;
                const expanded = subOpen === siteKey(s);
                return (
                  <div className="preset-block" key={siteKey(s)}>
                    <div className="preset-row">
                      <div className="preset-info">
                        <span
                          className={`preset-name ${s.hidden ? "blur" : ""}`}
                          title={s.hidden ? "Информация скрыта" : s.label}
                        >
                          {s.label}
                        </span>
                        <span
                          className={`preset-url ${s.hidden ? "blur" : ""}`}
                          title={s.hidden ? "Информация скрыта" : s.url}
                        >
                          {s.url}
                        </span>
                      </div>
                      <div className="preset-action">
                        <span className={`preset-state ${on ? "on" : "off"}`}>
                          {on ? "через VPN" : "напрямую"}
                        </span>
                        <button
                          className="preset-eye"
                          title={s.hidden ? "Показать" : "Скрыть"}
                          onClick={() => toggleHidden(s)}
                          disabled={busy}
                        >
                          <EyeIcon off={s.hidden} />
                        </button>
                        <button
                          className={`switch ${on ? "on" : ""}`}
                          role="switch"
                          aria-checked={on}
                          onClick={() => toggleSite(s)}
                          disabled={busy}
                        >
                          <span className="knob" />
                        </button>
                        <button
                          className="preset-del"
                          title={s.kind === "preset" ? "Удалить сайт" : "Удалить сайт"}
                          onClick={() => removeSiteItem(s)}
                          disabled={busy}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                    <div className="preset-sub">
                      <div className="preset-sub-row">
                        <label className="sub-check">
                          <input
                            type="checkbox"
                            checked={s.includeSubdomains}
                            onChange={(e) =>
                              toggleInclude(s, e.target.checked)
                            }
                            disabled={busy}
                          />
                          <span>включая поддомены</span>
                        </label>
                        <button
                          className="preset-add-sub"
                          onClick={() => openSubInput(siteKey(s))}
                          disabled={busy}
                        >
                          {expanded ? "✕ закрыть" : "+ поддомен"}
                        </button>
                      </div>
                      {expanded && (
                        <div className="preset-sub-input">
                          <input
                            className="input"
                            placeholder="api.example.com"
                            value={subInput}
                            onChange={(e) => setSubInput(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && addSub()}
                          />
                          <button
                            className="btn primary"
                            onClick={addSub}
                            disabled={busy}
                          >
                            Добавить
                          </button>
                        </div>
                      )}
                      {s.subdomains.length > 0 && (
                        <div className="preset-sub-list">
                          {s.subdomains.map((sd) => (
                            <span className="sub-tag" key={sd}>
                              {sd}
                              <button
                                onClick={() => removeSub(s, sd)}
                                disabled={busy}
                                title="Удалить поддомен"
                              >
                                ✕
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {(state.presetStates || []).some((s) => s.deleted) && (
                <button
                  className="btn ghost"
                  onClick={() => run(() => api.restorePresetSites())}
                  disabled={busy}
                >
                  Вернуть стандартные сайты
                </button>
              )}
            </div>

            <div className="preset-add">
              <input
                className="input"
                placeholder="https://example.com или example.com"
                value={siteLink}
                onChange={(e) => setSiteLink(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addSite()}
              />
              <button
                className="btn primary"
                onClick={addSite}
                disabled={busy}
              >
                Добавить сайт
              </button>
            </div>

            <div
              style={{
                marginTop: 16,
                padding: 12,
                border: "1px solid var(--border)",
                borderRadius: 8,
                background: "var(--bg-subtle)",
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 6 }}>
                OpenCode / Muse Spark — как запустить:
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.5, opacity: 0.85 }}>
                1) Включи тумблер <b>OpenCode / Muse Spark</b> выше и нажми <b>Подключить</b> во вкладке Подключение.<br />
                2) Запусти <code>opencode</code> с прокси (без TUN, только opencode идёт через VPN):
              </div>
              <pre
                style={{
                  marginTop: 8,
                  padding: 8,
                  background: "#111",
                  color: "#0f0",
                  borderRadius: 6,
                  fontSize: 12,
                  overflowX: "auto",
                }}
              >
{`# PowerShell
$env:HTTPS_PROXY="http://127.0.0.1:2080"; $env:HTTP_PROXY="http://127.0.0.1:2080"; $env:NO_PROXY="localhost,127.0.0.1,::1"; opencode run "привет" --model opencode/muse-spark-1.2-contributor-free
# или батник из корня проекта:
.\\start-opencode-proxy.bat run "привет" --model opencode/muse-spark-1.2-contributor-free`}
              </pre>
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
                Для OpenCode Desktop: нажми кнопку ниже — пропишет системные переменные <code>HTTPS_PROXY</code>/
                <code>NO_PROXY</code> (вариант 2) автоматически.
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ fontSize: 12, opacity: 0.8 }}>
                  Статус: {proxyEnvOn == null ? "…" : proxyEnvOn ? "включено ✓" : "выключено"}
                </span>
                {!proxyEnvOn ? (
                  <button className="btn primary" onClick={enableProxyEnv} disabled={busy}>
                    Включить для OpenCode Desktop
                  </button>
                ) : (
                  <button className="btn ghost" onClick={disableProxyEnv} disabled={busy}>
                    Выключить
                  </button>
                )}
                <button
                  className="btn ghost"
                  onClick={refreshProxyEnv}
                  disabled={busy}
                  title="Обновить статус"
                >
                  Обновить
                </button>
              </div>
              <div style={{ fontSize: 11, opacity: 0.6, marginTop: 6 }}>
                Пишет в HKCU\Environment и шлёт WM_SETTINGCHANGE. Перезапусти OpenCode Desktop после включения.
              </div>
            </div>
          </section>

          <section className="profile-card">
            <h2>Правила по доменам</h2>
            <p className="hint">
              Укажите сайт: трафик будет идти через VPN или напрямую. Правила
              применяются при следующем подключении.
            </p>
            <div className="rule-form">
              <input
                className="input"
                placeholder="example.com"
                value={ruleInput}
                onChange={(e) => setRuleInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addRule()}
              />
              <select
                className="select"
                value={ruleAction}
                onChange={(e) =>
                  setRuleAction(e.target.value as "proxy" | "direct")
                }
              >
                <option value="proxy">Через VPN</option>
                <option value="direct">Напрямую</option>
              </select>
              <button className="btn primary" onClick={addRule} disabled={busy}>
                Добавить
              </button>
            </div>

            <div className="rule-lists">
              <div className="rule-col">
                <h3>Через VPN ({state.rules.domainProxy.length})</h3>
                {state.rules.domainProxy.length === 0 && (
                  <p className="empty">Пока нет правил</p>
                )}
                {state.rules.domainProxy.map((d) => (
                  <div className="rule-row" key={`p-${d}`}>
                    <span>{d}</span>
                    <button
                      onClick={() => removeRule(d, "proxy")}
                      disabled={busy}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <div className="rule-col">
                <h3>Напрямую ({state.rules.domainDirect.length})</h3>
                {state.rules.domainDirect.length === 0 && (
                  <p className="empty">Пока нет правил</p>
                )}
                {state.rules.domainDirect.map((d) => (
                  <div className="rule-row" key={`d-${d}`}>
                    <span>{d}</span>
                    <button
                      onClick={() => removeRule(d, "direct")}
                      disabled={busy}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="profile-card">
            <h2>Приложения</h2>
            <p className="hint">
              Трафик указанного приложения идёт через VPN или напрямую. Имя
              процесса можно посмотреть в Диспетчере задач (например,
              Telegram.exe). Изменения применяются сразу.
            </p>
            <div className="rule-form">
              <input
                className="input"
                placeholder="Telegram.exe"
                value={procInput}
                onChange={(e) => setProcInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addProcess()}
              />
              <select
                className="select"
                value={procAction}
                onChange={(e) =>
                  setProcAction(e.target.value as "proxy" | "direct")
                }
              >
                <option value="proxy">Через VPN</option>
                <option value="direct">Напрямую</option>
              </select>
              <button
                className="btn primary"
                onClick={addProcess}
                disabled={busy}
              >
                Добавить
              </button>
            </div>

            <div className="rule-lists">
              <div className="rule-col">
                <h3>Через VPN ({state.rules.processProxy.length})</h3>
                {state.rules.processProxy.length === 0 && (
                  <p className="empty">Пока нет правил</p>
                )}
                {state.rules.processProxy.map((n) => (
                  <div className="rule-row" key={`pp-${n}`}>
                    <span>{n}</span>
                    <button
                      onClick={() => removeProcess(n, "proxy")}
                      disabled={busy}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <div className="rule-col">
                <h3>Напрямую ({state.rules.processDirect.length})</h3>
                {state.rules.processDirect.length === 0 && (
                  <p className="empty">Пока нет правил</p>
                )}
                {state.rules.processDirect.map((n) => (
                  <div className="rule-row" key={`pd-${n}`}>
                    <span>{n}</span>
                    <button
                      onClick={() => removeProcess(n, "direct")}
                      disabled={busy}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </main>
      )}
    </div>
  );
}
