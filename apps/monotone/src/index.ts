#!/usr/bin/env bun
/**
 * Monotone — Content Pipeline CLI
 *
 * Usage:
 *   monotone rewrite <path> [--out <path>] [--in-place] [--model <model>]
 *   monotone extract <path> [--out <path>] [--model <model>]
 *   monotone queue   <path> [--dry-run]
 */

import { parseRewriteArgs, rewrite } from "./commands/rewrite";
import { parseExtractArgs, extract } from "./commands/extract";
import { parseQueueArgs, queue } from "./commands/queue";
import { logs } from "./commands/logs";

const USAGE = `
monotone — Content Pipeline CLI

Usage:
  monotone rewrite <path> [--out <path>] [--in-place] [--model <model>]
  monotone extract <path> [--out <path>] [--model <model>]
  monotone queue   <path> [--dry-run]
  monotone logs    [n]

Commands:
  rewrite   Transform raw notes into a polished essay (uses write-essay skill)
  extract   Extract 1 long-form X post + TikTok clip ideas (uses kernel-extract-posts skill)
  queue     Push posts to Typefully as drafts
  logs      Show recent Ollama call history (default: all, or last n)

Requirements:
  Skills must be installed first:
    npx skills add ponti-studios/kernel --all --yes

  Environment (.env):
    TYPEFULLY_API_KEY   Typefully API key (required for queue)
    OLLAMA_URL          Ollama server URL (default: http://localhost:11434)
    MODEL               Default model (default: gemma4:e2b-mlx)
`.trim();

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const rest = args.slice(1);

  if (!command || command === "--help" || command === "-h") {
    console.log(USAGE);
    process.exit(0);
  }

  try {
    switch (command) {
      case "rewrite":
        await rewrite(parseRewriteArgs(rest));
        break;
      case "extract":
        await extract(parseExtractArgs(rest));
        break;
      case "queue":
        await queue(parseQueueArgs(rest));
        break;
      case "logs":
        logs(parseInt(rest[0]) || 0);
        break;
      default:
        console.error(`\n  Unknown command: ${command}\n`);
        console.log(USAGE);
        process.exit(1);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\n  error: ${msg}\n`);
    process.exit(1);
  }
}

main();
