import { useEffect, useMemo, useState } from "react";
import type { ConnectionLogEntry } from "../lib/monitor";
import {
  PRESET_SITES,
  registrableDomain,
  siteDomain,
  type SiteItem,
} from "../lib/site";
import { BrandTile } from "./brandIcons";
import { Icon } from "./icons";
import { Modal } from "./Modal";

interface Candidate {
  domain: string;
  hosts: string[];
  processes: string[];
  bytes: number;
  count: number;
}

function normalizeHost(value: string) {
  let host = value.trim().toLowerCase();
  if (!host) return null;
  if (host.startsWith("[") || host.includes("/") || host.includes(":")) {
    return null;
  }
  host = host.replace(/\.$/, "");
  if (!host.includes(".")) return null;
  if (host === "localhost" || host.endsWith(".local")) return null;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return null;
  if (!/^[a-z0-9.-]+$/i.test(host)) return null;
  return host;
}

function baseDomainsFor(site: SiteItem) {
  if (site.kind === "preset") {
    const preset = PRESET_SITES.find((p) => p.id === site.id);
    if (preset) return preset.domains;
  }
  const domain = siteDomain(site.url);
  return domain ? [domain] : [];
}

function collectCandidates(
  entries: ConnectionLogEntry[],
  site: SiteItem,
  startedAt: number,
  endedAt: number | null,
) {
  const baseDomains = baseDomainsFor(site);
  const known = new Set(site.subdomains.map((d) => d.toLowerCase()));
  const covered = (host: string) =>
    baseDomains.some(
      (base) => host === base || host.endsWith(`.${base}`),
    );
  const chart = new Map<
    string,
    {
      domain: string;
      hosts: Set<string>;
      processes: Set<string>;
      bytes: number;
      count: number;
    }
  >();

  for (const entry of entries) {
    if (entry.lastFlow < startedAt) continue;
    if (endedAt !== null && entry.firstSeen > endedAt) continue;
    const host = normalizeHost(entry.conn.host);
    if (!host || covered(host) || known.has(host)) continue;
    const domain = registrableDomain(host);
    if (!domain || !domain.includes(".") || known.has(domain)) continue;
    const current = chart.get(domain) ?? {
      domain,
      hosts: new Set<string>(),
      processes: new Set<string>(),
      bytes: 0,
      count: 0,
    };
    current.hosts.add(host);
    if (entry.conn.process) current.processes.add(entry.conn.process);
    current.bytes += entry.conn.upload + entry.conn.download;
    current.count += 1;
    chart.set(domain, current);
  }

  return [...chart.values()]
    .map<Candidate>((c) => ({
      domain: c.domain,
      hosts: [...c.hosts].sort(),
      processes: [...c.processes].sort(),
      bytes: c.bytes,
      count: c.count,
    }))
    .sort((a, b) => b.bytes - a.bytes || a.domain.localeCompare(b.domain));
}

