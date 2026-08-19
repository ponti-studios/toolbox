// agentkit cost: per-provider cost analysis.
import { parseOpenRouterCsv } from "../providers/openrouter/fetcher.js";
import { scanClaudeProjects } from "../scanner.js";
import { formatCost, formatTokens } from "../format.js";
import { SUBSCRIPTIONS, API_BILLED_PROVIDERS, effectiveCostPerMTok } from "../pricing.js";
import { renderTable, rule, summaryLine } from "../utils/table.js";
import type { SessionLog, ProviderId } from "../types.js";

export interface CostOptions {
  provider?: ProviderId;
  file?: string;
  days?: number;
  json?: boolean;
}

export async function runCost(opts: CostOptions): Promise<void> {
  let sessions: SessionLog[] = [];

  const afterDate = opts.days ? new Date(Date.now() - opts.days * 24 * 60 * 60 * 1000) : undefined;

  // OpenRouter CSV
  if ((!opts.provider || opts.provider === "openrouter") && opts.file) {
    const { sessions: csvSessions, error } = parseOpenRouterCsv(opts.file);
    if (error) process.stderr.write(`CSV parse error: ${error}\n`);
    else sessions = sessions.concat(csvSessions);
  }

  // Claude Code JSONL
  if (!opts.provider || opts.provider === "claude") {
    const claudeSessions = await scanClaudeProjects({ afterDate });
    sessions = sessions.concat(claudeSessions);
  }

  if (opts.provider) {
    sessions = sessions.filter((s) => s.source === opts.provider);
  }

  if (sessions.length === 0) {
    console.log("No data found for the selected provider and time range.");
    return;
  }

  // ── Aggregate ───────────────────────────────────────────────────
  let totalCost = 0;
  let totalInput = 0;
  let totalOutput = 0;
  let totalCacheRead = 0;
  const byModel = new Map<
    string,
    { cost: number; sessions: number; input: number; output: number }
  >();
  const byProject = new Map<string, { cost: number; sessions: number }>();

  for (const s of sessions) {
    totalCost += s.cost;
    totalInput += s.inputTokens;
    totalOutput += s.outputTokens;
    totalCacheRead += s.cacheReadTokens;

    const me = byModel.get(s.model) || { cost: 0, sessions: 0, input: 0, output: 0 };
    me.cost += s.cost;
    me.sessions++;
    me.input += s.inputTokens;
    me.output += s.outputTokens;
    byModel.set(s.model, me);

    const pe = byProject.get(s.projectName) || { cost: 0, sessions: 0 };
    pe.cost += s.cost;
    pe.sessions++;
    byProject.set(s.projectName, pe);
  }

  const avgCostPerReq = sessions.length > 0 ? totalCost / sessions.length : 0;
  const costPerMInput = totalInput > 0 ? (totalCost / totalInput) * 1_000_000 : 0;
  const costPerMOutput = totalOutput > 0 ? (totalCost / totalOutput) * 1_000_000 : 0;

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          summary: {
            totalSessions: sessions.length,
            totalCost: Number(totalCost.toFixed(4)),
            totalInputTokens: totalInput,
            totalOutputTokens: totalOutput,
            totalCacheReadTokens: totalCacheRead,
            avgCostPerRequest: Number(avgCostPerReq.toFixed(4)),
            costPerMInput: Number(costPerMInput.toFixed(2)),
            costPerMOutput: Number(costPerMOutput.toFixed(2)),
          },
          byModel: Object.fromEntries(byModel),
          byProject: Object.fromEntries(byProject),
        },
        null,
        2,
      ),
    );
    return;
  }

  const sourceProvider = opts.provider ?? "claude";
  console.log();

  // ── Summary ─────────────────────────────────────────────────────
  console.log(`  ${rule("Cost Summary")}`);
  console.log(`  ${summaryLine("Sessions", `${sessions.length}`)}`);
  console.log(`  ${summaryLine("Total Cost", formatCost(totalCost))}`);
  console.log(`  ${summaryLine("Input Tokens", formatTokens(totalInput))}`);
  console.log(`  ${summaryLine("Output Tokens", formatTokens(totalOutput))}`);
  console.log(`  ${summaryLine("Cache Read", formatTokens(totalCacheRead))}`);
  console.log(`  ${summaryLine("Avg Cost / Req", formatCost(avgCostPerReq))}`);
  console.log(`  ${summaryLine("$/1M Input", formatCost(costPerMInput))}`);
  console.log(`  ${summaryLine("$/1M Output", formatCost(costPerMOutput))}`);

  // Billing model context
  if (!API_BILLED_PROVIDERS.has(sourceProvider)) {
    const plan = SUBSCRIPTIONS[sourceProvider];
    const rate = effectiveCostPerMTok(sourceProvider, "unknown");
    if (plan) {
      console.log(
        `  ${summaryLine("Billing", `${plan.name} ${formatCost(plan.monthlyCost)}/mo ≈ ${formatCost(rate)}/MTok`)}`,
      );
    }
  } else {
    const rate = effectiveCostPerMTok(sourceProvider, "unknown");
    console.log(`  ${summaryLine("Billing", `Pay-per-token ≈ ${formatCost(rate)}/MTok`)}`);
  }

  console.log();

  // ── By Model ─────────────────────────────────────────────────────
  console.log(`  ${rule("By Model")}`);
  const sortedModels = [...byModel.entries()].sort((a, b) => b[1].cost - a[1].cost);
  const modelRows = sortedModels.map(([model, data]) => ({
    cells: [
      model.slice(0, 30),
      String(data.sessions),
      formatCost(data.cost),
      formatTokens(data.input),
      formatTokens(data.output),
    ],
  }));
  console.log(
    renderTable(
      [
        { label: "Model" },
        { label: "Sessions" },
        { label: "Cost" },
        { label: "Input" },
        { label: "Output" },
      ],
      modelRows,
    ),
  );
  console.log();

  // ── By Project ──────────────────────────────────────────────────
  console.log(`  ${rule("By Project")}`);
  const sortedProjects = [...byProject.entries()].sort((a, b) => b[1].cost - a[1].cost);
  const projectRows = sortedProjects.map(([project, data]) => ({
    cells: [project.slice(0, 30), String(data.sessions), formatCost(data.cost)],
  }));
  console.log(
    renderTable([{ label: "Project" }, { label: "Sessions" }, { label: "Cost" }], projectRows),
  );
  console.log();
}
