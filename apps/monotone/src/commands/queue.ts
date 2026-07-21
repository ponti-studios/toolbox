import { existsSync, readFileSync } from "fs";
import { extname, isAbsolute, resolve } from "path";
import { createDraft } from "../lib/typefully";

export interface PostEntry {
  type: string;
  text: string;
}

export interface QueueOptions {
  source: string;
  dryRun?: boolean;
  socialSet?: string;
}

function resolvePath(p: string): string {
  if (isAbsolute(p)) return p;
  return resolve(process.cwd(), p);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonPosts(content: string): PostEntry[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid JSON posts file: ${message}`);
  }

  if (!isRecord(parsed) || !Array.isArray(parsed.posts)) {
    throw new Error("Invalid JSON posts file: expected an object with a posts array");
  }

  return parsed.posts.map((post, index) => {
    if (!isRecord(post)) {
      throw new Error(`Invalid JSON posts file: posts[${index}] must be an object`);
    }

    const text = post.text;
    if (typeof text !== "string" || !text.trim()) {
      throw new Error(`Invalid JSON posts file: posts[${index}].text must be a non-empty string`);
    }

    const type = post.type;
    return {
      type: typeof type === "string" && type.trim() ? type : "post",
      text,
    };
  });
}

function parseMarkdownPosts(content: string): PostEntry[] {
  const lines = content.split("\n");

  const posts: PostEntry[] = [];
  let currentType = "";
  let currentLines: string[] = [];
  let frontmatterDone = !lines[0]?.trim().startsWith("---");
  let inFrontmatter = false;
  let inTikTok = false;

  function flushPost(): void {
    while (currentLines[0]?.trim() === "") currentLines.shift();
    while (currentLines[currentLines.length - 1]?.trim() === "") currentLines.pop();
    const text = currentLines.join("\n");
    if (text.trim()) posts.push({ type: currentType, text });
    currentLines = [];
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!frontmatterDone && trimmed === "---") {
      if (!inFrontmatter) {
        inFrontmatter = true;
        continue;
      }
      inFrontmatter = false;
      frontmatterDone = true;
      continue;
    }
    if (!frontmatterDone) continue;

    if (trimmed === "## TikTok Clip Ideas") {
      inTikTok = true;
      continue;
    }
    if (inTikTok) continue;

    const h2Match = line.match(/^## (\d+)\. \[([^\]]+)\]/);
    if (h2Match) {
      flushPost();
      currentType = h2Match[2] || "";
    } else if (currentType) {
      currentLines.push(line);
    }
  }

  flushPost();

  return posts;
}

export function parsePostContent(content: string, sourceName = "posts.md"): PostEntry[] {
  const trimmed = content.trimStart();
  const ext = extname(sourceName).toLowerCase();
  const looksJson = trimmed.startsWith("{");

  if (ext === ".json" || looksJson) {
    return parseJsonPosts(content);
  }

  return parseMarkdownPosts(content);
}

export function parsePostFile(path: string): PostEntry[] {
  return parsePostContent(readFileSync(path, "utf-8"), path);
}

export async function queue(args: QueueOptions): Promise<void> {
  const sourcePath = resolvePath(args.source);
  if (!existsSync(sourcePath)) throw new Error(`File not found: ${args.source}`);

  const posts = parsePostFile(sourcePath);
  if (posts.length === 0) {
    throw new Error(`No queueable posts found in ${args.source}`);
  }

  console.log(`  file:  ${sourcePath}`);
  if (args.dryRun) console.log("  mode:  dry-run");
  if (args.socialSet) console.log(`  social set: ${args.socialSet}`);
  console.log(`  posts: ${posts.length}\n`);

  for (const post of posts) {
    if (args.dryRun) {
      console.log(`  [dry-run] ${post.text.slice(0, 80)}...`);
    } else {
      const result = await createDraft(post.text, args.socialSet ? { socialSetId: args.socialSet } : {});
      console.log(`  queued: ${result.id} — ${post.text.slice(0, 60)}...`);
    }
  }

  console.log(`\n  done. ${posts.length} posts.\n`);
}
