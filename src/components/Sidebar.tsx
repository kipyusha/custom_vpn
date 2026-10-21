import type { Tab } from "../lib/navigation";
import { Icon, type IconName } from "./icons";

const ITEMS: { id: Tab; label: string; icon: IconName }[] = [
  { id: "home", label: "Главная", icon: "home" },
  { id: "rules", label: "Правила", icon: "shield" },
  { id: "monitor", label: "Мониторинг", icon: "chart" },
  { id: "settings", label: "Настройки", icon: "settings" },
];

export function Sidebar({
  tab,
  onChange,
}: {
  tab: Tab;
  onChange: (tab: Tab) => void;
}) {
  return (
    <aside className="sidebar">
      <nav className="nav-list" aria-label="Основная навигация">
        {ITEMS.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${tab === item.id ? "active" : ""}`}
            onClick={() => onChange(item.id)}
          >
            <span className="nav-icon">
              <Icon name={item.icon} size={19} />
            </span>
            <span className="nav-label">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-card">
          <span className="sidebar-card-icon">
            <Icon name="zap" size={17} />
          </span>
          <div className="sidebar-card-text">
            <strong>CustomVPN</strong>
            <span>Быстрый, безопасный, без лишнего</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