function formatSize(bytes: number) {
  if (bytes <= 0) return "0 Б";
  const units = ["Б", "КБ", "МБ", "ГБ"];
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[i]}`;
}

function formatTimer(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export function LearnDomainsModal({
  site,
  entries,
  connected,
  busy,
  onClose,
  onAdd,
}: {
  site: SiteItem;
  entries: ConnectionLogEntry[];
  connected: boolean;
  busy: boolean;
  onClose: () => void;
  onAdd: (domains: string[]) => void;
}) {
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [stoppedAt, setStoppedAt] = useState<number | null>(null);
  const [frozen, setFrozen] = useState<Candidate[] | null>(null);
  const [deselected, setDeselected] = useState<Set<string>>(new Set());
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (stoppedAt !== null) return;
    const tick = () =>
      setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt, stoppedAt]);

  const live = useMemo(
    () => collectCandidates(entries, site, startedAt, stoppedAt),
    [entries, site, startedAt, stoppedAt],
  );
  const candidates = frozen ?? live;
  const selected = candidates.filter((c) => !deselected.has(c.domain));

  const stop = () => {
    const at = Date.now();
    setFrozen(collectCandidates(entries, site, startedAt, at));
    setStoppedAt(at);
    setElapsed(Math.max(0, Math.floor((at - startedAt) / 1000)));
  };

  const reset = () => {
    setStartedAt(Date.now());
    setStoppedAt(null);
    setFrozen(null);
    setDeselected(new Set());
    setElapsed(0);
  };

  const toggle = (domain: string) => {
    setDeselected((prev) => {
      const next = new Set(prev);
      if (next.has(domain)) next.delete(domain);
      else next.add(domain);
      return next;
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Поиск связанных доменов"
      className="learn-modal"
    >
      <div className="learn-site">
        <BrandTile
          id={site.id}
          label={site.label}
          url={site.url}
          size="md"
          hidden={site.hidden}
        />
        <div>
          <strong className={site.hidden ? "blurred" : ""}>{site.label}</strong>
          <span className={site.hidden ? "blurred" : ""}>{site.url}</span>
        </div>
        <span className="learn-timer">
          {stoppedAt === null ? "идёт сбор" : "сбор завершён"} ·{" "}
          {formatTimer(elapsed)}
        </span>
      </div>

      <p className="modal-hint">
        Откройте сайт и пользуйтесь им 1–2 минуты: видео, лента, картинки.
        Мы покажем домены, к которым обращался браузер или приложение.
      </p>

      {!connected && (
        <div className="learn-warning">
          <Icon name="info" size={15} />
          VPN отключён — новые соединения не записываются.
        </div>
      )}

      <div className="learn-list-head">
        <span>
          Кандидаты <b>{candidates.length}</b>
        </span>
        {stoppedAt !== null && candidates.length > 0 && (
          <span className="learn-select-actions">
            <button
              className="link-btn"
              onClick={() => setDeselected(new Set())}
            >
              Выбрать все
            </button>
            <button
              className="link-btn"
              onClick={() =>
                setDeselected(new Set(candidates.map((c) => c.domain)))
              }
            >
              Снять все
            </button>
          </span>
        )}
      </div>

      <div className="learn-candidates">
        {candidates.length === 0 ? (
          <div className="learn-empty">
            {stoppedAt === null ? (
              <>
                <span className="learn-pulse" />
                Пока ничего не найдено. Откройте сайт и подождите немного.
              </>
            ) : (
              "Ничего не найдено. Проверьте, что сайт открывался во время сбора."
            )}
          </div>
        ) : (
          candidates.map((candidate) => {
            const checked = !deselected.has(candidate.domain);
            return (
              <label
                className={`learn-row ${checked ? "checked" : ""}`}
                key={candidate.domain}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(candidate.domain)}
                  disabled={busy}
                />
                <span className="learn-domain">
                  <span>{candidate.domain}</span>
                  <small>
                    {candidate.hosts.length > 1
                      ? `${candidate.hosts.length} хоста · `
                      : ""}
                    {candidate.count} соединений
                  </small>
                </span>
                <span className="learn-process">
                  {candidate.processes.join(", ") || "процесс неизвестен"}
                </span>
                <span className="learn-size">{formatSize(candidate.bytes)}</span>
              </label>
            );
          })
        )}
      </div>

      {stoppedAt !== null && candidates.length > 0 && (
        <p className="fine-print">
          В список могут попасть рекламные и общие CDN-домены. Снимите галочки
          с лишних.
        </p>
      )}

      <div className="button-row end learn-actions">
        {stoppedAt === null ? (
          <>
            <button className="btn ghost" onClick={onClose} disabled={busy}>
              Отмена
            </button>
            <button className="btn primary" onClick={stop} disabled={busy}>
              Остановить и проверить
            </button>
          </>
        ) : (
          <>
            <button className="btn ghost" onClick={reset} disabled={busy}>
              Начать заново
            </button>
            <button
              className="btn primary"
              onClick={() => onAdd(selected.map((c) => c.domain))}
              disabled={busy || selected.length === 0}
            >
              Добавить выбранные ({selected.length})
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}
