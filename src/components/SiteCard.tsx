import { useEffect, useState } from "react";
import type { RulesFocus } from "../lib/navigation";
import { siteKey, type SiteItem } from "../lib/site";
import { BrandTile } from "./brandIcons";
import { Icon } from "./icons";
import { Toggle } from "./Toggle";

export function SiteCard({
  site,
  focus,
  busy,
  connected,
  onToggle,
  onToggleInclude,
  onToggleHidden,
  onRemove,
  onAddSub,
  onRemoveSub,
  onLearn,
}: {
  site: SiteItem;
  focus: RulesFocus | null;
  busy: boolean;
  connected: boolean;
  onToggle: (site: SiteItem) => void;
  onToggleInclude: (site: SiteItem, include: boolean) => void;
  onToggleHidden: (site: SiteItem) => void;
  onRemove: (site: SiteItem) => void;
  onAddSub: (site: SiteItem, subdomain: string) => void;
  onRemoveSub: (site: SiteItem, subdomain: string) => void;
  onLearn: (site: SiteItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const key = siteKey(site);

  useEffect(() => {
    if (focus?.subdomain) setOpen(true);
  }, [focus]);

  const add = () => {
    const value = input.trim();
    if (!value) return;
    onAddSub(site, value);
    setInput("");
  };

  return (
    <article className="site-card" data-focus={`site:${key}`}>
      <div className="site-card-main">
        <BrandTile
          id={site.id}
          label={site.label}
          url={site.url}
          size="lg"
          hidden={site.hidden}
        />
        <div className="site-info">
          <div className="site-title-row">
            <span className={`site-name ${site.hidden ? "blurred" : ""}`}>
              {site.label}
            </span>
            {site.hidden && <span className="site-hidden-note">скрыто</span>}
          </div>
          <span className={`site-url ${site.hidden ? "blurred" : ""}`}>
            {site.url}
          </span>
        </div>
        <div className="site-actions">
          <span className={`tag ${site.enabled ? "on" : "off"}`}>
            {site.enabled ? "через VPN" : "напрямую"}
          </span>
          <button
            className="icon-btn"
            title={site.hidden ? "Показать название" : "Скрыть название"}
            onClick={() => onToggleHidden(site)}
            disabled={busy}
          >
            <Icon name={site.hidden ? "eyeOff" : "eye"} size={16} />
          </button>
          <Toggle
            checked={site.enabled}
            onChange={() => onToggle(site)}
            disabled={busy}
            label={`${site.label}: ${site.enabled ? "через VPN" : "напрямую"}`}
          />
          <button
            className="icon-btn danger"
            title="Удалить сайт"
            onClick={() => onRemove(site)}
            disabled={busy}
          >
            <Icon name="trash" size={16} />
          </button>
        </div>
      </div>

      <div className="site-sub-bar">
        <label className="check">
          <input
            type="checkbox"
            checked={site.includeSubdomains}
            onChange={(e) => onToggleInclude(site, e.target.checked)}
            disabled={busy}
          />
          <span>включая поддомены</span>
        </label>
        <div className="site-sub-actions">
          <button
            className="sub-toggle learn"
            onClick={() => onLearn(site)}
            disabled={busy || !connected}
            title={
              connected
                ? "Найти домены, которые использует сайт"
                : "Сначала подключите VPN"
            }
          >
            <Icon name="zap" size={13} />
            Найти домены
          </button>
          <button className="sub-toggle" onClick={() => setOpen((v) => !v)}>
            Домены ({site.subdomains.length})
            <Icon name={open ? "chevronDown" : "chevronRight"} size={15} />
          </button>
        </div>
      </div>

      {open && (
        <div className="site-sub-panel">
          {site.subdomains.length > 0 && (
            <div className="sub-tags">
              {site.subdomains.map((subdomain) => (
                <span
                  className="sub-tag"
                  key={subdomain}
                  data-focus={`sub:${key}:${subdomain}`}
                >
                  <span className={site.hidden ? "blurred" : ""}>
                    {subdomain}
                  </span>
                  <button
                    onClick={() => onRemoveSub(site, subdomain)}
                    disabled={busy}
                    title="Удалить домен"
                    aria-label={`Удалить ${subdomain}`}
                  >
                    <Icon name="close" size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="inline-form">
            <input
              className="input"
              placeholder="cdn.example.net"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
            />
            <button className="btn primary sm" onClick={add} disabled={busy}>
              Добавить
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
