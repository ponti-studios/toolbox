// JSONL scanner: parses Claude Code session files (~/.claude/projects/...).
// Ported from agent-usage-monitor's scanner.ts.
// Uses chunk-based regex scanning to avoid loading full files into memory.
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { SessionLog, ProviderId } from "./types.js";
import { estimateCost } from "./pricing.js";
import {
  RE_INPUT_TOKENS,
  RE_OUTPUT_TOKENS,
  RE_CACHE_READ,
  RE_CACHE_CREATION,
  RE_MODEL,
  RE_TYPE_ASSISTANT,
  RE_TYPE_USER,
  RE_GIT_BRANCH,
  sumAllMatches,
  countMatches,
  lastMatch,
} from "./jsonl-utils.js";

const CLAUDE_DIR = path.join(os.homedir(), ".claude");
const PROJECTS_DIR = path.join(CLAUDE_DIR, "projects");

// ─── Project path resolution ────────────────────────────────────────
export function encodeProjectPath(projectPath: string): string {
  return projectPath.replace(/[/.]/g, "-");
}

export function getProjectName(projectPath: string): string {
  return path.basename(projectPath) || projectPath;
}

async function resolveProjectPath(encodedDirName: string): Promise<string> {
  // Try sessions-index.json first
  try {
    const indexPath = path.join(PROJECTS_DIR, encodedDirName, "sessions-index.json");
    const content = await fs.promises.readFile(indexPath, "utf-8");
    const index = JSON.parse(content);
    if (index.originalPath && typeof index.originalPath === "string") {
      return index.originalPath;
    }
  } catch {
    // Fall through
  }

  // Naive decode as fallback
  const decoded = "/" + encodedDirName.slice(1).replace(/-/g, "/");
  try {
    await fs.promises.access(decoded);
    return decoded;
  } catch {
    return decoded;
  }
}

// ─── Scan a single JSONL file ───────────────────────────────────────
interface ScanResult {
  sessionLog: SessionLog | null;
  error: string | null;
}

function scanFile(filePath: string, projectName: string): ScanResult {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return { sessionLog: null, error: "stat failed" };
  }

  const sessionId = path.basename(filePath, ".jsonl");

  let inputTokens = 0,
    outputTokens = 0,
    cacheReadTokens = 0,
    cacheCreationTokens = 0;
  let model: string | undefined;
  let assistantTurns = 0,
    userTurns = 0;
  let gitBranch: string | undefined;
  let summary = "";
  let firstMessage = "";
  let startedAt: Date | null = null;

  const fd = fs.openSync(filePath, "r");
  try {
    // Head: first 8KB for metadata
    const headBuf = Buffer.alloc(8192);
    const headRead = fs.readSync(fd, headBuf, 0, 8192, 0);
    const head = headBuf.toString("utf-8", 0, headRead);
    for (const line of head.split("\n")) {
      if (!line.trim() || line.length > 50000) continue;
      try {
        const entry = JSON.parse(line);
        if (entry.type === "summary") {
          summary = entry.summary || "";
        }
        if (
          (entry.type === "user" || entry.type === "human") &&
          !firstMessage &&
          entry.message?.content
        ) {
          const c = entry.message.content;
          if (typeof c === "string") firstMessage = c.slice(0, 200);
          else if (Array.isArray(c)) {
            const tb = c.find((b: { type: string }) => b.type === "text");
            firstMessage = tb?.text?.slice(0, 200) || "";
          }
        }
        if (entry.timestamp && !startedAt) {
          startedAt = new Date(entry.timestamp);
        }
      } catch {
        /* skip */
      }
    }

    // Chunk scan for tokens
    const CHUNK = 256 * 1024;
    const buf = Buffer.alloc(CHUNK);
    let pos = 0;
    let carry = "";
    while (pos < stat.size) {
      const bytesRead = fs.readSync(fd, buf, 0, CHUNK, pos);
      if (!bytesRead) break;
      const text = carry + buf.toString("utf-8", 0, bytesRead);

      inputTokens += sumAllMatches(text, RE_INPUT_TOKENS());
      outputTokens += sumAllMatches(text, RE_OUTPUT_TOKENS());
      cacheReadTokens += sumAllMatches(text, RE_CACHE_READ());
      cacheCreationTokens += sumAllMatches(text, RE_CACHE_CREATION());
      assistantTurns += countMatches(text, RE_TYPE_ASSISTANT());
      userTurns += countMatches(text, RE_TYPE_USER());

      const m = lastMatch(text, RE_MODEL());
      if (m) model = m;

      if (!gitBranch) {
        const gb = text.match(RE_GIT_BRANCH);
        if (gb) gitBranch = gb[1];
      }

      const lastNewline = text.lastIndexOf("\n");
      carry = lastNewline >= 0 ? text.slice(lastNewline + 1) : text;
      pos += bytesRead;
    }
  } finally {
    fs.closeSync(fd);
  }

  const resolvedModel = model || "unknown";
  const cost =
    inputTokens || outputTokens
      ? estimateCost("claude", resolvedModel, {
          inputTokens,
          outputTokens,
          cacheReadTokens,
          cacheCreationTokens,
          reasoningTokens: 0,
        })
      : 0;

  const turnCount = userTurns + assistantTurns;

  const sessionLog: SessionLog = {
    source: "claude" as ProviderId,
    sessionId,
    projectName,
    model: resolvedModel,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreationTokens,
    reasoningTokens: 0,
    cost,
    turnCount,
    startedAt,
    lastModified: stat.mtime,
    gitBranch,
    summary: summary || firstMessage.slice(0, 100),
  };

  return { sessionLog, error: null };
}

// ─── Walk projects directory ────────────────────────────────────────
export interface ScanOptions {
  afterDate?: Date; // only scan files modified after this date
  limit?: number; // max files to scan
}

export async function scanClaudeProjects(options: ScanOptions = {}): Promise<SessionLog[]> {
  const sessions: SessionLog[] = [];

  let dirs: fs.Dirent[];
  try {
    dirs = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true });
  } catch {
    return sessions; // no .claude/projects directory
  }

  const afterTime = options.afterDate?.getTime() ?? 0;
  const limit = options.limit ?? 500;

  for (const dir of dirs) {
    if (!dir.isDirectory()) continue;
    if (sessions.length >= limit) break;

    const dirPath = path.join(PROJECTS_DIR, dir.name);
    let files: string[];
    try {
      files = fs.readdirSync(dirPath).filter((f) => f.endsWith(".jsonl"));
    } catch {
      continue;
    }

    const projectPath = await resolveProjectPath(dir.name);
    const projectName = getProjectName(projectPath);

    for (const file of files) {
      if (sessions.length >= limit) break;

      const fp = path.join(dirPath, file);
      let stat: fs.Stats;
      try {
        stat = fs.statSync(fp);
      } catch {
        continue;
      }

      if (stat.mtime.getTime() < afterTime) continue;

      const { sessionLog } = scanFile(fp, projectName);
      if (sessionLog) {
        sessions.push(sessionLog);
      }
    }
  }

  // Sort by lastModified descending
  sessions.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
  return sessions;
}
