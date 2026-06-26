export type DotpassLanguage = "zh-CN" | "zh-TW" | "en" | "ja" | "ko" | "es";

export type DotpassTarget = "file" | "folder" | "both";

export type DotpassAction = "show" | "hide";
export type DotpassInputMode = "expression" | "options";
export type DotpassOptionRange = "all" | "under" | "depth" | "depthAtLeast" | "depthAtMost" | "depthRange" | "object";
export type DotpassOptionMatch = "name" | "extension" | "object";

export type DotpassScopeType = "global" | "path" | "prefix" | "depth" | "depthRange";

export type DotpassMatcherType = "name" | "path" | "extension" | "glob" | "regex";

export interface DotpassScope {
  type: DotpassScopeType;
  path?: string;
  minDepth?: number;
  maxDepth?: number;
}

export interface DotpassMatcher {
  type: DotpassMatcherType;
  value: string;
}

export interface DotpassRule {
  id: string;
  name: string;
  enabled: boolean;
  target: DotpassTarget;
  action: DotpassAction;
  scope: DotpassScope;
  matcher: DotpassMatcher;
  inputMode?: DotpassInputMode;
  optionRange?: DotpassOptionRange;
  optionMatch?: DotpassOptionMatch;
  expression?: string;
  follow?: DotpassFollow;
  priority: number;
  description?: string;
  updatedAt: number;
}

export interface DotpassFollow {
  enabled: boolean;
  mode: "selectedItem";
  originalPath?: string;
  currentPath?: string;
  targetKind?: "file" | "folder";
  identityHint?: DotpassIdentityHint;
  lastResolvedAt?: number;
}

export interface DotpassIdentityHint {
  name: string;
  extension?: string;
  size?: number;
  ctime?: number;
  mtime?: number;
}

export interface DotpassSettings {
  schemaVersion: number;
  enabled: boolean;
  experimentalRevealEnabled: boolean;
  language: DotpassLanguage;
  rules: DotpassRule[];
}

export interface DotpassTargetInfo {
  path: string;
  name: string;
  extension: string;
  depth: number;
  target: Exclude<DotpassTarget, "both">;
}

export interface DotpassEvaluation {
  action: DotpassAction | "default";
  matchedRules: DotpassRule[];
  winningRule: DotpassRule | null;
  errors: string[];
}

export interface RuleValidationResult {
  valid: boolean;
  errors: string[];
}
