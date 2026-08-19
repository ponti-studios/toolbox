// agentkit quotas: show rate-limit windows across all providers.
import { fetchClaudeQuota, claudeUsageToQuotaSnapshot } from "../providers/claude/fetcher.js";
import { fetchCodexQuota, codexUsageToQuotaSnapshot } from "../providers/codex/fetcher.js";
import { fetchCopilotQuota, copilotUsageToQuotaSnapshot } from "../providers/copilot/fetcher.js";
import {
  fetchOpenRouterCredits,
  openRouterCreditsToQuota,
} from "../providers/openrouter/fetcher.js";
import { fetchOpenCodeQuota, opencodeUsageToQuotaSnapshot } from "../providers/opencode/fetcher.js";
import { asciiBar, formatCost } from "../format.js";
import { SUBSCRIPTIONS, API_BILLED_PROVIDERS, effectiveCostPerMTok } from "../pricing.js";
import { renderTable } from "../utils/table.js";
import type { QuotaSnapshot, ProviderId } from "../types.js";

export interface QuotasOptions {
  providers?: ProviderId[];
  json?: boolean;
}

const PROVIDER_SETUP: Record<ProviderId, { name: string; setup: string }> = {
  claude: { name: "Claude Code", setup: "auto-detected from ~/.claude/.credentials.json" },
  codex: { name: "Codex", setup: "auto-detected from ~/.codex/auth.json" },
  copilot: { name: "Copilot", setup: "set GH_TOKEN or GITHUB_TOKEN in env" },
  openrouter: { name: "OpenRouter", setup: "set OPENROUTER_API_KEY in env" },
  opencode: {
    name: "OpenCode",
    setup: "set OPENCODE_WORKSPACE_ID and OPENCODE_AUTH_COOKIE in env",
  },
};

async function fetchProvider(provider: ProviderId): Promise<QuotaSnapshot | null> {
  const meta = PROVIDER_SETUP[provider];

  switch (provider) {
    case "claude": {
      const { usage, error } = await fetchClaudeQuota();
      if (usage) return claudeUsageToQuotaSnapshot(usage);
      if (error) {
        return {
          provider: "claude",
          plan: "—",
          windows: [],
          extraUsage: null,
          error:
            error.type === "not_configured"
              ? { type: "not_configured" as const, message: meta.setup }
              : error,
        };
      }
      return {
        provider: "claude",
        plan: "—",
        windows: [],
        extraUsage: null,
        error: { type: "not_configured" as const, message: meta.setup },
      };
    }
    case "codex": {
      const { usage, error } = await fetchCodexQuota();
      if (usage) return codexUsageToQuotaSnapshot(usage);
      if (error) {
        return {
          provider: "codex",
          plan: "—",
          windows: [],
          extraUsage: null,
          error:
            error.type === "not_configured"
              ? { type: "not_configured" as const, message: meta.setup }
              : error,
        };
      }
      return {
        provider: "codex",
        plan: "—",
        windows: [],
        extraUsage: null,
        error: { type: "not_configured" as const, message: meta.setup },
      };
    }
    case "copilot": {
      const { usage, error } = await fetchCopilotQuota();
      if (usage) return copilotUsageToQuotaSnapshot(usage);
      if (error) {
        return {
          provider: "copilot",
          plan: "—",
          windows: [],
          extraUsage: null,
          error:
            error.type === "not_configured"
              ? { type: "not_configured" as const, message: meta.setup }
              : error,
        };
      }
      return {
        provider: "copilot",
        plan: "—",
        windows: [],
        extraUsage: null,
        error: { type: "not_configured" as const, message: meta.setup },
      };
    }
    case "openrouter": {
      const { credits, limit, limitRemaining, monthlyUsage, error } =
        await fetchOpenRouterCredits();
      if (credits !== null || limit !== null || monthlyUsage !== undefined) {
        return openRouterCreditsToQuota(credits, limit, limitRemaining, monthlyUsage);
      }
      if (error) {
        return {
          provider: "openrouter",
          plan: "—",
          windows: [],
          extraUsage: null,
          error:
            error.type === "not_configured"
              ? { type: "not_configured" as const, message: meta.setup }
              : error,
        };
      }
      return {
        provider: "openrouter",
        plan: "—",
        windows: [],
        extraUsage: null,
        error: { type: "not_configured" as const, message: meta.setup },
      };
    }
    case "opencode": {
      const { usage, error } = await fetchOpenCodeQuota();
      if (usage) return opencodeUsageToQuotaSnapshot(usage);
      if (error) {
        return {
          provider: "opencode",
          plan: "—",
          windows: [],
          extraUsage: null,
          error:
            error.type === "not_configured"
              ? { type: "not_configured" as const, message: meta.setup }
              : error,
        };
      }
      return {
        provider: "opencode",
        plan: "—",
        windows: [],
        extraUsage: null,
        error: { type: "not_configured" as const, message: meta.setup },
      };
    }
  }
}

