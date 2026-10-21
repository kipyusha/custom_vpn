import type { AppState } from "../lib/api";
import ghostLogo from "../assets/ghost.png";
import { Icon } from "./icons";

export function SettingsPage({
  state,
  appVersion,
  proxyEnvOn,
  busy,
  onRefreshProxyEnv,
  onEnableProxyEnv,
  onDisableProxyEnv,
  onCleanupOrphans,
  onCheckUpdates,
  checkingUpdate,
}: {
  state: AppState;
  appVersion: string | null;
  proxyEnvOn: boolean | null;
  busy: boolean;
  onRefreshProxyEnv: () => void;
  onEnableProxyEnv: () => void;
  onDisableProxyEnv: () => void;
  onCleanupOrphans: () => void;
  onCheckUpdates: () => void;
  checkingUpdate: boolean;
}) {
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Настройки</h1>
          <p>Прокси для OpenCode, параметры соединения и диагностика.</p>
        </div>
      </header>

      <div className="settings-grid">
        <section className="card settings-card">
          <div className="card-head">
            <div className="card-title-row">
              <span className="section-icon">
                <Icon name="terminal" size={18} />
              </span>
              <h2>OpenCode Desktop</h2>
            </div>
            <span className={`tag ${proxyEnvOn ? "on" : "off"}`}>
              {proxyEnvOn == null ? "…" : proxyEnvOn ? "включено" : "выключено"}
            </span>
          </div>
          <p className="card-text">
            Прописывает системные переменные <code>HTTPS_PROXY</code> и{" "}
            <code>NO_PROXY</code>, чтобы OpenCode Desktop и Muse Spark ходили
            через VPN. После включения перезапустите OpenCode.
          </p>
          <pre className="code-block">{`$env:HTTPS_PROXY="http://127.0.0.1:${state.settings.mixedPort}"
$env:HTTP_PROXY="http://127.0.0.1:${state.settings.mixedPort}"
$env:NO_PROXY="localhost,127.0.0.1,::1"`}</pre>
          <div className="button-row">
            {!proxyEnvOn ? (
              <button
                className="btn primary"
                onClick={onEnableProxyEnv}
                disabled={busy}
              >
                Включить прокси
              </button>
            ) : (
              <button
                className="btn ghost"
                onClick={onDisableProxyEnv}
                disabled={busy}
              >
                Выключить
              </button>
            )}
            <button
              className="btn ghost"
              onClick={onRefreshProxyEnv}
              disabled={busy}
            >
              <Icon name="refresh" size={15} />
              Обновить статус
            </button>
          </div>
          <p className="fine-print">
            Пишет в HKCU\Environment и отправляет WM_SETTINGCHANGE.
          </p>
        </section>

        <section className="card settings-card">
          <div className="card-head">
            <div className="card-title-row">
              <span className="section-icon">
                <Icon name="plug" size={18} />
              </span>
              <h2>Соединение</h2>
            </div>
          </div>
          <div className="settings-rows">
            <SettingRow
              label="Mixed-порт"
              value={String(state.settings.mixedPort)}
              hint="HTTP/SOCKS для приложений"
            />
            <SettingRow
              label="Clash API"
              value={String(state.settings.clashPort)}
              hint="статистика и соединения"
            />
            <SettingRow
              label="Права администратора"
              value={state.admin ? "есть" : "нет"}
              hint={state.admin ? "полный доступ" : "возможны ограничения"}
              tone={state.admin ? "ok" : "warn"}
            />
            <SettingRow
              label="sing-box"
              value={state.binaryAvailable ? "найден" : "не найден"}
              hint={state.binaryAvailable ? "движок готов" : "пересоберите приложение"}
              tone={state.binaryAvailable ? "ok" : "error"}
            />
          </div>
          <div className="button-row">
            <button
              className="btn ghost"
              onClick={onCleanupOrphans}
              disabled={busy}
            >
              <Icon name="trash" size={15} />
              Убрать осиротевшие процессы
            </button>
          </div>
        </section>

        <section className="card settings-card">
          <div className="card-head">
            <div className="card-title-row">
              <span className="section-icon">
                <Icon name="cloud" size={18} />
              </span>
              <h2>Обновления</h2>
            </div>
          </div>
          <div className="settings-rows">
            <SettingRow
              label="Текущая версия"
              value={appVersion ? `v${appVersion}` : "—"}
              hint="установленная сборка"
            />
            <SettingRow
              label="Автопроверка"
              value="каждые 6 часов"
              hint="и при запуске приложения"
            />
          </div>
          <div className="button-row">
            <button
              className="btn primary"
              onClick={onCheckUpdates}
              disabled={checkingUpdate}
            >
              <Icon name="refresh" size={15} />
              {checkingUpdate ? "Проверка…" : "Проверить обновления"}
            </button>
          </div>
        </section>

        <section className="card settings-card about-card">
          <div className="about-brand">
            <span className="logo-badge lg">
              <img src={ghostLogo} alt="" />
            </span>
            <div>
              <h2>CustomVPN</h2>
              <p>
                Десктопный VPN-клиент для Windows на базе sing-box. VLESS,
                правила по сайтам и приложениям, живой мониторинг.
              </p>
            </div>
          </div>
          <div className="about-meta">
            <span>Версия {appVersion ? `v${appVersion}` : "—"}</span>
            <span>Движок sing-box 1.13</span>
            <span>Windows · WebView2</span>
          </div>
        </section>
      </div>
    </div>
  );
}

function SettingRow({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "ok" | "warn" | "error";
}) {
  return (
    <div className="setting-row">
      <div>
        <span className="setting-label">{label}</span>
        {hint && <span className="setting-hint">{hint}</span>}
      </div>
      <span className={`setting-value ${tone ?? ""}`}>{value}</span>
    </div>
  );
}
