#!/usr/bin/env bun

import { Command } from "commander";
import "./lib/env";
import { rewrite, type RewriteOptions } from "./commands/rewrite";
import { extract, type ExtractOptions } from "./commands/extract";
import { queue, type QueueOptions } from "./commands/queue";
import { logs } from "./commands/logs";

const program = new Command();

function run(action: () => Promise<void> | void): void {
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
    TYPEFULLY_SOCIAL_SET_ID   Typefully social set ID (required for queue)
    OLLAMA_URL          Ollama server URL (default: http://localhost:11434)
    MODEL               Default model (default: gemma4:e2b-mlx)
`);

program
  .command("rewrite")
  .description("Transform raw notes into a polished essay")
  .argument("<path>", "source markdown file")
  .option("--out <path>", "output path")
  .option("--in-place", "overwrite the source file after creating a backup")
  .option("--model <model>", "Ollama model name")
  .action((source: string, options: RewriteOptions) => run(() => rewrite({ ...options, source })));

program
  .command("extract")
  .description("Extract 1 long-form X post and TikTok clip ideas")
  .argument("<path>", "source essay file")
  .option("--out <path>", "output path")
  .option("--model <model>", "Ollama model name")
  .action((source: string, options: ExtractOptions) => run(() => extract({ ...options, source })));

program
  .command("queue")
  .description("Push posts to Typefully as drafts")
  .argument("<path>", "posts markdown file")
  .option("--dry-run", "print drafts without queueing")
  .option("--social-set <id>", "Typefully social set ID")
  .action((source: string, options: QueueOptions) => run(() => queue({ ...options, source })));

program
  .command("logs")
  .description("Show recent Ollama call history")
  .argument("[n]", "number of recent calls to show", "0")
  .action((n: string) => run(() => logs(parseInt(n) || 0)));

program.parse();
