// ─── Provider identifiers ───────────────────────────────────────────
export type ProviderId = "claude" | "codex" | "copilot" | "openrouter" | "opencode";

// ─── Unified session log (from JSONL/CVS) ──────────────────────────
export interface SessionLog {
  source: ProviderId;
  sessionId: string | null;
  projectName: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  reasoningTokens: number;
  cost: number; // actual (from CSV) or estimated (pricing table)
  turnCount: number;
  startedAt: Date | null;
  lastModified: Date;
  gitBranch?: string;
  summary?: string;
}

// ─── Rate-limit / quota windows (from APIs) ────────────────────────
export interface QuotaWindow {
  label: string; // "5h", "weekly", "monthly"
  usedPercent: number; // 0-100
  remainingPercent: number;
  resetsAt: Date | null;
  resetsIn: string; // human-readable
}

export interface QuotaSnapshot {
  provider: ProviderId;
  plan: string;
  windows: QuotaWindow[];
  extraUsage: ExtraBilling | null;
  error: ProviderError | null;
}

export interface ExtraBilling {
  used: number; // dollars
  limit: number; // dollars
  currency: string;
  label?: string; // custom display text
}

// ─── Provider error ─────────────────────────────────────────────────
export interface ProviderError {
  type: "not_configured" | "unauthorized" | "network_error" | "parse_error" | "unsupported_platform" | "unknown";
  message: string;
}

// ─── Auth discovery result ──────────────────────────────────────────
export interface AuthResult {
  token: string | null;
  authType: "oauth" | "api_key" | "cookie" | "env";
  source: string; // path to credential file or "env:VAR"
  extra?: Record<string, string | undefined>; // accountId, workspaceId, etc.
}

// ─── Pricing entry ──────────────────────────────────────────────────
export interface ModelPricing {
  inputPerMTok: number;
  outputPerMTok: number;
  cacheReadPerMTok: number;
  cacheWritePerMTok: number;
  reasoningPerMTok: number;
}

// ─── Dashboard output ───────────────────────────────────────────────
export interface DashboardData {
  quotas: QuotaSnapshot[];
  sessions: SessionLog[]; // from JSONL scan
  summary: DashboardSummary;
}

export interface DashboardSummary {
  totalSessions: number;
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  byProvider: Record<string, { sessions: number; cost: number }>;
  byModel: Record<string, { sessions: number; cost: number }>;
}
