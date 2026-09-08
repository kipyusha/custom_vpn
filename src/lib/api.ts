import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface StatusInfo {
  running: boolean;
  connected: boolean;
  profileName?: string | null;
  server?: string | null;
  error?: string | null;
}

export interface PingInfo {
  serverMs?: number | null;
  latencyMs?: number | null;
  error?: string | null;
}

export interface ProfileSummary {
  kind: "vless" | "json";
  name: string;
  server?: string | null;
  security?: string | null;
  network?: string | null;
  raw?: string | null;
}

export interface Rules {
  domainProxy: string[];
  domainDirect: string[];
  processProxy: string[];
  processDirect: string[];
}

export interface Settings {
  mixedPort: number;
  clashPort: number;
}

export interface CustomSite {
  id: string;
  label: string;
  domain: string;
  enabled: boolean;
  includeSubdomains: boolean;
  subdomains: string[];
  hidden: boolean;
}

export interface PresetSiteState {
  id: string;
  enabled: boolean;
  deleted: boolean;
  includeSubdomains: boolean;
  subdomains: string[];
  hidden: boolean;
}

export interface AppState {
  profile?: ProfileSummary | null;
  rules: Rules;
  settings: Settings;
  presetStates: PresetSiteState[];
  customSites: CustomSite[];
  status: StatusInfo;
  ping: PingInfo;
  traffic: [number, number];
  connectedSince?: number | null;
  binaryAvailable: boolean;
  admin: boolean;
}

export const api = {
  appState: (): Promise<AppState> => invoke("app_state"),
  setProfileVless: (link: string): Promise<void> =>
    invoke("set_profile_vless", { link }),
  setProfileJson: (raw: string): Promise<void> =>
    invoke("set_profile_json", { raw }),
  clearProfile: (): Promise<void> => invoke("clear_profile"),
  connect: (): Promise<void> => invoke("connect"),
  disconnect: (): Promise<void> => invoke("disconnect"),
  getRules: (): Promise<Rules> => invoke("get_rules"),
  addDomainRule: (domain: string, action: "proxy" | "direct"): Promise<void> =>
    invoke("add_domain_rule", { domain, action }),
  removeDomainRule: (
    domain: string,
    action: "proxy" | "direct",
  ): Promise<void> => invoke("remove_domain_rule", { domain, action }),
  addProcessRule: (name: string, action: "proxy" | "direct"): Promise<void> =>
    invoke("add_process_rule", { name, action }),
  removeProcessRule: (name: string, action: "proxy" | "direct"): Promise<void> =>
    invoke("remove_process_rule", { name, action }),
  setPresetSite: (id: string, enabled: boolean): Promise<void> =>
    invoke("set_preset_site", { id, enabled }),
  deletePresetSite: (id: string): Promise<void> =>
    invoke("delete_preset_site", { id }),
  restorePresetSites: (): Promise<void> => invoke("restore_preset_sites"),
  setPresetSiteIncludeSubdomains: (
    id: string,
    include: boolean,
  ): Promise<void> =>
    invoke("set_preset_site_include_subdomains", { id, include }),
  addPresetSiteSubdomain: (id: string, subdomain: string): Promise<void> =>
    invoke("add_preset_site_subdomain", { id, subdomain }),
  removePresetSiteSubdomain: (
    id: string,
    subdomain: string,
  ): Promise<void> => invoke("remove_preset_site_subdomain", { id, subdomain }),
  setSiteHidden: (
    kind: "preset" | "custom",
    id: string,
    hidden: boolean,
  ): Promise<void> => invoke("set_site_hidden", { kind, id, hidden }),
  addCustomSite: (link: string): Promise<void> =>
    invoke("add_custom_site", { link }),
  removeCustomSite: (id: string): Promise<void> =>
    invoke("remove_custom_site", { id }),
  setCustomSite: (id: string, enabled: boolean): Promise<void> =>
    invoke("set_custom_site", { id, enabled }),
  addCustomSiteSubdomain: (id: string, subdomain: string): Promise<void> =>
    invoke("add_custom_site_subdomain", { id, subdomain }),
  removeCustomSiteSubdomain: (id: string, subdomain: string): Promise<void> =>
    invoke("remove_custom_site_subdomain", { id, subdomain }),
  setCustomSiteIncludeSubdomains: (
    id: string,
    include: boolean,
  ): Promise<void> => invoke("set_custom_site_include_subdomains", { id, include }),
  onStatus: (cb: (s: StatusInfo) => void) =>
    listen<StatusInfo>("status", (e) => cb(e.payload)),
  onTraffic: (cb: (up: number, down: number) => void) =>
    listen<{ up: number; down: number }>("traffic", (e) =>
      cb(e.payload.up, e.payload.down),
    ),
  onPing: (cb: (p: PingInfo) => void) =>
    listen<PingInfo>("ping", (e) => cb(e.payload)),
  getOpencodeProxyEnv: (): Promise<boolean> => invoke("get_opencode_proxy_env"),
  setOpencodeProxyEnv: (): Promise<void> => invoke("set_opencode_proxy_env"),
  clearOpencodeProxyEnv: (): Promise<void> => invoke("clear_opencode_proxy_env"),
};

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B/s";
  const units = ["B/s", "KB/s", "MB/s", "GB/s"];
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(val >= 100 ? 0 : 1)} ${units[i]}`;
}
