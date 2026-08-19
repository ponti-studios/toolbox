// Pricing tables (USD per million tokens). Keep in sync with provider docs.
import type { ModelPricing, ProviderId } from "./types.js";

// ─── Subscription plans ─────────────────────────────────────────────
// Effective per-token cost for flat-rate plans. Based on community
// estimates of monthly token budgets for typical heavy users.
export interface SubscriptionPlan {
  name: string;
  monthlyCost: number;
  estimatedMonthlyTokens: number; // total input+output tokens for a heavy user
  effectiveCostPerMTok: number; // monthlyCost / estimatedMonthlyTokens * 1M
}

// Community-sourced estimates (r/ClaudeAI, r/OpenAI, r/GitHubCopilot):
// - Claude Pro: ~40M tokens/month for a heavy coder (doing 15-20 sessions/day)
// - ChatGPT Plus: ~30M tokens/month (GPT-4o + o3-mini, ~60-80 msgs/3h)
// - Copilot: ~10M tokens/month (completions + chat, interaction-count based)
// - Codex: separate API credits, not subscription
export const SUBSCRIPTIONS: Partial<Record<ProviderId, SubscriptionPlan>> = {
  claude: {
    name: "Claude Pro",
    monthlyCost: 20,
    estimatedMonthlyTokens: 40_000_000,
    effectiveCostPerMTok: (20 / 40_000_000) * 1_000_000, // $0.50/MTok
  },
  copilot: {
    name: "GitHub Copilot",
    monthlyCost: 10,
    estimatedMonthlyTokens: 10_000_000,
    effectiveCostPerMTok: (10 / 10_000_000) * 1_000_000, // $1.00/MTok
  },
  codex: {
    name: "ChatGPT Plus",
    monthlyCost: 20,
    estimatedMonthlyTokens: 30_000_000,
    effectiveCostPerMTok: (20 / 30_000_000) * 1_000_000, // $0.67/MTok
  },
};

// Providers that use pay-per-token API billing (not subscription)
export const API_BILLED_PROVIDERS: Set<ProviderId> = new Set(["openrouter"]);

// ─── Anthropic (Claude models) — API pricing ────────────────────────
const CLAUDE_PRICING: Record<string, ModelPricing> = {
  opus: {
    inputPerMTok: 15,
    outputPerMTok: 75,
    cacheReadPerMTok: 3.75,
    cacheWritePerMTok: 18.75,
    reasoningPerMTok: 75,
  },
  sonnet: {
    inputPerMTok: 3,
    outputPerMTok: 15,
    cacheReadPerMTok: 0.3,
    cacheWritePerMTok: 3.75,
    reasoningPerMTok: 15,
  },
  haiku: {
    inputPerMTok: 0.8,
    outputPerMTok: 4,
    cacheReadPerMTok: 0.08,
    cacheWritePerMTok: 1,
    reasoningPerMTok: 4,
  },
};

// ─── OpenAI models (OpenRouter & direct) ────────────────────────────
const OPENAI_PRICING: Record<string, ModelPricing> = {
  "gpt-4o": {
    inputPerMTok: 2.5,
    outputPerMTok: 10,
    cacheReadPerMTok: 1.25,
    cacheWritePerMTok: 2.5,
    reasoningPerMTok: 10,
  },
  "gpt-4o-mini": {
    inputPerMTok: 0.15,
    outputPerMTok: 0.6,
    cacheReadPerMTok: 0.075,
    cacheWritePerMTok: 0.15,
    reasoningPerMTok: 0.6,
  },
  "gpt-4.1": {
    inputPerMTok: 2,
    outputPerMTok: 8,
    cacheReadPerMTok: 0.5,
    cacheWritePerMTok: 2,
    reasoningPerMTok: 8,
  },
  "gpt-4.1-mini": {
    inputPerMTok: 0.4,
    outputPerMTok: 1.6,
    cacheReadPerMTok: 0.1,
    cacheWritePerMTok: 0.4,
    reasoningPerMTok: 1.6,
  },
  "gpt-4.1-nano": {
    inputPerMTok: 0.1,
    outputPerMTok: 0.4,
    cacheReadPerMTok: 0.025,
    cacheWritePerMTok: 0.1,
    reasoningPerMTok: 0.4,
  },
  "o4-mini": {
    inputPerMTok: 1.1,
    outputPerMTok: 4.4,
    cacheReadPerMTok: 0.275,
    cacheWritePerMTok: 1.1,
    reasoningPerMTok: 4.4,
  },
  o3: {
    inputPerMTok: 10,
    outputPerMTok: 40,
    cacheReadPerMTok: 2.5,
    cacheWritePerMTok: 10,
    reasoningPerMTok: 40,
  },
  "o3-mini": {
    inputPerMTok: 1.1,
    outputPerMTok: 4.4,
    cacheReadPerMTok: 0.275,
    cacheWritePerMTok: 1.1,
    reasoningPerMTok: 4.4,
  },
};

