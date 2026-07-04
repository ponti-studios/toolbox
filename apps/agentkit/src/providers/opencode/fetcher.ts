// OpenCode Go fetcher: scrapes the workspace page for Solid.js hydration data.
// Ported from the Raycast Agent Usage extension.
import { httpFetch } from "../../utils/http.js";
import { discoverOpenCodeAuth } from "./auth.js";
import type { OpencodeUsage, OpencodeQuota } from "./types.js";
import type { QuotaSnapshot, QuotaWindow, ProviderError } from "../../types.js";

// ─── HTML parsing types ─────────────────────────────────────────────
interface SolidHydrationData {
  billing?: {
    subscriptionPlan?: string | null;
    balance?: number;
    monthlyLimit?: number;
    monthlyUsage?: number;
  };
  usage?: {
    rollingUsage?: { status: string; resetInSec: number; usagePercent: number };
    weeklyUsage?: { status: string; resetInSec: number; usagePercent: number };
    monthlyUsage?: { status: string; resetInSec: number; usagePercent: number };
  };
}

// ─── Solid.js hydration parser ──────────────────────────────────────
function extractSolidHydrationData(html: string): SolidHydrationData {
  const data: SolidHydrationData = {};

  // Find the Solid.js hydration script
  const scriptMatch = html.match(/<script>self\.\$R=[\s\S]*?<\/script>/);
  if (!scriptMatch) return data;

  const script = scriptMatch[0];

  // Billing data
  const billingMatch = script.match(/customerID:"cus_[^"]+",paymentMethodID:[^}]+paymentMethodLast4:"\d+",balance:\d+/);
  if (billingMatch) {
    const startIdx = script.lastIndexOf("{", script.indexOf(billingMatch[0]));
    const endIdx = script.indexOf("}", script.indexOf(billingMatch[0]) + billingMatch[0].length);
    if (startIdx !== -1 && endIdx !== -1) {
      data.billing = parseBillingData(script.substring(startIdx + 1, endIdx));
    }
  }

  // Usage data
  const usageMatch = script.match(/rollingUsage:\$R\[\d+\]=\{status:"[^"]+",resetInSec:\d+,usagePercent:\d+\}/);
  if (usageMatch) {
    const objStart = script.substring(0, script.indexOf(usageMatch[0])).lastIndexOf("{");
    const objEnd = script.indexOf("}", script.indexOf(usageMatch[0]) + usageMatch[0].length);
    if (objStart !== -1 && objEnd !== -1) {
      data.usage = parseUsageData(script.substring(objStart + 1, objEnd));
    }
  }

  return data;
}

// ─── Billing parser ─────────────────────────────────────────────────
function parseBillingData(str: string): SolidHydrationData["billing"] {
  const billing: NonNullable<SolidHydrationData["billing"]> = {};

  const balance = str.match(/balance:(\d+)/);
  if (balance) billing.balance = Number.parseInt(balance[1], 10);

  const monthlyLimit = str.match(/monthlyLimit:(\d+)/);
  if (monthlyLimit) billing.monthlyLimit = Number.parseInt(monthlyLimit[1], 10);

  const monthlyUsage = str.match(/monthlyUsage:(\d+)/);
  if (monthlyUsage) billing.monthlyUsage = Number.parseInt(monthlyUsage[1], 10);

  const subscriptionPlan = str.match(/subscriptionPlan:([^,]+)/);
  if (subscriptionPlan) {
    const val = subscriptionPlan[1].trim();
    billing.subscriptionPlan = val === "null" ? null : val.replace(/"/g, "");
  }

  return billing;
}

// ─── Usage parser ───────────────────────────────────────────────────
function parseUsageData(str: string): SolidHydrationData["usage"] {
  const usage: NonNullable<SolidHydrationData["usage"]> = {};

  const rollingMatch = str.match(/rollingUsage:\$R\[\d+\]=\{([^}]+)\}/);
  if (rollingMatch) usage.rollingUsage = parseUsageQuota(rollingMatch[1]);

  const weeklyMatch = str.match(/weeklyUsage:\$R\[\d+\]=\{([^}]+)\}/);
  if (weeklyMatch) usage.weeklyUsage = parseUsageQuota(weeklyMatch[1]);

  const monthlyMatch = str.match(/monthlyUsage:\$R\[\d+\]=\{([^}]+)\}/);
  if (monthlyMatch) usage.monthlyUsage = parseUsageQuota(monthlyMatch[1]);

  return usage;
}