export async function runQuotas(opts: QuotasOptions = {}): Promise<void> {
  const enabled =
    opts.providers ?? (["claude", "codex", "copilot", "openrouter", "opencode"] as ProviderId[]);

  process.stderr.write("Fetching quotas...\n");

  const snapshots: (QuotaSnapshot | null)[] = [];
  for (const provider of enabled) {
    snapshots.push(await fetchProvider(provider));
  }

  if (opts.json) {
    console.log(JSON.stringify(snapshots, null, 2));
    return;
  }

  const rows: { cells: string[] }[] = [];

  for (const snap of snapshots) {
    if (!snap) continue;
    const meta = PROVIDER_SETUP[snap.provider];
    const name = meta.name;
    const plan = snap.plan;
    const subPlan = SUBSCRIPTIONS[snap.provider];
    const rate = effectiveCostPerMTok(snap.provider, "unknown");
    const billingLabel = API_BILLED_PROVIDERS.has(snap.provider)
      ? `API ${formatCost(rate)}/MTok`
      : subPlan
        ? `sub ${formatCost(rate)}/MTok`
        : "";

    if (snap.error) {
      const shortMsg =
        snap.error.type === "not_configured" ? snap.error.message : `⚠ ${snap.error.message}`;
      rows.push({ cells: [name, plan, "", "", shortMsg] });
      continue;
    }

    // Build sub-rows for each quota window + extra billing
    const subRows: { quota: string; remaining: string; info: string }[] = [];

    for (const w of snap.windows) {
      const bar = asciiBar(w.remainingPercent, 8);
      subRows.push({
        quota: bar,
        remaining: `${String(w.remainingPercent).padStart(3)}% ${w.label}`,
        info: w.resetsIn ? `resets ${w.resetsIn}` : "",
      });
    }

    if (snap.extraUsage) {
      const quotaText = snap.extraUsage.label
        ? `💰 ${snap.extraUsage.label}`
        : `💰 ${formatCost(snap.extraUsage.used)} / ${formatCost(snap.extraUsage.limit)} ${snap.extraUsage.currency}`;
      subRows.push({
        quota: quotaText,
        remaining: "",
        info: "",
      });
    }

    if (subRows.length === 0) {
      rows.push({ cells: [name, plan, "", "", billingLabel] });
    } else {
      for (let i = 0; i < subRows.length; i++) {
        const sr = subRows[i];
        const infoCell = i === 0 ? [sr.info, billingLabel].filter(Boolean).join(" · ") : sr.info;
        rows.push({
          cells: [i === 0 ? name : "", i === 0 ? plan : "", sr.quota, sr.remaining, infoCell],
        });
      }
    }
  }

  console.log(
    renderTable(
      [
        { label: "Provider" },
        { label: "Plan" },
        { label: "Quota" },
        { label: "Remaining" },
        { label: "Billing / Info" },
      ],
      rows,
    ),
  );
  console.log();
}
