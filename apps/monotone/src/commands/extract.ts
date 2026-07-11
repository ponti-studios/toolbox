import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname, basename, extname, resolve, isAbsolute } from "path";
import { generate } from "../lib/ollama";
import { getSkillPath } from "../lib/skills";
import { logCall } from "../lib/logger";

interface Post {
  id: number;
  type: string;
  text: string;
}

interface TikTokClip {
  hook: string;
  timestamp: string;
  visual: string;
  caption: string;
}

interface ExtractResponse {
  posts: Post[];
  tiktok_clips?: TikTokClip[];
}

export interface ExtractOptions {
  source: string;
  out?: string;
  model?: string;
}

function resolvePath(p: string): string {
  if (isAbsolute(p)) return p;
  return resolve(process.cwd(), p);
}

function parseResponse(raw: string): ExtractResponse {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed.posts || !Array.isArray(parsed.posts)) {
      throw new Error("LLM response missing 'posts' array");
    }
    return parsed;
  } catch {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) return parseResponse(jsonMatch[0]);
    throw new Error("Failed to parse LLM response as JSON");
  }
}

function formatPostsFile(sourcePath: string, data: ExtractResponse, model: string): string {
  const slug = basename(sourcePath, extname(sourcePath));

  const lines: string[] = [
    "---",
    `source: ${basename(sourcePath)}`,
    `generated: ${new Date().toISOString().split("T")[0]}`,
    `model: ${model}`,
    `count: ${data.posts.length}`,
    "---",
    "",
    `# ${slug.replace(/-/g, " ")} — Posts`,
    "",
    "> Review and edit before running `monotone queue`.",
    "",
  ];

  for (const post of data.posts) {
    lines.push(`## ${post.id}. [${post.type}]`);
    lines.push(post.text);
    lines.push("");
  }

  if (data.tiktok_clips && data.tiktok_clips.length > 0) {
    lines.push("---", "", "## TikTok Clip Ideas", "");
    for (const clip of data.tiktok_clips) {
      lines.push(`- **Hook:** ${clip.hook}`);
      lines.push(`  **Timestamp:** ${clip.timestamp}`);
      lines.push(`  **Visual:** ${clip.visual}`);
      lines.push(`  **Caption:** ${clip.caption}`);
      lines.push("");
    }
  }

  return lines.join("\n");
}

export async function extract(args: ExtractOptions): Promise<void> {
  const sourcePath = resolvePath(args.source);
  if (!existsSync(sourcePath)) throw new Error(`File not found: ${args.source}`);

  const ext = extname(sourcePath);
  const stem = sourcePath.slice(0, -ext.length);
  const outPath = args.out ? resolvePath(args.out) : stem + ".posts.md";

  const skillPath = getSkillPath("kernel-extract-posts");
  if (!existsSync(skillPath)) throw new Error(`Skill not installed: kernel-extract-posts.\nRun: npx skills add ponti-studios/kernel --skill kernel-extract-posts --yes`);

  const skill = readFileSync(skillPath, "utf-8");
  const essay = readFileSync(sourcePath, "utf-8");
  const prompt = [skill, `\n# Essay\n\n${essay}\n`, "\n---\nExtract 1 long-form X post and 1-2 TikTok clip ideas. Return valid JSON."].join("\n");

  const model = args.model || process.env.MODEL || "gemma4:e2b-mlx";
  const t0 = Date.now();
  const data = await generate(prompt, model, "json");
  logCall("extract", basename(sourcePath), model, data);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  const parsed = parseResponse(data.response);
  const dir = dirname(outPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const formatted = formatPostsFile(sourcePath, parsed, data.model);
  writeFileSync(outPath, formatted.trim() + "\n");

  const promptToks = data.prompt_eval_count || "?";
  const outToks = data.eval_count || "?";
  const tokPerSec = data.eval_duration ? (data.eval_count! / (data.eval_duration / 1e9)).toFixed(1) : "?";

  console.log(`  source: ${basename(sourcePath)}`);
  console.log(`  out:    ${outPath}\n`);
  console.log(`  model:   ${data.model}`);
  console.log(`  tokens:  ${promptToks} in → ${outToks} out (${tokPerSec}/s)`);
  console.log(`  time:    ${elapsed}s\n`);
  console.log(`  written: ${outPath}`);
  console.log(`  ${parsed.posts.length} X posts`);
  if (parsed.tiktok_clips?.length) console.log(`  ${parsed.tiktok_clips.length} TikTok clip ideas`);
  console.log("  review and edit before queuing.\n");
}