function parseUsageQuota(str: string): { status: string; resetInSec: number; usagePercent: number } {
  const status = str.match(/status:"([^"]+)"/)?.[1] || "unknown";
  const resetInSec = Number.parseInt(str.match(/resetInSec:(\d+)/)?.[1] || "0", 10);
  const usagePercent = Number.parseInt(str.match(/usagePercent:(\d+)/)?.[1] || "0", 10);
  return { status, resetInSec, usagePercent };
}

// ─── Build URL ──────────────────────────────────────────────────────
function buildUrl(workspaceId: string): string {
  const id = workspaceId.trim();
  const fullId = id.startsWith("wrk_") ? id : `wrk_${id}`;
  return `https://opencode.ai/workspace/${fullId}/go`;
}

// ─── Main fetch ─────────────────────────────────────────────────────
export async function fetchOpenCodeQuota(): Promise<{
  usage: OpencodeUsage | null;
  error: ProviderError | null;
}> {
  const auth = await discoverOpenCodeAuth();
  if (!auth.token || !auth.extra?.workspaceId) {
    return {
      usage: null,
      error: {
        type: "not_configured",
        message:
          "OpenCode not configured. Set OPENCODE_WORKSPACE_ID and OPENCODE_AUTH_COOKIE.",
      },
    };
  }

  const url = buildUrl(auth.extra.workspaceId);

  const { data, error } = await httpFetch({
    url,
    headers: {
      Cookie: `auth=${auth.token}`,
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    timeoutMs: 15_000,
    unauthorizedMessage: "OpenCode Go session expired.",
  });

  if (error) return { usage: null, error };

  const html = data as string;
  const hydration = extractSolidHydrationData(html);

  const quotas: OpencodeQuota[] = [];
  const primary: OpencodeQuota = { label: "Monthly", used: 0, limit: 100, unit: "%" };

  if (hydration.usage?.rollingUsage) {
    quotas.push({
      label: "Rolling (2h)",
      used: hydration.usage.rollingUsage.usagePercent,
      limit: 100,
      unit: "%",
    });
  }

  if (hydration.usage?.weeklyUsage) {
    quotas.push({
      label: "Weekly",
      used: hydration.usage.weeklyUsage.usagePercent,
      limit: 100,
      unit: "%",
    });
  }

  if (hydration.usage?.monthlyUsage) {
    primary.used = hydration.usage.monthlyUsage.usagePercent;
  }

  if (quotas.length === 0 && primary.used === 0 && !hydration.usage?.monthlyUsage) {
    return {
      usage: null,
      error: { type: "parse_error", message: "No quota data found in OpenCode page." },
    };
  }

  // Determine reset time (furthest out)
  let maxResetSec = 0;
  if (hydration.usage?.monthlyUsage?.resetInSec) maxResetSec = hydration.usage.monthlyUsage.resetInSec;
  if (hydration.usage?.weeklyUsage?.resetInSec && hydration.usage.weeklyUsage.resetInSec > maxResetSec)
    maxResetSec = hydration.usage.weeklyUsage.resetInSec;

  const resetsAt = maxResetSec > 0 ? new Date(Date.now() + maxResetSec * 1000).toISOString() : null;

  return {
    usage: {
      planName: hydration.billing?.subscriptionPlan || "Go",
      primary,
      quotas,
      resetsAt,
    },
    error: null,
  };
}

// ─── Convert to QuotaSnapshot ───────────────────────────────────────
export function opencodeUsageToQuotaSnapshot(usage: OpencodeUsage): QuotaSnapshot {
  const windows: QuotaWindow[] = [];

  if (usage.primary.used > 0 || true) {
    windows.push({
      label: usage.primary.label,
      usedPercent: usage.primary.used,
      remainingPercent: 100 - usage.primary.used,
      resetsAt: usage.resetsAt ? new Date(usage.resetsAt) : null,
      resetsIn: usage.resetsAt || "unknown",
    });
  }

  for (const q of usage.quotas) {
    windows.push({
      label: q.label,
      usedPercent: q.used,
      remainingPercent: 100 - q.used,
      resetsAt: null,
      resetsIn: "rolling",
    });
  }

  return {
    provider: "opencode",
    plan: usage.planName,
    windows,
    extraUsage: null,
    error: null,
  };
}
