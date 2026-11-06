export type Tab = "home" | "rules" | "monitor" | "settings";

export type RulesSection = "sites" | "domains" | "apps";

export interface RulesFocus {
  section: RulesSection;
  target: string;
  siteKey?: string;
  subdomain?: string;
  token: number;
}
