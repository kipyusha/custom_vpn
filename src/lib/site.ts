export const PRESET_SITES = [
  {
    id: "youtube",
    label: "YouTube",
    url: "https://www.youtube.com/",
    domains: ["youtube.com", "youtu.be", "googlevideo.com", "ytimg.com"],
  },
  {
    id: "chatgpt",
    label: "ChatGPT",
    url: "https://chatgpt.com",
    domains: ["chatgpt.com", "openai.com"],
  },
  {
    id: "instagram",
    label: "Instagram",
    url: "https://www.instagram.com/",
    domains: ["instagram.com", "cdninstagram.com"],
  },
  {
    id: "twitch",
    label: "Twitch",
    url: "https://www.twitch.tv/",
    domains: ["twitch.tv", "jtvnw.net", "ttvnw.net"],
  },
  {
    id: "opencode",
    label: "OpenCode / Muse Spark",
    url: "https://opencode.ai/",
    domains: ["opencode.ai"],
  },
];

const SECOND_LEVEL_SUFFIXES = new Set([
  "co.uk",
  "org.uk",
  "ac.uk",
  "gov.uk",
  "com.au",
  "net.au",
  "org.au",
  "co.jp",
  "ne.jp",
  "or.jp",
  "co.kr",
  "com.br",
  "com.mx",
  "com.tr",
  "com.cn",
  "com.tw",
  "co.in",
  "co.nz",
  "co.za",
  "com.sg",
  "com.hk",
  "com.ar",
  "com.pl",
  "com.ua",
  "github.io",
  "pages.dev",
  "vercel.app",
  "netlify.app",
  "workers.dev",
  "web.app",
  "firebaseapp.com",
  "blogspot.com",
  "wordpress.com",
  "azurewebsites.net",
  "herokuapp.com",
]);

export interface SiteItem {
  kind: "preset" | "custom";
  id: string;
  label: string;
  url: string;
  enabled: boolean;
  includeSubdomains: boolean;
  subdomains: string[];
  hidden: boolean;
}

export function siteKey(site: SiteItem) {
  return `${site.kind}-${site.id}`;
}

export function siteDomain(value: string) {
  try {
    const url = new URL(
      /^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`,
    );
    return url.hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

export function registrableDomain(host: string) {
  const clean = host.trim().toLowerCase().replace(/\.$/, "");
  const parts = clean.split(".").filter(Boolean);
  if (parts.length < 2) return clean;
  const lastTwo = parts.slice(-2).join(".");
  if (parts.length >= 3 && SECOND_LEVEL_SUFFIXES.has(lastTwo)) {
    return parts.slice(-3).join(".");
  }
  return lastTwo;
}
