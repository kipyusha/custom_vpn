import { Component, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";
import {
  api,
  type AppState,
  type ConnectionInfo,
  type PingInfo,
  type StatusInfo,
} from "./lib/api";
import type { Point } from "./components/SpeedGraph";
import type { RulesFocus, Tab } from "./lib/navigation";
import type { ConnectionLogEntry, HostGroup } from "./lib/monitor";
import { PRESET_SITES, siteDomain, type SiteItem } from "./lib/site";
import { TitleBar } from "./components/TitleBar";
import { Sidebar } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import { HomePage } from "./components/HomePage";
import { RulesPage } from "./components/RulesPage";
import { RulesPanel } from "./components/RulesPanel";
import { MonitorPage } from "./components/MonitorPage";
import { SettingsPage } from "./components/SettingsPage";
import { ProfileModal } from "./components/ProfileModal";
import { SiteModal } from "./components/SiteModal";
import { LearnDomainsModal } from "./components/LearnDomainsModal";
import { Modal } from "./components/Modal";
import { Icon } from "./components/icons";
import "./App.css";

const IDLE_TIMEOUT = 10 * 1000;
const HISTORY_LIMIT = 1800;

class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    try {
      const prev = localStorage.getItem("last-ui-error") ?? "";
      localStorage.setItem(
        "last-ui-error",
        `${new Date().toISOString()} ${error.message}\n${error.stack ?? ""}\n---\n${prev}`.slice(0, 4000),
      );
    } catch {}
  }

  render() {
    if (this.state.error) {
      const e = this.state.error;
      return (
        <div className="fatal-error">
          <h2>Ошибка интерфейса</h2>
          <p>{e.message}</p>
          <pre>{e.stack}</pre>
          <button
            className="btn primary"
            onClick={() => window.location.reload()}
          >
            Перезагрузить окно
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [tab, setTab] = useState<Tab>("home");
  const [profileMode, setProfileMode] = useState<"vless" | "json">("vless");
  const [vlessLink, setVlessLink] = useState("");
  const [jsonConfig, setJsonConfig] = useState("");
  const [ruleInput, setRuleInput] = useState("");
  const [ruleAction, setRuleAction] = useState<"proxy" | "direct">("proxy");
  const [procInput, setProcInput] = useState("");
  const [procAction, setProcAction] = useState<"proxy" | "direct">("proxy");
  const [siteLink, setSiteLink] = useState("");
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [siteModalOpen, setSiteModalOpen] = useState(false);
  const [learningSite, setLearningSite] = useState<SiteItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [ruleFocus, setRuleFocus] = useState<RulesFocus | null>(null);
  const [busy, setBusy] = useState(false);
  const focusTokenRef = useRef(0);
  const [proxyEnvOn, setProxyEnvOn] = useState<boolean | null>(null);
  const [history, setHistory] = useState<Point[]>([]);
  const historyRef = useRef<Point[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [connLog, setConnLog] = useState<ConnectionLogEntry[]>([]);
  const [activeList, setActiveList] = useState<ConnectionInfo[]>([]);
  const [onlyVpn, setOnlyVpn] = useState(true);
  const [search, setSearch] = useState("");
  const [update, setUpdate] = useState<Update | null>(null);
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateProgress, setUpdateProgress] = useState<number | null>(null);
  const [updateMsg, setUpdateMsg] = useState<string | null>(null);
  const dlRef = useRef({ done: 0, total: 0 });
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const trackRef = useRef<
    Map<string, { first: number; up: number; down: number; flow: number }>
  >(new Map());

  useEffect(() => {
    getVersion()
      .then(setAppVersion)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!ruleFocus) return;
    const id = window.setTimeout(() => setRuleFocus(null), 4000);
    return () => window.clearTimeout(id);
  }, [ruleFocus]);

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
    [],
  );

  const clearConnLog = useCallback(() => {
    trackRef.current.clear();
    setConnLog([]);
    setActiveList([]);
  }, []);

  const hostGroups = useMemo<HostGroup[]>(() => {
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
    groups.sort(
      (a, b) =>
        Number(b.active) - Number(a.active) || b.lastSeen - a.lastSeen,
    );
    return groups;
  }, [connLog, activeList, onlyVpn, search]);

  const pushPoint = useCallback((up: number, down: number) => {
    const pts = [...historyRef.current, { t: Date.now(), up, down }];
    if (pts.length > HISTORY_LIMIT) pts.splice(0, pts.length - HISTORY_LIMIT);
    historyRef.current = pts;
    setHistory(pts);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const st = await api.appState();
      setState(st);
      if (st.traffic) pushPoint(st.traffic[0], st.traffic[1]);
    } catch (e) {
      setError(String(e));
    }
  }, [pushPoint]);

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
    if (!state || !state.status.connected || !state.connectedSince) {
      setElapsed(0);
      return;
    }
    const tick = () =>
      setElapsed(
        Math.max(
          0,
          Math.floor((Date.now() - (state.connectedSince as number)) / 1000),
        ),
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [state?.status.connected, state?.connectedSince]);

  useEffect(() => {
    refresh();
    const unsubs = [
      api.onTraffic((up, down) => {
        pushPoint(up, down);
        setState((s) => (s ? { ...s, traffic: [up, down] } : s));
      }),
      api.onStatus((status: StatusInfo) => {
        setState((s) => (s ? { ...s, status } : s));
        api.refreshTray().catch(() => {});
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

  useEffect(() => {
    if (tab === "monitor" && state?.status.connected) {
      api.getConnections().then(mergeConnections).catch(() => {});
    }
  }, [tab, state?.status.connected, mergeConnections]);

  useEffect(() => {
    if (!state?.status.connected) setActiveList([]);
  }, [state?.status.connected]);

  useEffect(() => {
    if (tab !== "monitor") return;
    const id = setInterval(() => setNowTick(Date.now()), 10000);
    return () => clearInterval(id);
  }, [tab]);

  const checkForUpdates = useCallback(async (manual: boolean) => {
    setCheckingUpdate(true);
    setUpdateMsg(null);
    try {
      const u = await check();
      if (u) {
        setUpdate(u);
        setUpdateDismissed(false);
        if (manual) setNotice(`Доступна версия ${u.version}`);
      } else if (manual) {
        setNotice("Обновлений нет — у вас последняя версия");
      }
    } catch (e) {
      if (manual) setError(`Проверка обновлений: ${String(e)}`);
    } finally {
      setCheckingUpdate(false);
    }
  }, []);

  useEffect(() => {
    checkForUpdates(false);
    const id = setInterval(() => checkForUpdates(false), 6 * 60 * 60 * 1000);
    return () => clearInterval(id);
  }, [checkForUpdates]);

  const installUpdate = useCallback(async () => {
    if (!update) return;
    dlRef.current = { done: 0, total: 0 };
    setUpdateProgress(0);
    setUpdateMsg(null);
    try {
      try {
        await api.disconnect();
      } catch {}
      try {
        await api.cleanupOrphans();
      } catch {}
      await refresh();
      await update.downloadAndInstall((ev) => {
        if (ev.event === "Started") {
          dlRef.current = { done: 0, total: ev.data.contentLength ?? 0 };
          setUpdateProgress(0);
        } else if (ev.event === "Progress") {
          const d = dlRef.current;
          d.done += ev.data.chunkLength;
          setUpdateProgress(
            d.total > 0 ? Math.min(99, Math.round((d.done / d.total) * 100)) : 0,
          );
        } else if (ev.event === "Finished") {
          setUpdateProgress(100);
        }
      });
      await relaunch();
    } catch (e) {
      setUpdateMsg(`Ошибка установки обновления: ${String(e)}`);
      setUpdateProgress(null);
    }
  }, [update, refresh]);

  useEffect(() => {
    const unsubs = [
      api.onCheckUpdates(() => {
        checkForUpdates(true);
      }),
      api.onTrayMinimized(() => {
        setNotice(
          "Приложение продолжает работать в трее. Выход — через меню иконки.",
        );
      }),
      api.onTrayError((msg: string) => {
        setError(msg);
      }),
    ];
    return () => {
      unsubs.forEach((u) => u.then((f) => f()));
    };
  }, [checkForUpdates]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      await refresh();
      return true;
    } catch (e) {
      setError(String(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const focusRules = (focus: Omit<RulesFocus, "token">) => {
    setTab("rules");
    setRuleFocus({ ...focus, token: ++focusTokenRef.current });
  };

  const findSiteFocus = (
    domain: string,
  ): { siteKey: string; target: string; subdomain?: string } | null => {
    for (const s of state?.customSites ?? []) {
      const key = `custom-${s.id}`;
      if (s.domain === domain) {
        return { siteKey: key, target: `site:${key}` };
      }
      if (s.subdomains.includes(domain)) {
        return {
          siteKey: key,
          target: `sub:${key}:${domain}`,
          subdomain: domain,
        };
      }
    }
    for (const p of PRESET_SITES) {
      const st = state?.presetStates.find((s) => s.id === p.id);
      if (st?.deleted) continue;
      const key = `preset-${p.id}`;
      if (p.domains.includes(domain)) {
        return { siteKey: key, target: `site:${key}` };
      }
      if (st?.subdomains.includes(domain)) {
        return {
          siteKey: key,
          target: `sub:${key}:${domain}`,
          subdomain: domain,
        };
      }
    }
    return null;
  };

  const focusExistingSite = (domain: string, noun = "Сайт") => {
    const existing = findSiteFocus(domain);
    if (!existing) return false;
    setNotice(`${noun} ${domain} уже добавлен — открыт в правилах`);
    focusRules({
      section: "sites",
      target: existing.target,
      siteKey: existing.siteKey,
      subdomain: existing.subdomain,
    });
    return true;
  };

  const saveProfile = async () => {
    if (profileMode === "vless") {
      if (!vlessLink.trim()) {
        setError("Вставьте ссылку vless://");
        return;
      }
      const ok = await run(async () => {
        await api.setProfileVless(vlessLink.trim());
        setVlessLink("");
        setNotice("Профиль сохранён");
      });
      if (ok) setProfileModalOpen(false);
    } else {
      if (!jsonConfig.trim()) {
        setError("Вставьте JSON-конфиг");
        return;
      }
      const ok = await run(async () => {
        await api.setProfileJson(jsonConfig.trim());
        setJsonConfig("");
        setNotice("JSON-профиль сохранён");
      });
      if (ok) setProfileModalOpen(false);
    }
  };

  const clearProfile = async () => {
    const ok = await run(() => api.clearProfile());
    if (ok) setProfileModalOpen(false);
  };

  const onConnect = () => {
    if (state?.status.connected) {
      run(() => api.disconnect());
    } else {
      run(async () => {
        await api.connect();
        checkForUpdates(false);
      });
    }
  };

  const addRule = () => {
    const d = ruleInput.trim().toLowerCase();
    if (!d) return;
    const existing = state?.rules.domainProxy.includes(d)
      ? "proxy"
      : state?.rules.domainDirect.includes(d)
        ? "direct"
        : null;
    if (existing) {
      setRuleInput("");
      setNotice(
        `Домен ${d} уже добавлен (${existing === "proxy" ? "через VPN" : "напрямую"}) — открыт в правилах`,
      );
      focusRules({
        section: "domains",
        target: `domain:${existing}:${d}`,
      });
      return;
    }
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
    const existing = state?.rules.processProxy.includes(n)
      ? "proxy"
      : state?.rules.processDirect.includes(n)
        ? "direct"
        : null;
    if (existing) {
      setProcInput("");
      setNotice(
        `Приложение ${n} уже добавлено (${existing === "proxy" ? "через VPN" : "напрямую"}) — открыто в правилах`,
      );
      focusRules({
        section: "apps",
        target: `process:${existing}:${n}`,
      });
      return;
    }
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

  const hasDeletedPresets = useMemo(
    () => (state?.presetStates || []).some((s) => s.deleted),
    [state?.presetStates],
  );

  const activeRulesCount = useMemo(() => {
    if (!state) return 0;
    return (
      sites.filter((s) => s.enabled).length +
      state.rules.domainProxy.length +
      state.rules.processProxy.length
    );
  }, [state, sites]);

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

  const addSite = async () => {
    const input = siteLink.trim();
    if (!input) {
      setError("Введите адрес сайта");
      return;
    }
    const domain = siteDomain(input);
    if (domain && focusExistingSite(domain)) {
      setSiteLink("");
      setSiteModalOpen(false);
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.addCustomSite(input);
      setSiteLink("");
      setNotice("Сайт добавлен");
      setSiteModalOpen(false);
    } catch (e) {
      const msg = String(e);
      const duplicate = msg.includes("уже добавлен") || msg.includes("уже есть");
      if (domain && duplicate && focusExistingSite(domain)) {
        setSiteLink("");
        setSiteModalOpen(false);
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
    await refresh();
  };

  const addSub = (s: SiteItem, sd: string) => {
    const domain = siteDomain(sd);
    if (domain && focusExistingSite(domain, "Домен")) return;
    run(async () => {
      try {
        if (s.kind === "preset") await api.addPresetSiteSubdomain(s.id, sd);
        else await api.addCustomSiteSubdomain(s.id, sd);
      } catch (e) {
        const msg = String(e);
        const duplicate =
          msg.includes("уже добавлен") || msg.includes("уже есть");
        if (domain && duplicate && focusExistingSite(domain, "Домен")) return;
        throw e;
      }
      setNotice(`Домен ${sd} добавлен`);
    });
  };

  const removeSub = (s: SiteItem, sd: string) => {
    run(() =>
      s.kind === "preset"
        ? api.removePresetSiteSubdomain(s.id, sd)
        : api.removeCustomSiteSubdomain(s.id, sd),
    );
  };

  const addLearnedDomains = async (s: SiteItem, domains: string[]) => {
    const unique = [
      ...new Set(
        domains.map((d) => d.trim().toLowerCase()).filter(Boolean),
      ),
    ];
    if (unique.length === 0) return;
    const ok = await run(async () => {
      const added = await api.addSiteSubdomains(s.kind, s.id, unique);
      setNotice(
        added > 0
          ? `Добавлено доменов: ${added}`
          : "Новых доменов не добавлено",
      );
    });
    if (ok) setLearningSite(null);
  };

  const enableProxyEnv = () =>
    run(async () => {
      await api.setOpencodeProxyEnv();
      await refreshProxyEnv();
      setNotice(
        "Переменные HTTPS_PROXY/NO_PROXY прописаны. Перезапусти OpenCode Desktop",
      );
    });

  const disableProxyEnv = () =>
    run(async () => {
      await api.clearOpencodeProxyEnv();
      await refreshProxyEnv();
      setNotice("Переменные прокси удалены. Перезапусти OpenCode Desktop");
    });

  if (!state) {
    return <div className="boot-screen">Загрузка…</div>;
  }

  const connected = state.status.connected;
  const profile = state.profile;

  const fmtDur = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
  };

  const protocol = profile
    ? profile.kind === "json"
      ? "JSON"
      : profile.security
        ? `VLESS · ${profile.security}`
        : "VLESS"
    : "—";

  return (
    <ErrorBoundary>
      <div className="app-shell">
        <TitleBar
          version={appVersion}
          connected={connected}
          onOpenSettings={() => setTab("settings")}
        />

        <div className="app-body">
          <Sidebar tab={tab} onChange={setTab} />

          <div className="workspace">
            {(error ||
              notice ||
              updateProgress !== null ||
              updateMsg ||
              !state.admin ||
              !state.binaryAvailable) && (
              <div className="banner-stack">
                {!state.admin && (
                  <div className="banner warn">
                    <span className="banner-icon">
                      <Icon name="shield" size={16} />
                    </span>
                    <span>
                      Приложение работает без прав администратора — возможны
                      ограничения.
                    </span>
                  </div>
                )}
                {!state.binaryAvailable && (
                  <div className="banner error">
                    <span>
                      sing-box.exe не найден. Пересоберите приложение с
                      бинарником.
                    </span>
                  </div>
                )}
                {error && (
                  <div className="banner error">
                    <span>{error}</span>
                    <button
                      className="icon-btn"
                      onClick={() => setError(null)}
                      aria-label="Закрыть"
                    >
                      <Icon name="close" size={14} />
                    </button>
                  </div>
                )}
                {notice && (
                  <div className="banner ok">
                    <span>{notice}</span>
                    <button
                      className="icon-btn"
                      onClick={() => setNotice(null)}
                      aria-label="Закрыть"
                    >
                      <Icon name="close" size={14} />
                    </button>
                  </div>
                )}
                {updateProgress !== null && (
                  <div className="banner ok">
                    <span className="banner-progress">
                      Установка обновления… {updateProgress}%
                      <span className="progress-track">
                        <span
                          className="progress-fill"
                          style={{ width: `${updateProgress}%` }}
                        />
                      </span>
                    </span>
                  </div>
                )}
                {updateMsg && (
                  <div className="banner error">
                    <span>{updateMsg}</span>
                    <button
                      className="icon-btn"
                      onClick={() => setUpdateMsg(null)}
                      aria-label="Закрыть"
                    >
                      <Icon name="close" size={14} />
                    </button>
                  </div>
                )}
              </div>
            )}

            <div
              className={`page-scroll${tab === "rules" ? " rules-scroll" : ""}`}
            >
              <div className="page-shell">
                {tab === "home" && (
                  <div className="home-layout">
                    <HomePage
                      state={state}
                      connected={connected}
                      busy={busy}
                      elapsed={elapsed}
                      history={history}
                      fmtDur={fmtDur}
                      onConnect={onConnect}
                      onEditProfile={() => setProfileModalOpen(true)}
                      onOpenRules={() => setTab("rules")}
                    />
                    <RulesPanel
                      sites={sites}
                      busy={busy}
                      onToggle={toggleSite}
                      onAdd={() => setSiteModalOpen(true)}
                      onOpenFull={() => setTab("rules")}
                    />
                  </div>
                )}

                {tab === "rules" && (
                  <RulesPage
                    state={state}
                    sites={sites}
                    focus={ruleFocus}
                    busy={busy}
                    connected={connected}
                    hasDeletedPresets={hasDeletedPresets}
                    onToggle={toggleSite}
                    onToggleInclude={toggleInclude}
                    onToggleHidden={toggleHidden}
                    onRemove={removeSiteItem}
                    onAddSub={addSub}
                    onRemoveSub={removeSub}
                    onLearn={setLearningSite}
                    onAddSite={() => setSiteModalOpen(true)}
                    onRestorePresets={() =>
                      run(() => api.restorePresetSites())
                    }
                    ruleInput={ruleInput}
                    setRuleInput={setRuleInput}
                    ruleAction={ruleAction}
                    setRuleAction={setRuleAction}
                    onAddRule={addRule}
                    onRemoveRule={removeRule}
                    procInput={procInput}
                    setProcInput={setProcInput}
                    procAction={procAction}
                    setProcAction={setProcAction}
                    onAddProcess={addProcess}
                    onRemoveProcess={removeProcess}
                  />
                )}

                {tab === "monitor" && (
                  <MonitorPage
                    connected={connected}
                    nowTick={nowTick}
                    search={search}
                    setSearch={setSearch}
                    onlyVpn={onlyVpn}
                    setOnlyVpn={setOnlyVpn}
                    onClear={clearConnLog}
                    activeList={activeList}
                    hostGroups={hostGroups}
                  />
                )}

                {tab === "settings" && (
                  <SettingsPage
                    state={state}
                    appVersion={appVersion}
                    proxyEnvOn={proxyEnvOn}
                    busy={busy}
                    onRefreshProxyEnv={refreshProxyEnv}
                    onEnableProxyEnv={enableProxyEnv}
                    onDisableProxyEnv={disableProxyEnv}
                    onCleanupOrphans={() => run(() => api.cleanupOrphans())}
                    onCheckUpdates={() => checkForUpdates(true)}
                    checkingUpdate={checkingUpdate}
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        <StatusBar
          connected={connected}
          profileName={profile?.name ?? null}
          server={profile?.server ?? state.status.server ?? null}
          protocol={protocol}
          rulesCount={activeRulesCount}
          onOpenRules={() => setTab("rules")}
        />

        <ProfileModal
          open={profileModalOpen}
          onClose={() => setProfileModalOpen(false)}
          profile={profile}
          connected={connected}
          busy={busy}
          mode={profileMode}
          setMode={setProfileMode}
          vlessLink={vlessLink}
          setVlessLink={setVlessLink}
          jsonConfig={jsonConfig}
          setJsonConfig={setJsonConfig}
          onSave={saveProfile}
          onClear={clearProfile}
        />

        <SiteModal
          open={siteModalOpen}
          onClose={() => setSiteModalOpen(false)}
          value={siteLink}
          setValue={setSiteLink}
          onSubmit={addSite}
          busy={busy}
        />

        {learningSite && (
          <LearnDomainsModal
            site={learningSite}
            entries={connLog}
            connected={connected}
            busy={busy}
            onClose={() => setLearningSite(null)}
            onAdd={(domains) => addLearnedDomains(learningSite, domains)}
          />
        )}

        <Modal
          open={!!update && !updateDismissed && updateProgress === null}
          onClose={() => setUpdateDismissed(true)}
          title="Вышла новая версия"
        >
          {update && (
            <>
              <p className="modal-hint">
                Доступно обновление до версии <b>{update.version}</b>.
                Рекомендуем установить.
              </p>
              {update.body && <pre className="update-notes">{update.body}</pre>}
              <div className="button-row end">
                <button
                  className="btn ghost"
                  onClick={() => setUpdateDismissed(true)}
                >
                  Позже
                </button>
                <button className="btn primary" onClick={installUpdate}>
                  Установить обновление
                </button>
              </div>
            </>
          )}
        </Modal>
      </div>
    </ErrorBoundary>
  );
}
