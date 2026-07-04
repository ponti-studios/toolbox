// Claude Code fetcher: calls Anthropic OAuth Usage API.
// Ported from the Raycast Agent Usage extension.
import { httpFetch } from "../../utils/http.js";
import { discoverClaudeAuth } from "./auth.js";
import type { ClaudeUsage, ClaudeRateWindow, ClaudeExtraUsage } from "./types.js";
import type { QuotaSnapshot, QuotaWindow, ProviderError } from "../../types.js";

const CLAUDE_USAGE_API = "https://api.anthropic.com/api/oauth/usage";
const CLAUDE_OAUTH_BETA_HEADER = "oauth-2025-04-20";
const REQUEST_TIMEOUT = 10_000;

// ─── Helpers ────────────────────────────────────────────────────────
function inferPlan(rateLimitTier?: string, subscriptionType?: string): string {
  const tier = (rateLimitTier || "").toLowerCase();
  const subscription = (subscriptionType || "").toLowerCase();

  if (subscription.includes("max")) return "Claude Max";
  if (subscription.includes("pro")) return "Claude Pro";
  if (subscription.includes("team")) return "Claude Team";
  if (subscription.includes("enterprise")) return "Claude Enterprise";

  if (tier.includes("max")) return "Claude Max";
  if (tier.includes("pro")) return "Claude Pro";
  if (tier.includes("team")) return "Claude Team";
  if (tier.includes("enterprise")) return "Claude Enterprise";
  return "Claude";
}

function formatResetsIn(isoTime?: string): string | null {
  if (!isoTime) return null;
  const resetDate = new Date(isoTime);
  if (Number.isNaN(resetDate.getTime())) return null;
  const diffMs = resetDate.getTime() - Date.now();
  if (diffMs <= 0) return "now";
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 60) return `${diffMinutes}m`;
  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;
  if (hours < 24) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

// ─── API response types ─────────────────────────────────────────────
interface OAuthWindow {
  utilization?: number;
  resets_at?: string;
}
interface OAuthExtraUsage {
  is_enabled?: boolean;
  monthly_limit?: number;
  used_credits?: number;
  currency?: string;
}
interface OAuthUsageResponse {
  five_hour?: OAuthWindow;
  seven_day?: OAuthWindow;
  seven_day_sonnet?: OAuthWindow;
  seven_day_opus?: OAuthWindow;
  extra_usage?: OAuthExtraUsage;
}

function windowToQuotaWindow(label: string, w: OAuthWindow): QuotaWindow {
  const used = typeof w.utilization === "number" ? w.utilization : 0;
  return {
    label,
    usedPercent: Math.round(used),
    remainingPercent: clampPercent(100 - used),
    resetsAt: w.resets_at ? new Date(w.resets_at) : null,
    resetsIn: formatResetsIn(w.resets_at) || "unknown",
  };
}

// ─── Main fetch ─────────────────────────────────────────────────────
export async function fetchClaudeQuota(): Promise<{ usage: ClaudeUsage | null; error: ProviderError | null }> {
  const auth = discoverClaudeAuth();
  if (!auth.token) {
    return {
      usage: null,
      error: {
        type: "not_configured",
        message: "Claude CLI not configured. Run 'claude' to authenticate.",
      },
    };
  }

  const result = await httpFetch({
    url: CLAUDE_USAGE_API,
    token: `Bearer ${auth.token}`,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "anthropic-beta": CLAUDE_OAUTH_BETA_HEADER,
    },
    timeoutMs: REQUEST_TIMEOUT,
    unauthorizedMessage: "Claude token expired or invalid. Run 'claude' to re-authenticate.",
  });

  if (result.error) {
    return { usage: null, error: result.error };
  }

  const data = result.data as OAuthUsageResponse;
  const fiveHour = data.five_hour;
  if (!fiveHour || typeof fiveHour.utilization !== "number") {
    return {
      usage: null,
      error: { type: "parse_error", message: "Missing five_hour usage in Claude response." },
    };
  }

  const sevenDay = data.seven_day;
  const sevenDayModel = data.seven_day_sonnet ?? data.seven_day_opus;

  const extra = data.extra_usage;
  const extraUsage: ClaudeExtraUsage | null =
    extra?.is_enabled && typeof extra.monthly_limit === "number" && typeof extra.used_credits === "number"
      ? {
          used: extra.used_credits / 100,
          limit: extra.monthly_limit / 100,
          currency: (extra.currency || "USD").toUpperCase(),
        }
      : null;

  const usage: ClaudeUsage = {
    plan: inferPlan(auth.extra?.tier, auth.extra?.subscription),
    fiveHour: {
      percentageRemaining: clampPercent(100 - fiveHour.utilization),
      resetsIn: formatResetsIn(fiveHour.resets_at),
    },
    sevenDay:
      sevenDay && typeof sevenDay.utilization === "number"
        ? {
            percentageRemaining: clampPercent(100 - sevenDay.utilization),
            resetsIn: formatResetsIn(sevenDay.resets_at),
          }
        : null,
    sevenDayModel:
      sevenDayModel && typeof sevenDayModel.utilization === "number"
        ? {
            percentageRemaining: clampPercent(100 - sevenDayModel.utilization),
            resetsIn: formatResetsIn(sevenDayModel.resets_at),
          }
        : null,
    extraUsage,
  };

  return { usage, error: null };
}

// ─── Convert to QuotaSnapshot ───────────────────────────────────────
export function claudeUsageToQuotaSnapshot(usage: ClaudeUsage): QuotaSnapshot {
  const windows: QuotaWindow[] = [
    {
      label: "5h",
      usedPercent: 100 - usage.fiveHour.percentageRemaining,
      remainingPercent: usage.fiveHour.percentageRemaining,
      resetsAt: null,
      resetsIn: usage.fiveHour.resetsIn || "unknown",
    },
  ];

  if (usage.sevenDay) {
    windows.push({
      label: "7d",
      usedPercent: 100 - usage.sevenDay.percentageRemaining,
      remainingPercent: usage.sevenDay.percentageRemaining,
      resetsAt: null,
      resetsIn: usage.sevenDay.resetsIn || "unknown",
    });
  }

  if (usage.sevenDayModel) {
    windows.push({
      label: "7d Sonnet",
      usedPercent: 100 - usage.sevenDayModel.percentageRemaining,
      remainingPercent: usage.sevenDayModel.percentageRemaining,
      resetsAt: null,
      resetsIn: usage.sevenDayModel.resetsIn || "unknown",
    });
  }

  return {
    provider: "claude",
    plan: usage.plan,
    windows,
    extraUsage: usage.extraUsage
      ? {
          used: usage.extraUsage.used,
          limit: usage.extraUsage.limit,
          currency: usage.extraUsage.currency,
        }
      : null,
    error: null,
  };
}
