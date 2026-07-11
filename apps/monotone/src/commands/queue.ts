import { readFileSync, existsSync } from "fs";
import { resolve, isAbsolute } from "path";
import { createDraft } from "../lib/typefully";

interface PostEntry {
  type: string;
  text: string;
}

interface QueueArgs {
  source: string;
  dryRun?: boolean;
}

export function parseQueueArgs(args: string[]): QueueArgs {
  const result: QueueArgs = { source: "" };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dry-run") result.dryRun = true;
    else if (!args[i].startsWith("--")) result.source = args[i];
  }
  return result;
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
  let currentText = "";
  let frontmatterDone = false;
  let inFrontmatter = false;
  let inTikTok = false;

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
      if (currentText.trim()) {
        posts.push({ type: currentType, text: currentText.trim() });
        currentText = "";
      }
      currentType = h2Match[2];
    } else if (line.trim() && !line.startsWith("#") && !line.startsWith(">")) {
      currentText += (currentText ? "\n" : "") + line;
    }
  }

  if (currentText.trim()) {
    posts.push({ type: currentType, text: currentText.trim() });
  }

  return posts;
}

export async function queue(args: QueueArgs): Promise<void> {
  const sourcePath = resolvePath(args.source);
  if (!existsSync(sourcePath)) throw new Error(`File not found: ${args.source}`);

  const posts = parsePostFile(sourcePath);

  console.log(`  file:  ${sourcePath}`);
  if (args.dryRun) console.log("  mode:  dry-run");
  console.log(`  posts: ${posts.length}\n`);

  for (const post of posts) {
    if (args.dryRun) {
      console.log(`  [dry-run] ${post.text.slice(0, 80)}...`);
    } else {
      const result = await createDraft(post.text);
      console.log(`  queued: ${result.id} — ${post.text.slice(0, 60)}...`);
    }
  }

  console.log(`\n  done. ${posts.length} posts.\n`);
}
