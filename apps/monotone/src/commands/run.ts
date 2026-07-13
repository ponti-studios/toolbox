import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
import { join, dirname, basename, extname, resolve, isAbsolute } from "path";
import { generate } from "../lib/ollama";
import { loadSkill } from "../lib/skills";
import { logCall } from "../lib/logger";

export interface RunOptions {
  source: string;
  skill: string;
  voice?: string;
  model?: string;
  out?: string;
}

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
  const existing = readdirSync(dir).filter(f => f.startsWith(base + ".v"));
  let max = 0;
  for (const f of existing) {
    const m = f.match(new RegExp(`^${escapeRegex(base)}\\.v(\\d+)${escapeRegex(suffix)}\\.md$`));
    if (m?.[1]) max = Math.max(max, parseInt(m[1]));
  }
  return join(dir, `${base}.v${max + 1}${suffix}.md`);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function run(opts: RunOptions): Promise<void> {
  const t0 = Date.now();

  const sourcePath = resolve(process.cwd(), opts.source);
  if (!existsSync(sourcePath)) throw new Error(`File not found: ${opts.source}`);

  const voiceName = opts.voice || "kernel-voice";
  const model = opts.model || process.env.MODEL || "gemma4:e2b-mlx";

  // Compute skill name for loading — strip kernel- prefix if needed
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

  const data = await generate(prompt, model);
  logCall(opts.skill, basename(sourcePath), model, data);

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n  model:   ${model}`);
  console.log(`  tokens:  ${data.prompt_eval_count} in → ${data.eval_count} out (${(data.eval_count! / (data.eval_duration! / 1e9)).toFixed(1)}/s)`);
  console.log(`  time:    ${elapsed}s\n`);

  writeFileSync(outPath, data.response.trim() + "\n", "utf-8");
  console.log(`  written: ${outPath}`);
  console.log("  done.\n");
}
