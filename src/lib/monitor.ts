import type { ConnectionInfo } from "./api";

export interface ConnectionLogEntry {
  conn: ConnectionInfo;
  firstSeen: number;
  lastSeen: number;
  live: boolean;
  lastFlow: number;
}

export interface HostGroup {
  host: string;
  count: number;
  firstSeen: number;
  lastSeen: number;
  lastFlow: number;
  active: boolean;
  process?: string | null;
  viaProxy: boolean;
  destination: string;
}
