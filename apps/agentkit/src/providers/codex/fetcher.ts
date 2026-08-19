// Codex fetcher: calls OpenAI Wham usage API.
// Ported from the Raycast Agent Usage extension.
import { httpFetch } from "../../utils/http.js";
import { discoverCodexAuth } from "./auth.js";
import type { CodexUsage } from "./types.js";
import type { QuotaSnapshot, QuotaWindow, ProviderError } from "../../types.js";

const CODEX_USAGE_API = "https://chatgpt.com/backend-api/wham/usage";
const CODEX_RESET_CREDITS_API = "https://chatgpt.com/backend-api/wham/rate-limit-reset-credits";

const CODEX_HEADERS = {
  Accept: "application/json",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

const CODEX_PLAN_NAMES: Record<string, string> = {
  pro: "Pro 20x",
  prolite: "Pro 5x",
  team: "Team",
};

// ─── API response types ─────────────────────────────────────────────
interface CodexApiResponse {
  plan_type?: string;
  rate_limit?: {
    primary_window?: {
      used_percent: number;
      limit_window_seconds: number;
      reset_after_seconds?: number;
      reset_at?: number;
    };
    secondary_window?: {
      used_percent: number;
      limit_window_seconds: number;
      reset_after_seconds?: number;
      reset_at?: number;
    };
  };
  code_review_rate_limit?: {
    primary_window?: {
      used_percent: number;
      limit_window_seconds: number;
      reset_after_seconds?: number;
      reset_at?: number;
    };
  };
  credits?: {
    has_credits: boolean;
    unlimited: boolean;
    balance: string;
  };
}

function formatCodexPlan(planType?: string): string {
  const normalized = planType?.trim().toLowerCase();
  return normalized ? (CODEX_PLAN_NAMES[normalized] ?? planType?.trim() ?? "Unknown") : "Unknown";
}

function getResetsInSeconds(window: { reset_after_seconds?: number; reset_at?: number }): number {
  if (typeof window.reset_after_seconds === "number") {
    return Math.max(0, Math.floor(window.reset_after_seconds));
  }
  if (typeof window.reset_at === "number") {
    const resetAt = new Date(window.reset_at);
    return Math.max(0, Math.floor((resetAt.getTime() - Date.now()) / 1000));
  }
  return 0;
}

function formatResetsIn(seconds: number): string {
  if (seconds <= 0) return "now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

// ─── Main fetch ─────────────────────────────────────────────────────
export async function fetchCodexQuota(): Promise<{
  usage: CodexUsage | null;
  error: ProviderError | null;
}> {
  const auth = discoverCodexAuth();
  if (!auth.token) {
    return {
      usage: null,
      error: {
        type: "not_configured",
        message: "Codex is not configured. Run 'codex login' to authenticate.",
      },
    };
  }

  const headers: Record<string, string> = { ...CODEX_HEADERS };
  if (auth.extra?.accountId) {
    headers["ChatGPT-Account-ID"] = auth.extra.accountId;
  }

  // First: usage API
  const { data, error } = await httpFetch({
    url: CODEX_USAGE_API,
    token: `Bearer ${auth.token}`,
    headers,
    timeoutMs: 10_000,
    unauthorizedMessage: "Authorization token expired or invalid. Run 'codex login' to refresh.",
  });

  if (error) return { usage: null, error };

  const response = data as CodexApiResponse;
  const primaryWindow = response.rate_limit?.primary_window;
  const secondaryWindow = response.rate_limit?.secondary_window;

  if (!primaryWindow || !secondaryWindow) {
    return {
      usage: null,
      error: { type: "parse_error", message: "Missing rate limit data in API response." },
    };
  }

  let resetCredits: CodexUsage["resetCredits"] | undefined;

  // Try reset credits API (non-critical)
  const rcHeaders: Record<string, string> = {
    ...CODEX_HEADERS,
    ...(auth.extra?.accountId ? { "ChatGPT-Account-ID": auth.extra.accountId } : {}),
    "OpenAI-Beta": "codex-1",
    originator: "Codex Desktop",
  };

  const rcResult = await httpFetch({
    url: CODEX_RESET_CREDITS_API,
    token: `Bearer ${auth.token}`,
    headers: rcHeaders,
    timeoutMs: 4000,
    unauthorizedMessage: "",
  });

  if (!rcResult.error && rcResult.data && typeof rcResult.data === "object") {
    const rc = rcResult.data as {
      available_count?: number;
      credits?: Array<{ status?: string; expires_at?: string | null }>;
    };
    if (typeof rc.available_count === "number" && rc.available_count >= 0) {
      const now = Date.now();
      const expiresAtList = (rc.credits ?? [])
        .filter((c) => c.status === "available" && typeof c.expires_at === "string")
        .map((c) => c.expires_at as string)
        .filter((exp: string) => {
          const ts = Date.parse(exp);
          return Number.isFinite(ts) && ts > now;
        })
        .sort();
      resetCredits = { availableCount: rc.available_count, expiresAtList };
    }
  }

  const usage: CodexUsage = {
    account: formatCodexPlan(response.plan_type),
    fiveHourLimit: {
      percentageRemaining: 100 - primaryWindow.used_percent,
      resetsInSeconds: getResetsInSeconds(primaryWindow),
      limitWindowSeconds: primaryWindow.limit_window_seconds,
    },
    weeklyLimit: {
      percentageRemaining: 100 - secondaryWindow.used_percent,
      resetsInSeconds: getResetsInSeconds(secondaryWindow),
      limitWindowSeconds: secondaryWindow.limit_window_seconds,
    },
    credits: {
      hasCredits: response.credits?.has_credits || false,
      unlimited: response.credits?.unlimited || false,
      balance: response.credits?.balance || "0",
    },
    resetCredits,
  };

  if (response.code_review_rate_limit?.primary_window) {
    const rw = response.code_review_rate_limit.primary_window;
    usage.codeReviewLimit = {
      percentageRemaining: 100 - rw.used_percent,
      resetsInSeconds: getResetsInSeconds(rw),
      limitWindowSeconds: rw.limit_window_seconds,
    };
  }

  return { usage, error: null };
}

// ─── Convert to QuotaSnapshot ───────────────────────────────────────
export function codexUsageToQuotaSnapshot(usage: CodexUsage): QuotaSnapshot {
  const windows: QuotaWindow[] = [
    {
      label: "5h",
      usedPercent: 100 - usage.fiveHourLimit.percentageRemaining,
      remainingPercent: usage.fiveHourLimit.percentageRemaining,
      resetsAt: null,
      resetsIn: formatResetsIn(usage.fiveHourLimit.resetsInSeconds),
    },
    {
      label: "7d",
      usedPercent: 100 - usage.weeklyLimit.percentageRemaining,
      remainingPercent: usage.weeklyLimit.percentageRemaining,
      resetsAt: null,
      resetsIn: formatResetsIn(usage.weeklyLimit.resetsInSeconds),
    },
  ];

  const balance = Number.parseFloat(usage.credits.balance);
  const extraUsage =
    !Number.isNaN(balance) && !usage.credits.unlimited
      ? { used: 0, limit: balance, currency: "USD" }
      : null;

  return {
    provider: "codex",
    plan: usage.account,
    windows,
    extraUsage,
    error: null,
  };
}
