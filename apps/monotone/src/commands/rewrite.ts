import { copyFileSync, readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { join, dirname, basename, extname, resolve, isAbsolute } from "path";
import { generate } from "../lib/ollama";
import { getSkillPath } from "../lib/skills";
import { logCall } from "../lib/logger";

export interface RewriteOptions {
  source: string;
  out?: string;
  inPlace?: boolean;
  model?: string;
}

function resolvePath(p: string): string {
  if (isAbsolute(p)) return p;
  return resolve(process.cwd(), p);
}

function nextVersion(sourcePath: string): string {
  const ext = extname(sourcePath);
  const stem = sourcePath.slice(0, -ext.length);
  const dir = dirname(sourcePath);
  const base = basename(stem);
  const existing = readdirSync(dir).filter(f => f.startsWith(base + ".v"));
  let max = 0;
  for (const f of existing) {
    const m = f.match(new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.v(\\d+)\\.md$`));
    if (m?.[1]) max = Math.max(max, parseInt(m[1]));
  }
  return join(dir, `${base}.v${max + 1}.md`);
}

function nextBackupPath(sourcePath: string): string {
  let candidate = `${sourcePath}.bak`;
  let i = 1;
  while (existsSync(candidate)) {
    candidate = `${sourcePath}.bak.${i++}`;
  }
  return candidate;
}

export async function rewrite(args: RewriteOptions): Promise<void> {
  const sourcePath = resolvePath(args.source);
  if (!existsSync(sourcePath)) throw new Error(`File not found: ${args.source}`);

  const outPath = args.inPlace ? sourcePath
    : args.out ? resolvePath(args.out)
    : nextVersion(sourcePath);

  const skillPath = getSkillPath("write-essay");
  if (!existsSync(skillPath)) throw new Error(`Skill not installed: write-essay.\nRun: npx skills add ponti-studios/kernel --skill write-essay --yes`);

  const skill = readFileSync(skillPath, "utf-8");
  const source = readFileSync(sourcePath, "utf-8");
  const prompt = [skill, `\n# Source Material\n\n${source}\n`, "\n---\nRewrite this into a polished essay in the specified voice."].join("\n");

  const model = args.model || process.env.MODEL || "gemma4:e2b-mlx";
  const t0 = Date.now();
  const data = await generate(prompt, model);
  logCall("rewrite", basename(sourcePath), model, data);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  const dir = dirname(outPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  let backupPath = "";
  if (args.inPlace) {
    backupPath = nextBackupPath(sourcePath);
    copyFileSync(sourcePath, backupPath);
  }
  writeFileSync(outPath, data.response.trim() + "\n");

  const promptToks = data.prompt_eval_count || "?";
  const outToks = data.eval_count || "?";
  const tokPerSec = data.eval_duration ? (data.eval_count! / (data.eval_duration / 1e9)).toFixed(1) : "?";

  console.log(`  source: ${basename(sourcePath)}`);
  console.log(`  out:    ${outPath}\n`);
  console.log(`  model:   ${data.model}`);
  console.log(`  tokens:  ${promptToks} in → ${outToks} out (${tokPerSec}/s)`);
  console.log(`  time:    ${elapsed}s\n`);
  if (backupPath) console.log(`  backup:  ${backupPath}`);
  console.log(`  written: ${outPath}`);
  console.log("  done. review before publishing.\n");
}
