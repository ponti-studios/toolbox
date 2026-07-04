// Copilot fetcher: calls GitHub Copilot internal API.
// Ported from the Raycast Agent Usage extension.
import { httpFetch } from "../../utils/http.js";
import { discoverCopilotAuth } from "./auth.js";
import type { CopilotUsage } from "./types.js";
import type { QuotaSnapshot, QuotaWindow, ProviderError } from "../../types.js";

const COPILOT_USAGE_API = "https://api.github.com/copilot_internal/user";

// ─── API response types ─────────────────────────────────────────────
interface CopilotQuotaSnapshot {
  percent_remaining?: number | string;
  entitlement?: number | string;
  remaining?: number | string;
}
interface CopilotResponse {
  copilot_plan?: string;
  quota_reset_date?: string;
  quota_snapshots?: {
    premium_interactions?: CopilotQuotaSnapshot;
    chat?: CopilotQuotaSnapshot;
  };
  monthly_quotas?: {
    completions?: number | string;
    chat?: number | string;
  };
  limited_user_quotas?: {
    completions?: number | string;
    chat?: number | string;
  };
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function formatPlan(plan: string | undefined): string {
  const normalized = (plan || "Unknown").trim();
  if (!normalized) return "Unknown";
  return normalized
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function getPercentRemaining(snapshot?: CopilotQuotaSnapshot): number | null {
  if (!snapshot) return null;
  const direct = toNumber(snapshot.percent_remaining);
  if (direct !== null) return clampPercent(direct);
  const entitlement = toNumber(snapshot.entitlement);
  const remaining = toNumber(snapshot.remaining);
  if (entitlement && entitlement > 0 && remaining !== null) {
    return clampPercent((remaining / entitlement) * 100);
  }
  return null;
}

// ─── Main fetch ─────────────────────────────────────────────────────
export async function fetchCopilotQuota(): Promise<{ usage: CopilotUsage | null; error: ProviderError | null }> {
  const auth = await discoverCopilotAuth();
  if (!auth.token) {
    return {
      usage: null,
      error: {
        type: "not_configured",
        message: "Copilot is not configured. Set GH_TOKEN or GITHUB_TOKEN.",
      },
    };
  }

  const { data, error } = await httpFetch({
    url: COPILOT_USAGE_API,
    token: `token ${auth.token}`,
    headers: {
      Accept: "application/json",
      "Editor-Version": "vscode/1.96.2",
      "Editor-Plugin-Version": "copilot-chat/0.26.7",
      "User-Agent": "GitHubCopilotChat/0.26.7",
      "X-Github-Api-Version": "2025-04-01",
    },
    timeoutMs: 10_000,
    unauthorizedMessage: "Copilot token expired or invalid.",
  });

  if (error) return { usage: null, error };

  const response = data as CopilotResponse;
  const premiumRemaining = getPercentRemaining(response.quota_snapshots?.premium_interactions);
  const chatRemaining = getPercentRemaining(response.quota_snapshots?.chat);

  if (premiumRemaining === null && chatRemaining === null) {
    return {
      usage: null,
      error: {
        type: "parse_error",
        message: "Copilot usage response does not contain usable quota data.",
      },
    };
  }

  return {
    usage: {
      plan: formatPlan(response.copilot_plan),
      premiumRemaining,
      chatRemaining,
      quotaResetDate: response.quota_reset_date || null,
    },
    error: null,
  };
}

// ─── Convert to QuotaSnapshot ───────────────────────────────────────
export function copilotUsageToQuotaSnapshot(usage: CopilotUsage): QuotaSnapshot {
  const windows: QuotaWindow[] = [];

  if (usage.premiumRemaining !== null) {
    windows.push({
      label: "Premium",
      usedPercent: 100 - usage.premiumRemaining,
      remainingPercent: usage.premiumRemaining,
      resetsAt: usage.quotaResetDate ? new Date(usage.quotaResetDate) : null,
      resetsIn: usage.quotaResetDate || "unknown",
    });
  }

  if (usage.chatRemaining !== null) {
    windows.push({
      label: "Chat",
      usedPercent: 100 - usage.chatRemaining,
      remainingPercent: usage.chatRemaining,
      resetsAt: usage.quotaResetDate ? new Date(usage.quotaResetDate) : null,
      resetsIn: usage.quotaResetDate || "unknown",
    });
  }

  return {
    provider: "copilot",
    plan: usage.plan,
    windows,
    extraUsage: null,
    error: null,
  };
}
