#!/usr/bin/env bun

import { Command } from "commander";
import "./lib/env";
import { run, type RunOptions } from "./commands/run";
import { queue, type QueueOptions } from "./commands/queue";
import { logs } from "./commands/logs";

const program = new Command();

function go(action: () => Promise<void> | void): void {
  Promise.resolve(action()).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\n  error: ${msg}\n`);
    process.exit(1);
  });
}

program
  .name("monotone")
  .description("Content Pipeline CLI")
  .addHelpText("after", `

Requirements:
  Skills must be installed first:
    npx skills add ponti-studios/kernel --all --yes

  Environment (.env):
    TYPEFULLY_API_KEY   Typefully API key (required for queue)
    OLLAMA_URL          Ollama server URL (default: http://localhost:11434)
    MODEL               Default model (default: gemma4:e2b-mlx)
`);

program
  .command("run")
  .description("Run a skill on source material")
  .argument("<path>", "source markdown file")
  .requiredOption("--skill <name>", "skill name (e.g. write-essay, write-video, extract-posts)")
  .option("--voice <name>", "voice skill name (default: kernel-voice)")
  .option("--model <model>", "Ollama model name")
  .option("--out <path>", "output path")
  .action((source: string, options: RunOptions) => go(() => run({ ...options, source })));

program
  .command("queue")
  .description("Push posts to Typefully as drafts")
  .argument("<path>", "posts markdown file")
  .option("--dry-run", "print drafts without queueing")
  .action((source: string, options: QueueOptions) => go(() => queue({ ...options, source })));

program
  .command("logs")
  .description("Show recent Ollama call history")
  .argument("[n]", "number of recent calls to show", "0")
  .action((n: string) => go(() => logs(parseInt(n) || 0)));

program.parse();
