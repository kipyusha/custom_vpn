import { useState } from "react";
import type { SiteItem } from "../lib/site";
import { siteKey } from "../lib/site";
import { BrandTile } from "./brandIcons";
import { Icon } from "./icons";
import { Toggle } from "./Toggle";

export function RulesPanel({
  sites,
  busy,
  onToggle,
  onAdd,
  onOpenFull,
}: {
  sites: SiteItem[];
  busy: boolean;
  onToggle: (site: SiteItem) => void;
  onAdd: () => void;
  onOpenFull: () => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <aside className="rules-panel card">
      <div className="panel-head">
        <div>
          <h2>Правила</h2>
          <span className="panel-count">{sites.length}</span>
        </div>
        <button
          className="icon-btn accent"
          title="Добавить сайт"
          onClick={onAdd}
          disabled={busy}
        >
          <Icon name="plus" size={18} />
        </button>
      </div>

      <div className="site-mini-list">
        {sites.map((site) => {
          const key = siteKey(site);
          const open = expanded === key;
          return (
            <div className="site-mini" key={key}>
              <div className="site-mini-top">
                <BrandTile
                  id={site.id}
                  label={site.label}
                  url={site.url}
                  size="sm"
                  hidden={site.hidden}
                />
                <div className="site-mini-info">
                  <span className={`site-mini-name ${site.hidden ? "blurred" : ""}`}>
                    {site.label}
                  </span>
                  <span className={`site-mini-url ${site.hidden ? "blurred" : ""}`}>
                    {site.url}
                  </span>
                </div>
                <Toggle
                  checked={site.enabled}
                  onChange={() => onToggle(site)}
                  disabled={busy}
                  label={`${site.label}: ${site.enabled ? "через VPN" : "напрямую"}`}
                />
              </div>
              <div className="site-mini-bottom">
                <span className={`tag sm ${site.enabled ? "on" : "off"}`}>
                  {site.enabled ? "через VPN" : "напрямую"}
                </span>
                <button
                  className="sub-toggle sm"
                  onClick={() => setExpanded(open ? null : key)}
                >
                  Домены ({site.subdomains.length})
                  <Icon name={open ? "chevronDown" : "chevronRight"} size={14} />
                </button>
              </div>
              {open && (
                <div className="site-mini-subs">
                  {site.subdomains.length === 0 ? (
                    <span className="muted-note">Домены не добавлены</span>
                  ) : (
                    site.subdomains.map((subdomain) => (
                      <span className="sub-tag" key={subdomain}>
                        <span className={site.hidden ? "blurred" : ""}>
                          {subdomain}
                        </span>
                      </span>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button className="panel-link" onClick={onOpenFull}>
        Все правила
        <Icon name="chevronRight" size={15} />
      </button>
    </aside>
  );
}
