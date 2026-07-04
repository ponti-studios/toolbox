// agentkit scan: parse Claude Code JSONL files for session-level token data.
import { scanClaudeProjects } from "../scanner.js";
import { formatCost, formatTokens, formatRelativeTime } from "../format.js";
import { effectiveCostPerMTok, SUBSCRIPTIONS } from "../pricing.js";
import { renderTable, rule, summaryLine } from "../utils/table.js";
import type { SessionLog } from "../types.js";

export interface ScanOptions {
  days?: number;
  limit?: number;
  json?: boolean;
}

export async function runScan(opts: ScanOptions): Promise<void> {
  const afterDate = opts.days
    ? new Date(Date.now() - opts.days * 24 * 60 * 60 * 1000)
    : undefined;

  process.stderr.write("Scanning ~/.claude/projects/ for session files...\n");
  const sessions = await scanClaudeProjects({ afterDate, limit: opts.limit });

  if (sessions.length === 0) {
    console.log("No Claude Code sessions found.");
    return;
  }

  if (opts.json) {
    console.log(JSON.stringify(sessions, null, 2));
    return;
  }

  // ── Summary header ──────────────────────────────────────────────
  const totalCost = sessions.reduce((sum, s) => sum + s.cost, 0);
  const totalInput = sessions.reduce((sum, s) => sum + s.inputTokens, 0);
  const totalOutput = sessions.reduce((sum, s) => sum + s.outputTokens, 0);
  const totalSessions = sessions.length;
  const plan = SUBSCRIPTIONS.claude!;
  const effectiveRate = effectiveCostPerMTok("claude", "unknown");
  const totalCacheWrites = sessions.reduce((s, sess) => s + sess.cacheCreationTokens, 0);
  const projectedMonthly = (totalInput + totalOutput) * 4.3;
  const subUtil = Math.round((projectedMonthly / plan.estimatedMonthlyTokens) * 100);
  const budgetLabel = subUtil > 100
    ? `~${(subUtil / 100).toFixed(1)}× typical ${plan.name} user`
    : `${subUtil}% of ${plan.name} budget`;

  console.log();
  console.log(`  ${formatCost(totalCost)}  ·  ${formatTokens(totalInput)} in  ·  ${formatTokens(totalOutput)} out  ·  ${totalSessions} sessions`);
  console.log(`  sub ${formatCost(effectiveRate)}/MTok  ·  projected ${formatTokens(projectedMonthly)}/mo  ·  ${budgetLabel}`);
  console.log();

  // ── Sessions table ──────────────────────────────────────────────
  const rows = sessions.map((s) => ({
    cells: [
      s.model.slice(0, 28),
      s.projectName.slice(0, 20),
      `↑${formatTokens(s.inputTokens)}`,
      `↓${formatTokens(s.outputTokens)}`,
      formatCost(s.cost),
      `${s.turnCount}t`,
      formatRelativeTime(s.lastModified.getTime()),
    ],
  }));

  console.log(
    renderTable(
      [
        { label: "Model" },
        { label: "Project" },
        { label: "Input" },
        { label: "Output" },
        { label: "Cost" },
        { label: "Turns" },
        { label: "When" },
      ],
      rows,
    ),
  );
  console.log();
}
