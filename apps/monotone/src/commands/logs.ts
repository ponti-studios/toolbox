import { readFileSync, existsSync } from "fs";
import { getLogFile } from "../lib/logger";

export function logs(n: number = 0): void {
  const logFile = getLogFile();
  if (!existsSync(logFile)) {
    console.log("  No logs yet. Run a rewrite or extract first.\n");
    return;
  }

  const lines = readFileSync(logFile, "utf-8").trim().split("\n");
  const entries = lines.map(l => JSON.parse(l));

  const recent = n > 0 ? entries.slice(-n) : entries;

  for (const e of recent) {
    const ts = e.ts?.replace("T", " ").slice(0, 19) || "";
    console.log(`${ts}  ${e.op.padEnd(8)} ${e.source.padEnd(30)} ${String(e.prompt_tokens).padStart(4)}→${String(e.output_tokens).padStart(4)} tok  ${e.tokens_per_sec}/s  ${e.model}`);
  }

  console.log(`\n  ${entries.length} calls logged. ${logFile}\n`);
}
