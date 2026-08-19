// OpenRouter fetcher: credits API + CSV parsing (legacy costkit compat).
import * as fs from "node:fs";
import { httpFetch } from "../../utils/http.js";
import { discoverOpenRouterAuth } from "./auth.js";
import type { SessionLog, ProviderError, QuotaSnapshot, QuotaWindow } from "../../types.js";
import { estimateCost } from "../../pricing.js";

const OPENROUTER_CREDITS_API = "https://openrouter.ai/api/v1/credits";

// ─── Credits/usage API ──────────────────────────────────────────────
interface CreditsResponse {
  data?: {
    total_credits?: number; // total credits purchased (USD)
    total_usage?: number; // total usage (USD)
  };
}

export async function fetchOpenRouterCredits(): Promise<{
  credits: number | null; // remaining credits (USD)
  limit: number | null; // total credits purchased (USD)
  limitRemaining: number | null;
  error: ProviderError | null;
  monthlyUsage?: number; // usage in dollars
}> {
  const auth = await discoverOpenRouterAuth();
  if (!auth.token) {
    return {
      credits: null,
      limit: null,
      limitRemaining: null,
      error: { type: "not_configured", message: "Set OPENROUTER_API_KEY in env" },
    };
  }

  // Fetch account-level credits info
  const { data: creditsData, error: creditsError } = await httpFetch({
    url: OPENROUTER_CREDITS_API,
    token: `Bearer ${auth.token}`,
    timeoutMs: 10_000,
    unauthorizedMessage: "Invalid OpenRouter API key.",
  });

  if (creditsError)
    return { credits: null, limit: null, limitRemaining: null, error: creditsError };

  const cr = creditsData as CreditsResponse;
  const totalCredits = cr.data?.total_credits ?? null;
  const totalUsage = cr.data?.total_usage ?? null;

  const remaining =
    totalCredits !== null && totalUsage !== null ? Math.max(0, totalCredits - totalUsage) : null;

  return {
    credits: remaining,
    limit: totalCredits,
    limitRemaining: remaining,
    error: null,
    monthlyUsage: totalUsage ?? undefined,
  };
}

// ─── CSV parsing (legacy costkit compat) ────────────────────────────
export function parseOpenRouterCsv(filePath: string): {
  sessions: SessionLog[];
  error: string | null;
} {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    if (lines.length < 2) return { sessions: [], error: "CSV file is empty or has no data rows." };

    const header = lines[0];
    const headers = parseCsvLine(header);
    if (headers.length === 0) return { sessions: [], error: "No CSV headers found." };

    const costIdx = headers.indexOf("cost_total");
    const inputIdx = headers.indexOf("tokens_prompt");
    const outputIdx = headers.indexOf("tokens_completion");
    const modelIdx = headers.indexOf("model_permaslug");
    const appIdx = headers.indexOf("app_name");
    const createdAtIdx = headers.indexOf("created_at");
    const reasoningIdx = headers.indexOf("tokens_reasoning");
    const cachedIdx = headers.indexOf("tokens_cached");
    const cancelledIdx = headers.indexOf("cancelled");

    if (costIdx === -1 && inputIdx === -1) {
      return { sessions: [], error: "Missing required columns: cost_total or tokens_prompt" };
    }

    const sessions: SessionLog[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const fields = parseCsvLine(line);
      if (fields.length < headers.length) continue;

      const costTotal = costIdx >= 0 ? parseCsvNumber(fields[costIdx]) : 0;
      const inputTokens = inputIdx >= 0 ? parseCsvNumber(fields[inputIdx]) : 0;
      const outputTokens = outputIdx >= 0 ? parseCsvNumber(fields[outputIdx]) : 0;
      const modelStr = modelIdx >= 0 ? parseCsvField(fields[modelIdx]) : "unknown";
      const appStr = appIdx >= 0 ? parseCsvField(fields[appIdx]) : "unknown";
      const createdAtStr = createdAtIdx >= 0 ? parseCsvField(fields[createdAtIdx]) : "";
      const reasoning = reasoningIdx >= 0 ? parseCsvNumber(fields[reasoningIdx]) : 0;
      const cached = cachedIdx >= 0 ? parseCsvNumber(fields[cachedIdx]) : 0;
      const cancelled = cancelledIdx >= 0 ? parseCsvBool(fields[cancelledIdx]) : false;

      const cost =
        costIdx >= 0
          ? costTotal
          : estimateCost("openrouter", modelStr, {
              inputTokens,
              outputTokens,
              cacheReadTokens: 0,
              cacheCreationTokens: 0,
              reasoningTokens: reasoning,
            });

      if (cancelled) continue;

      sessions.push({
        source: "openrouter",
        sessionId: null,
        projectName: appStr,
        model: modelStr,
        inputTokens,
        outputTokens,
        cacheReadTokens: 0,
        cacheCreationTokens: cached,
        reasoningTokens: reasoning,
        cost,
        turnCount: 1,
        startedAt: createdAtStr ? new Date(createdAtStr) : null,
        lastModified: createdAtStr ? new Date(createdAtStr) : new Date(),
      });
    }

    sessions.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
    return { sessions, error: null };
  } catch (err) {
    return {
      sessions: [],
      error: err instanceof Error ? err.message : "Failed to parse CSV file.",
    };
  }
}

// Simple CSV line parser (handles quoted fields)
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

function parseCsvField(value: string): string {
  return value.trim();
}

function parseCsvNumber(value: string): number {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function parseCsvBool(value: string): boolean {
  const lower = value.trim().toLowerCase();
  return lower === "true" || lower === "1" || lower === "yes";
}

// ─── Quota snapshot from credits API ────────────────────────────────
export function openRouterCreditsToQuota(
  credits: number | null,
  limit: number | null,
  limitRemaining: number | null,
  monthlyUsage?: number,
): QuotaSnapshot {
  const windows: QuotaWindow[] = [];

  if (limit !== null && credits !== null) {
    const used = limit - credits;
    const remainingPct = limit > 0 ? Math.round((credits / limit) * 100) : 100;

    // Bar shows remaining credit at a glance
    windows.push({
      label: "Credits",
      usedPercent: 100 - remainingPct,
      remainingPercent: remainingPct,
      resetsAt: null,
      resetsIn: "",
    });

    return {
      provider: "openrouter",
      plan: "Pay-as-you-go",
      windows,
      extraUsage: {
        used: used,
        limit: limit,
        currency: "USD",
        label: `$${used.toFixed(2)} spent · $${credits.toFixed(2)} remaining`,
      },
      error: null,
    };
  }

  // Fallback: no limit info
  return {
    provider: "openrouter",
    plan: "Pay-as-you-go",
    windows,
    extraUsage:
      monthlyUsage !== undefined
        ? {
            used: monthlyUsage,
            limit: 0,
            currency: "USD",
            label: `$${monthlyUsage.toFixed(2)} spent`,
          }
        : null,
    error: null,
  };
}
