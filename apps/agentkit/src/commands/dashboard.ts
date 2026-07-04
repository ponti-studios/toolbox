// agentkit dashboard: unified quotas + scan view.
import { runQuotas } from "./quotas.js";
import { runScan } from "./scan.js";
import { rule } from "../utils/table.js";

export interface DashboardOptions {
  days?: number;
  providers?: string[];
  skipScan?: boolean;
  json?: boolean;
}

export async function runDashboard(opts: DashboardOptions): Promise<void> {
  if (opts.json) {
    // JSON: run both and merge
    console.error("Dashboard JSON output not yet implemented, use individual commands with --json");
    return;
  }

  console.log(`  ${rule("AgentKit Dashboard")}`);
  console.log();

  // Quotas section
  console.log(`  ${rule("Rate Limits")}`);
  await runQuotas({ json: opts.json });

  if (!opts.skipScan) {
    console.log(`  ${rule("Claude Code Sessions")}`);
    await runScan({ days: opts.days, json: opts.json });
  }
}