// ─── Default pricing (used when model is unknown) ───────────────────
const DEFAULT_PRICING: ModelPricing = CLAUDE_PRICING.sonnet;

// ─── Resolver ───────────────────────────────────────────────────────
export function resolveModelPricing(modelName: string): ModelPricing {
  const lower = modelName.toLowerCase();

  // Claude models
  if (lower.includes("opus")) return CLAUDE_PRICING.opus;
  if (lower.includes("haiku")) return CLAUDE_PRICING.haiku;
  if (lower.includes("sonnet") || lower.includes("claude")) return CLAUDE_PRICING.sonnet;

  // OpenAI models (fuzzy match)
  if (lower.includes("gpt-4.1-nano")) return OPENAI_PRICING["gpt-4.1-nano"];
  if (lower.includes("gpt-4.1-mini")) return OPENAI_PRICING["gpt-4.1-mini"];
  if (lower.includes("gpt-4.1")) return OPENAI_PRICING["gpt-4.1"];
  if (lower.includes("gpt-4o-mini")) return OPENAI_PRICING["gpt-4o-mini"];
  if (lower.includes("gpt-4o")) return OPENAI_PRICING["gpt-4o"];
  if (lower.includes("o4-mini")) return OPENAI_PRICING["o4-mini"];
  if (lower.includes("o3-mini")) return OPENAI_PRICING["o3-mini"];
  if (lower.includes("o3")) return OPENAI_PRICING.o3;
  if (lower.includes("gpt-4") || lower.includes("openai")) return OPENAI_PRICING["gpt-4o"];

  // Common OpenRouter model slugs
  if (lower.includes("gemini")) {
    return {
      inputPerMTok: 0,
      outputPerMTok: 0,
      cacheReadPerMTok: 0,
      cacheWritePerMTok: 0,
      reasoningPerMTok: 0,
    };
  }

  return DEFAULT_PRICING;
}

// ─── Cost calculation ───────────────────────────────────────────────
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  reasoningTokens: number;
}

/** Calculate cost using API per-token pricing (OpenRouter, direct API). */
export function estimateApiCost(model: string, usage: TokenUsage): number {
  const p = resolveModelPricing(model);
  const input = (usage.inputTokens / 1_000_000) * p.inputPerMTok;
  const output = (usage.outputTokens / 1_000_000) * p.outputPerMTok;
  const cacheRead = (usage.cacheReadTokens / 1_000_000) * p.cacheReadPerMTok;
  const cacheWrite = (usage.cacheCreationTokens / 1_000_000) * p.cacheWritePerMTok;
  const reasoning = (usage.reasoningTokens / 1_000_000) * p.reasoningPerMTok;
  return input + output + cacheRead + cacheWrite + reasoning;
}

/** Calculate cost using subscription amortization (Claude Pro, ChatGPT Plus, Copilot).
 *  Only prices charged tokens (excludes cache reads, which are free). */
export function estimateSubscriptionCost(provider: ProviderId, usage: TokenUsage): number {
  const plan = SUBSCRIPTIONS[provider];
  if (!plan) return estimateApiCost("unknown", usage);
  // Cache reads are free — only count input, output, cache writes, reasoning
  const chargedTokens =
    usage.inputTokens + usage.outputTokens + usage.cacheCreationTokens + usage.reasoningTokens;
  return (chargedTokens / 1_000_000) * plan.effectiveCostPerMTok;
}

/** Smart cost estimate: uses subscription pricing for flat-rate providers, API pricing for pay-per-token. */
export function estimateCost(provider: ProviderId, model: string, usage: TokenUsage): number {
  if (API_BILLED_PROVIDERS.has(provider)) {
    return estimateApiCost(model, usage);
  }
  return estimateSubscriptionCost(provider, usage);
}

/** Return the effective per-MTok rate for a provider (subscription or API). */
export function effectiveCostPerMTok(provider: ProviderId, model: string): number {
  const plan = SUBSCRIPTIONS[provider];
  if (plan) return plan.effectiveCostPerMTok;
  const p = resolveModelPricing(model);
  // Blended: assume 3:1 input:output ratio for display
  return p.inputPerMTok * 0.75 + p.outputPerMTok * 0.25;
}
