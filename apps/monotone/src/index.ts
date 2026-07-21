#!/usr/bin/env bun
import "./lib/env";

import { Command } from "commander";
import { pathToFileURL } from "url";
import { logs } from "./commands/logs";
import { queue, type QueueOptions } from "./commands/queue";
import { run, type RunOptions } from "./commands/run";

function go(action: () => Promise<void> | void): void {
  Promise.resolve(action()).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\n  error: ${msg}\n`);
    process.exit(1);
  });
}

interface ProgramActions {
  run: (options: RunOptions) => Promise<void> | void;
  queue: (options: QueueOptions) => Promise<void> | void;
  logs: (n: number) => Promise<void> | void;
}

export function createProgram(actions: ProgramActions = { run, queue, logs }): Command {
  const program = new Command();

  program
    .name("monotone")
    .description("Content Pipeline CLI")
    .addHelpText(
      "after",
      `

Requirements:
  Skills must be installed first:
    npx skills add ponti-studios/kernel --all --yes

  Environment (.env):
    TYPEFULLY_API_KEY   Typefully API key (required for queue)
    TYPEFULLY_SOCIAL_SET_ID  Typefully social set ID (or pass --social-set)
    OLLAMA_URL          Ollama server URL (default: http://localhost:11434)
    MODEL               Default model (default: gemma4:e2b-mlx)
`,
    );

  program
    .command("run")
    .description("Run a skill on source material")
    .argument("<path>", "source markdown file")
    .requiredOption("--skill <name>", "skill name (e.g. write-essay, write-video, extract-posts)")
    .option("--voice <name>", "voice skill name (default: kernel-voice)")
    .option("--model <model>", "Ollama model name")
    .option("--out <path>", "output path")
    .action((source: string, options: Omit<RunOptions, "source">) => go(() => actions.run({ ...options, source })));

  program
    .command("queue")
    .description("Push posts to Typefully as drafts")
    .argument("<path>", "posts JSON file, or legacy posts markdown file")
    .option("--dry-run", "print drafts without queueing")
    .option("--social-set <id>", "Typefully social set ID")
    .action((source: string, options: Omit<QueueOptions, "source">) => go(() => actions.queue({ ...options, source })));

  program
    .command("logs")
    .description("Show recent Ollama call history")
    .argument("[n]", "number of recent calls to show", "0")
    .action((n: string) => go(() => actions.logs(parseInt(n) || 0)));

  return program;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createProgram().parse();
}
