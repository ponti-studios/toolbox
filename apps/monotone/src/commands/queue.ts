import { readFileSync, existsSync } from "fs";
import { resolve, isAbsolute } from "path";
import { createDraft } from "../lib/typefully";

interface PostEntry {
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

function parsePostFile(path: string): PostEntry[] {
  const content = readFileSync(path, "utf-8");
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
    if (!frontmatterDone && line.trim() === "---") {
      if (!inFrontmatter) { inFrontmatter = true; continue; }
      else { inFrontmatter = false; frontmatterDone = true; continue; }
    }
    if (!frontmatterDone) continue;

    if (line.trim() === "## TikTok Clip Ideas") {
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

export async function queue(args: QueueOptions): Promise<void> {
  const sourcePath = resolvePath(args.source);
  if (!existsSync(sourcePath)) throw new Error(`File not found: ${args.source}`);

  const posts = parsePostFile(sourcePath);

  console.log(`  file:  ${sourcePath}`);
  if (args.dryRun) console.log("  mode:  dry-run");
  if (args.socialSet) console.log(`  social set: ${args.socialSet}`);
  console.log(`  posts: ${posts.length}\n`);

  for (const post of posts) {
    if (args.dryRun) {
      console.log(`  [dry-run] ${post.text.slice(0, 80)}...`);
    } else {
      const result = await createDraft(
        post.text,
        args.socialSet ? { socialSetId: args.socialSet } : {}
      );
      console.log(`  queued: ${result.id} — ${post.text.slice(0, 60)}...`);
    }
  }

  console.log(`\n  done. ${posts.length} posts.\n`);
}
