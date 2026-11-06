import { useEffect, useState } from "react";
import type { RulesFocus, RulesSection } from "../lib/navigation";
import type { SiteItem } from "../lib/site";
import { Icon } from "./icons";
import { SiteCard } from "./SiteCard";

type Section = RulesSection;
type RuleAction = "proxy" | "direct";

export function RulesPage({
  sites,
  focus,
  busy,
  connected,
  hasDeletedPresets,
  onToggle,
  onToggleInclude,
  onToggleHidden,
  onRemove,
  onAddSub,
  onRemoveSub,
  onLearn,
  onAddSite,
  onRestorePresets,
  state,
  ruleInput,
  setRuleInput,
  ruleAction,
  setRuleAction,
  onAddRule,
  onRemoveRule,
  procInput,
  setProcInput,
  procAction,
  setProcAction,
  onAddProcess,
  onRemoveProcess,
}: {
  sites: SiteItem[];
  focus: RulesFocus | null;
  busy: boolean;
  connected: boolean;
  hasDeletedPresets: boolean;
  onToggle: (site: SiteItem) => void;
  onToggleInclude: (site: SiteItem, include: boolean) => void;
  onToggleHidden: (site: SiteItem) => void;
  onRemove: (site: SiteItem) => void;
  onAddSub: (site: SiteItem, subdomain: string) => void;
  onRemoveSub: (site: SiteItem, subdomain: string) => void;
  onLearn: (site: SiteItem) => void;
  onAddSite: () => void;
  onRestorePresets: () => void;
  state: {
    rules: {
      domainProxy: string[];
      domainDirect: string[];
      processProxy: string[];
      processDirect: string[];
    };
  };
  ruleInput: string;
  setRuleInput: (value: string) => void;
  ruleAction: RuleAction;
  setRuleAction: (value: RuleAction) => void;
  onAddRule: () => void;
  onRemoveRule: (domain: string, action: RuleAction) => void;
  procInput: string;
  setProcInput: (value: string) => void;
  procAction: RuleAction;
  setProcAction: (value: RuleAction) => void;
  onAddProcess: () => void;
  onRemoveProcess: (name: string, action: RuleAction) => void;
}) {
  const [section, setSection] = useState<Section>("sites");
  const enabledSites = sites.filter((s) => s.enabled).length;

  useEffect(() => {
    if (focus) setSection(focus.section);
  }, [focus]);

  useEffect(() => {
    if (!focus) return;
    let cancelled = false;
    let attemptTimer = 0;
    let removeTimer = 0;

    const attempt = (left: number) => {
      if (cancelled) return;
      const el = Array.from(
        document.querySelectorAll<HTMLElement>("[data-focus]"),
      ).find((node) => node.dataset.focus === focus.target);
      if (!el) {
        if (left > 0) {
          attemptTimer = window.setTimeout(() => attempt(left - 1), 50);
        }
        return;
      }
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.remove("is-focused");
      void el.offsetWidth;
      el.classList.add("is-focused");
      removeTimer = window.setTimeout(
        () => el.classList.remove("is-focused"),
        2600,
      );
    };

    attemptTimer = window.setTimeout(() => attempt(30), 30);
    return () => {
      cancelled = true;
      window.clearTimeout(attemptTimer);
      window.clearTimeout(removeTimer);
    };
  }, [focus]);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Правила</h1>
          <p>
            Управляйте тем, что идёт через VPN. Изменения применяются сразу,
            если VPN подключён.
          </p>
        </div>
      </header>

      <div className="rules-toolbar">
        <div className="segmented">
          <button
            className={section === "sites" ? "active" : ""}
            onClick={() => setSection("sites")}
          >
            Сайты <span>{sites.length}</span>
          </button>
          <button
            className={section === "domains" ? "active" : ""}
            onClick={() => setSection("domains")}
          >
            Домены{" "}
            <span>
              {state.rules.domainProxy.length + state.rules.domainDirect.length}
            </span>
          </button>
          <button
            className={section === "apps" ? "active" : ""}
            onClick={() => setSection("apps")}
          >
            Приложения{" "}
            <span>
              {state.rules.processProxy.length +
                state.rules.processDirect.length}
            </span>
          </button>
        </div>
        <button
          className="btn primary rules-toolbar-add"
          onClick={onAddSite}
          disabled={busy}
        >
          <Icon name="plus" size={17} />
          Добавить сайт
        </button>
      </div>

      {section === "sites" && (
        <section className="card rules-section">
          <div className="card-head">
            <div>
              <h2>Сайты</h2>
              <p>
                Через VPN идут только отмеченные сайты. Остальные открываются
                напрямую. Активно: {enabledSites} из {sites.length}.
              </p>
            </div>
            {hasDeletedPresets && (
              <button
                className="btn ghost sm"
                onClick={onRestorePresets}
                disabled={busy}
              >
                Вернуть стандартные
              </button>
            )}
          </div>

          <div className="site-list">
            {sites.map((site) => (
              <SiteCard
                key={`${site.kind}-${site.id}`}
                site={site}
                focus={
                  focus &&
                  focus.siteKey === `${site.kind}-${site.id}`
                    ? focus
                    : null
                }
                busy={busy}
                connected={connected}
                onToggle={onToggle}
                onToggleInclude={onToggleInclude}
                onToggleHidden={onToggleHidden}
                onRemove={onRemove}
                onAddSub={onAddSub}
                onRemoveSub={onRemoveSub}
                onLearn={onLearn}
              />
            ))}
          </div>
        </section>
      )}

      {section === "domains" && (
        <section className="card rules-section">
          <div className="card-head">
            <div>
              <h2>Правила по доменам</h2>
              <p>
                Точечные исключения: домен можно направить через VPN или
                напрямую, независимо от списка сайтов.
              </p>
            </div>
          </div>

          <div className="inline-form">
            <input
              className="input"
              placeholder="example.com"
              value={ruleInput}
              onChange={(e) => setRuleInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onAddRule()}
            />
            <select
              className="select"
              value={ruleAction}
              onChange={(e) => setRuleAction(e.target.value as RuleAction)}
            >
              <option value="proxy">Через VPN</option>
              <option value="direct">Напрямую</option>
            </select>
            <button className="btn primary" onClick={onAddRule} disabled={busy}>
              Добавить
            </button>
          </div>

          <div className="rule-columns">
            <RuleColumn
              title="Через VPN"
              tone="on"
              kind="domain"
              action="proxy"
              items={state.rules.domainProxy}
              onRemove={(domain) => onRemoveRule(domain, "proxy")}
              busy={busy}
            />
            <RuleColumn
              title="Напрямую"
              tone="off"
              kind="domain"
              action="direct"
              items={state.rules.domainDirect}
              onRemove={(domain) => onRemoveRule(domain, "direct")}
              busy={busy}
            />
          </div>
        </section>
      )}

      {section === "apps" && (
        <section className="card rules-section">
          <div className="card-head">
            <div>
              <h2>Правила по приложениям</h2>
              <p>
                Имя процесса можно посмотреть в Диспетчере задач, например
                Telegram.exe. Изменения применяются сразу.
              </p>
            </div>
          </div>

          <div className="inline-form">
            <input
              className="input"
              placeholder="Telegram.exe"
              value={procInput}
              onChange={(e) => setProcInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onAddProcess()}
            />
            <select
              className="select"
              value={procAction}
              onChange={(e) => setProcAction(e.target.value as RuleAction)}
            >
              <option value="proxy">Через VPN</option>
              <option value="direct">Напрямую</option>
            </select>
            <button
              className="btn primary"
              onClick={onAddProcess}
              disabled={busy}
            >
              Добавить
            </button>
          </div>

          <div className="rule-columns">
            <RuleColumn
              title="Через VPN"
              tone="on"
              kind="process"
              action="proxy"
              items={state.rules.processProxy}
              onRemove={(name) => onRemoveProcess(name, "proxy")}
              busy={busy}
            />
            <RuleColumn
              title="Напрямую"
              tone="off"
              kind="process"
              action="direct"
              items={state.rules.processDirect}
              onRemove={(name) => onRemoveProcess(name, "direct")}
              busy={busy}
            />
          </div>
        </section>
      )}
    </div>
  );
}

function RuleColumn({
  title,
  tone,
  kind,
  action,
  items,
  onRemove,
  busy,
}: {
  title: string;
  tone: "on" | "off";
  kind: "domain" | "process";
  action: RuleAction;
  items: string[];
  onRemove: (value: string) => void;
  busy: boolean;
}) {
  return (
    <div className="rule-column">
      <div className="rule-column-head">
        <span className={`dot ${tone}`} />
        <h3>{title}</h3>
        <span className="rule-count">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="empty">Пока нет правил</p>
      ) : (
        <div className="rule-items">
          {items.map((item) => (
            <div
              className="rule-item"
              key={item}
              data-focus={`${kind}:${action}:${item}`}
            >
              <span>{item}</span>
              <button
                className="icon-btn danger"
                onClick={() => onRemove(item)}
                disabled={busy}
                title="Удалить"
                aria-label={`Удалить ${item}`}
              >
                <Icon name="close" size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
