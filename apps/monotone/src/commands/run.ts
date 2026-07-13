import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
import { join, dirname, basename, extname, resolve } from "path";
import { generateStream } from "../lib/ollama";
import { loadSkill } from "../lib/skills";
import { logCall } from "../lib/logger";

export interface RunOptions {
  source: string;
  skill: string;
  voice?: string;
  model?: string;
  out?: string;
}

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

const SKILL_SUFFIX: Record<string, string> = {
  "write-essay": "",
  "write-video": ".script",
  "extract-posts": ".posts",
};

function nextVersionPath(sourcePath: string, suffix: string): string {
  const ext = extname(sourcePath);
  const stem = sourcePath.slice(0, -ext.length);
  const dir = dirname(sourcePath);
  const base = basename(stem);
  const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const existing = readdirSync(dir).filter(f => f.startsWith(base + ".v"));
  let max = 0;
  for (const f of existing) {
    const m = f.match(new RegExp(`^${escapeRe(base)}\\.v(\\d+)${escapeRe(suffix)}\\.md$`));
    if (m?.[1]) max = Math.max(max, parseInt(m[1]));
  }
  return join(dir, `${base}.v${max + 1}${suffix}.md`);
}

function spinnerFrame(i: number): string {
  return SPINNER[i % SPINNER.length];
}

function formatDur(ns: number): string {
  if (!ns) return "0s";
  const s = ns / 1e9;
  if (s < 60) return `${s.toFixed(1)}s`;
  return `${Math.floor(s / 60)}m ${Math.floor(s % 60)}s`;
}

export async function run(opts: RunOptions): Promise<void> {
  const sourcePath = resolve(process.cwd(), opts.source);
  if (!existsSync(sourcePath)) throw new Error(`File not found: ${opts.source}`);

  const voiceName = opts.voice || "kernel-voice";
  const model = opts.model || process.env.MODEL || "gemma4:e2b-mlx";

  const skillLoad = opts.skill.replace(/^kernel-/, "");
  const suffix = SKILL_SUFFIX[skillLoad] ?? "";

  const voiceSkill = loadSkill(voiceName);
  const domainSkill = loadSkill(skillLoad);
  const source = readFileSync(sourcePath, "utf-8");

  const prompt = [voiceSkill, domainSkill, `\n\n# Source\n\n${source}`].join("\n\n---\n\n");

  const outPath = opts.out
    ? resolve(process.cwd(), opts.out)
    : nextVersionPath(sourcePath, suffix);

  console.log(`  source: ${basename(sourcePath)}`);
  console.log(`  skill:  ${opts.skill}`);
  if (opts.voice) console.log(`  voice:  ${opts.voice}`);
  console.log(`  out:    ${outPath}`);
  console.log(`  model:  ${model}\n`);

  const t0 = Date.now();
  let fullResponse = "";
  let tokenCount = 0;
  let promptEval = 0;
  let evalDuration = 0;
  let spinnerIdx = 0;
  let lastDraw = 0;

  const stream = generateStream(prompt, model);

  process.stdout.write("  ");

  for await (const event of stream) {
    if (event.done) {
      promptEval = (event.prompt_eval_count as number) || 0;
      tokenCount = (event.eval_count as number) || 0;
      evalDuration = (event.eval_duration as number) || 0;
      const finalChunk = (event.response as string) || "";
      if (finalChunk) fullResponse += finalChunk;
      break;
    }

    fullResponse += (event.response as string) || "";

    // Throttle display to ~10fps
    const now = Date.now();
    if (now - lastDraw < 100) continue;
    lastDraw = now;

    const elapsed = ((now - t0) / 1000).toFixed(0);
    spinnerIdx++;

    process.stdout.write(
      `\r  ${spinnerFrame(spinnerIdx)}  generating...  ${elapsed}s`
    );
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const tps = evalDuration > 0 ? (tokenCount / (evalDuration / 1e9)).toFixed(1) : "?";
  process.stdout.write(`\r  ✓  ${tokenCount} tokens  ${tps} tok/s  ${elapsed}s\n\n`);

  // Log to jsonl
  logCall(opts.skill, basename(sourcePath), model, {
    prompt_eval_count: promptEval,
    eval_count: tokenCount,
    total_duration: Date.now() - t0,
    eval_duration: evalDuration,
    done_reason: "stop",
  });

  writeFileSync(outPath, fullResponse.trim() + "\n", "utf-8");
  console.log(`  written: ${outPath}`);
  console.log("  done.\n");
}
