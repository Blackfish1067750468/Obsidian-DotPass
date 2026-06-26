import {
  DotpassEvaluation,
  DotpassMatcher,
  DotpassRule,
  DotpassScope,
  DotpassSettings,
  DotpassTargetInfo,
  RuleValidationResult,
} from "./types";

const DEFAULT_SCOPE_SPECIFICITY: Record<DotpassScope["type"], number> = {
  path: 500,
  prefix: 400,
  depthRange: 300,
  depth: 250,
  global: 100,
};

export function normalizePath(path: string): string {
  return path
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/^(\.\/)+/, "")
    .replace(/\/+$/, "");
}

export function getNameFromPath(path: string): string {
  const normalized = normalizePath(path);
  const parts = normalized.split("/");
  return parts[parts.length - 1] ?? normalized;
}

export function getDepthFromPath(path: string): number {
  const normalized = normalizePath(path);
  if (!normalized) return 0;
  return normalized.split("/").filter(Boolean).length;
}

export function getExtensionFromPath(path: string): string {
  const name = getNameFromPath(path);
  const index = name.lastIndexOf(".");
  if (index <= 0) return "";
  return name.slice(index);
}

export function createTargetInfo(path: string, target: "file" | "folder"): DotpassTargetInfo {
  const normalized = normalizePath(path);
  return {
    path: normalized,
    name: getNameFromPath(normalized),
    extension: target === "file" ? getExtensionFromPath(normalized) : "",
    depth: getDepthFromPath(normalized),
    target,
  };
}

export function evaluateVisibility(settings: DotpassSettings, info: DotpassTargetInfo): DotpassEvaluation {
  const errors: string[] = [];

  if (!settings.enabled) {
    return { action: "default", matchedRules: [], winningRule: null, errors };
  }

  const matchedRules = settings.rules.filter((rule) => {
    if (!rule.enabled) return false;
    if (rule.target !== "both" && rule.target !== info.target) return false;
    if (!matchesScope(rule.scope, info)) return false;

    try {
      return matchesMatcher(rule.matcher, info);
    } catch (error) {
      errors.push(`${rule.name}: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  });

  if (matchedRules.length === 0) {
    return { action: "default", matchedRules, winningRule: null, errors };
  }

  const sorted = [...matchedRules].sort(compareRules);
  const winningRule = sorted[0] ?? null;

  return {
    action: winningRule?.action ?? "default",
    matchedRules: sorted,
    winningRule,
    errors,
  };
}

export function validateRule(rule: DotpassRule): RuleValidationResult {
  const errors: string[] = [];

  if (!rule.id.trim()) errors.push("Rule id is required.");
  if (!rule.name.trim()) errors.push("Rule name is required.");
  if (!rule.matcher.value.trim()) errors.push("Matcher value is required.");

  if (rule.matcher.type === "regex") {
    try {
      new RegExp(rule.matcher.value);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  if ((rule.scope.type === "path" || rule.scope.type === "prefix") && !rule.scope.path?.trim()) {
    errors.push("Scope path is required.");
  }

  if (rule.scope.type === "depth" && typeof rule.scope.minDepth !== "number") {
    errors.push("Depth is required.");
  }

  if (rule.scope.type === "depthRange") {
    if (typeof rule.scope.minDepth !== "number" || typeof rule.scope.maxDepth !== "number") {
      errors.push("Depth range is required.");
    } else if (rule.scope.minDepth > rule.scope.maxDepth) {
      errors.push("Min depth cannot be greater than max depth.");
    }
  }

  return { valid: errors.length === 0, errors };
}

export function matchesScope(scope: DotpassScope, info: DotpassTargetInfo): boolean {
  switch (scope.type) {
    case "global":
      return true;
    case "path":
      return normalizePath(scope.path ?? "") === info.path;
    case "prefix": {
      const prefix = normalizePath(scope.path ?? "");
      return info.path === prefix || info.path.startsWith(`${prefix}/`);
    }
    case "depth":
      return info.depth === scope.minDepth;
    case "depthRange":
      return info.depth >= (scope.minDepth ?? 0) && info.depth <= (scope.maxDepth ?? Number.MAX_SAFE_INTEGER);
    default:
      return false;
  }
}

export function matchesMatcher(matcher: DotpassMatcher, info: DotpassTargetInfo): boolean {
  const value = matcher.value.trim();

  switch (matcher.type) {
    case "name":
      return info.name === value;
    case "path":
      return info.path === normalizePath(value);
    case "extension":
      return info.target === "file" && info.extension === normalizeExtension(value);
    case "glob":
      return matchesGlob(value, info.path) || matchesGlob(value, info.name);
    case "regex":
      return new RegExp(value).test(info.path) || new RegExp(value).test(info.name);
    default:
      return false;
  }
}

function compareRules(a: DotpassRule, b: DotpassRule): number {
  if (a.priority !== b.priority) return b.priority - a.priority;

  const specificityDelta = getRuleSpecificity(b) - getRuleSpecificity(a);
  if (specificityDelta !== 0) return specificityDelta;

  return b.updatedAt - a.updatedAt;
}

function getRuleSpecificity(rule: DotpassRule): number {
  const scopeScore = DEFAULT_SCOPE_SPECIFICITY[rule.scope.type] ?? 0;
  const matcherScore = rule.matcher.type === "path" ? 80 : rule.matcher.type === "regex" ? 50 : rule.matcher.type === "glob" ? 40 : 20;
  return scopeScore + matcherScore;
}

function normalizeExtension(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith(".") ? trimmed : `.${trimmed}`;
}

function globToRegExp(glob: string): RegExp {
  const normalized = normalizePath(glob);
  let source = "";

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const next = normalized[index + 1];

    if (char === "*" && next === "*") {
      source += ".*";
      index += 1;
    } else if (char === "*") {
      source += "[^/]*";
    } else if (char === "?") {
      source += "[^/]";
    } else {
      source += escapeRegExp(char);
    }
  }

  return new RegExp(`^${source}$`);
}

function matchesGlob(glob: string, value: string): boolean {
  const normalized = normalizePath(glob);
  if (globToRegExp(normalized).test(value)) return true;

  if (normalized.startsWith("**/")) {
    return globToRegExp(normalized.slice(3)).test(value);
  }

  return false;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
