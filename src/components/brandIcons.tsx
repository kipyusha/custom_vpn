import { useEffect, useState, type ReactNode } from "react";
import { siteDomain } from "../lib/site";

const CUSTOM_COLORS = [
  "linear-gradient(135deg, #0ea5e9, #2563eb)",
  "linear-gradient(135deg, #8b5cf6, #d946ef)",
  "linear-gradient(135deg, #14b8a6, #22d3ee)",
  "linear-gradient(135deg, #f59e0b, #ef4444)",
  "linear-gradient(135deg, #22c55e, #14b8a6)",
  "linear-gradient(135deg, #f43f5e, #8b5cf6)",
];

function hash(value: string) {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) h = (h * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const PRESETS: Record<string, ReactNode> = {
  youtube: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <rect x="2" y="5" width="20" height="14" rx="4" fill="#ff0033" />
      <path d="m10 9 6 3-6 3V9Z" fill="#fff" />
    </svg>
  ),
  chatgpt: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path
        d="M12 4.4 6.9 7.3v5.9L12 16.1l5.1-2.9V7.3L12 4.4Z"
        fill="none"
        stroke="#fff"
        strokeWidth="1.5"
      />
      <circle cx="12" cy="10.2" r="2.1" fill="none" stroke="#fff" strokeWidth="1.5" />
      <path d="M12 12.3v3.4M9.9 13.5l-2.4 1.3M14.1 13.5l2.4 1.3" stroke="#fff" strokeWidth="1.5" />
    </svg>
  ),
  instagram: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="5" fill="none" stroke="#fff" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="3.6" fill="none" stroke="#fff" strokeWidth="1.6" />
      <circle cx="17" cy="7" r="1" fill="#fff" />
    </svg>
  ),
  twitch: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path
        d="M5 3h14v10l-4 4h-4l-3 3H6v-3H4V6l1-3Z"
        fill="none"
        stroke="#fff"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M10 8v4M15 8v4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
  opencode: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d="m6 8 4 4-4 4M12 16h6" stroke="#22d3ee" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

export function BrandTile({
  id,
  label,
  url,
  size = "md",
  hidden = false,
}: {
  id: string;
  label: string;
  url?: string;
  size?: "sm" | "md" | "lg";
  hidden?: boolean;
}) {
  const [useService, setUseService] = useState(false);
  const [failed, setFailed] = useState(false);
  const preset = PRESETS[id];
  const domain = url ? siteDomain(url) : "";
  const favicon =
    !preset && domain && !failed
      ? useService
        ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`
        : `https://${domain}/favicon.ico`
      : null;
  const letter = (label.trim()[0] || "?").toUpperCase();
  const color = CUSTOM_COLORS[hash(label) % CUSTOM_COLORS.length];

  useEffect(() => {
    setUseService(false);
    setFailed(false);
  }, [domain]);

  return (
    <span
      className={`brand-tile brand-${id} brand-tile-${size}${
        preset ? "" : " brand-custom"
      }${favicon ? " brand-with-favicon" : ""}${hidden ? " blurred" : ""}`}
      style={preset || favicon ? undefined : { background: color }}
      title={hidden ? undefined : label}
    >
      {preset ??
        (favicon ? (
          <img
            className="brand-favicon"
            src={favicon}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => (useService ? setFailed(true) : setUseService(true))}
          />
        ) : (
          <span className="brand-letter">{letter}</span>
        ))}
    </span>
  );
}
