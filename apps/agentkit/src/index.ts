#!/usr/bin/env node
// agentkit — unified AI agent usage & cost CLI
import { Command } from "commander";
import { runScan } from "./commands/scan.js";
import { runQuotas } from "./commands/quotas.js";
import { runDashboard } from "./commands/dashboard.js";
import { runCost } from "./commands/cost.js";
import type { ProviderId } from "./types.js";

const VALID_PROVIDERS: ProviderId[] = ["claude", "codex", "copilot", "openrouter", "opencode"];

const program = new Command();

program.name("agentkit").description("Unified AI agent usage & cost CLI").version("0.1.0");

// ─── scan ───────────────────────────────────────────────────────────
program
  .command("scan")
  .description("Scan Claude Code JSONL files for session-level token data")
  .option("-d, --days <number>", "Only show sessions from the last N days", parseInt)
  .option("-l, --limit <number>", "Max sessions to show", parseInt)
  .option("--json", "Output as JSON")
  .action(async (opts) => {
    await runScan({
      days: opts.days,
      limit: opts.limit ?? 100,
      json: opts.json,
    });
  });

// ─── quotas ─────────────────────────────────────────────────────────
program
  .command("quotas")
  .description("Show rate-limit quotas across all AI providers")
  .option(
    "-p, --provider <providers>",
    "Comma-separated providers (claude,codex,copilot,openrouter,opencode)",
  )
  .option("--json", "Output as JSON")
  .action(async (opts) => {
    const providers = opts.provider
      ? (opts.provider
          .split(",")
          .filter((p: string) => VALID_PROVIDERS.includes(p as ProviderId)) as ProviderId[])
      : undefined;

    await runQuotas({ providers, json: opts.json });
  });

// ─── dashboard ──────────────────────────────────────────────────────
program
  .command("dashboard")
  .description("Unified dashboard: quotas + Claude Code session scan")
  .option("-d, --days <number>", "Only show sessions from the last N days", parseInt)
  .option("--skip-scan", "Skip Claude Code session scan")
  .option("--json", "Output as JSON")
  .action(async (opts) => {
    await runDashboard({
      days: opts.days,
      skipScan: opts.skipScan,
      json: opts.json,
    });
  });

// ─── cost ───────────────────────────────────────────────────────────
program
  .command("cost")
  .description("Cost analysis per provider and model")
  .option(
    "-p, --provider <provider>",
    "Filter to one provider (claude, codex, copilot, openrouter, opencode)",
  )
  .option("-f, --file <path>", "OpenRouter activity CSV file")
  .option("-d, --days <number>", "Only include last N days", parseInt)
  .option("--json", "Output as JSON")
  .action(async (opts) => {
    const provider = VALID_PROVIDERS.includes(opts.provider as ProviderId)
      ? (opts.provider as ProviderId)
      : undefined;

    await runCost({
      provider,
      file: opts.file,
      days: opts.days,
      json: opts.json,
    });
  });

program.parse();
