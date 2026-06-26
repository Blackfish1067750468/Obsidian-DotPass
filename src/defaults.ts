import { DotpassSettings } from "./types";

export const DOTPASS_SCHEMA_VERSION = 1;

export const DEFAULT_SETTINGS: DotpassSettings = {
  schemaVersion: DOTPASS_SCHEMA_VERSION,
  enabled: false,
  experimentalRevealEnabled: false,
  language: "zh-CN",
  rules: [],
};

export function createRuleId(): string {
  return `rule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
