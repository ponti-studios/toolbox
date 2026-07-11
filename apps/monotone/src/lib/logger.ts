import { appendFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import { join } from "path";

const HOME = process.env.HOME || process.env.USERPROFILE || "~";
const MONOTONE_HOME = process.env.MONOTONE_HOME || join(HOME, ".monotone");
const LOGS_DIR = join(MONOTONE_HOME, "logs");
const LOG_FILE = join(LOGS_DIR, "ollama.jsonl");

export interface LogEntry {
  ts: string;
  op: string;
  source: string;
  model: string;
  prompt_tokens: number;
  output_tokens: number;
  duration_s: string;
  tokens_per_sec: string;
  done_reason: string;
}

export function logCall(op: string, source: string, model: string, data: {
  prompt_eval_count?: number;
  eval_count?: number;
  total_duration?: number;
  eval_duration?: number;
  done_reason?: string;
}): void {
  if (!existsSync(LOGS_DIR)) mkdirSync(LOGS_DIR, { recursive: true });

  const entry: LogEntry = {
    ts: new Date().toISOString(),
    op,
    source,
    model: data.model || model,
    prompt_tokens: data.prompt_eval_count || 0,
    output_tokens: data.eval_count || 0,
    duration_s: data.total_duration ? (data.total_duration / 1e9).toFixed(1) : "?",
    tokens_per_sec: data.eval_duration ? (data.eval_count! / (data.eval_duration / 1e9)).toFixed(1) : "?",
    done_reason: data.done_reason || "",
  };

  appendFileSync(LOG_FILE, JSON.stringify(entry) + "\n");
}

export function getLogsDir(): string {
  return LOGS_DIR;
}

export function getLogFile(): string {
  return LOG_FILE;
}
