import { Command } from "commander";
import fg from "fast-glob";
import matter from "gray-matter";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type Frontmatter = Record<string, unknown>;
export type FileTarget = { file: string; data: Frontmatter; body: string };

export const readText = (file: string): string => readFileSync(file, "utf8");
export const writeText = (file: string, value: string): void => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, value);
};
export const markdownFiles = (root: string, includeHidden = false): string[] =>
  fg
    .sync(["**/*.md", "**/*.markdown"], {
      cwd: root,
      absolute: true,
      dot: includeHidden,
      onlyFiles: true,
      ignore: ["**/node_modules/**", "**/site/_site/**"],
    })
    .sort();
export const parseFile = (file: string): FileTarget | null => {
  const parsed = matter(readText(file));
  if (
    Object.keys(parsed.data as object).length === 0 &&
    !readText(file).trimStart().startsWith("---")
  )
    return null;
  return { file, data: parsed.data as Frontmatter, body: parsed.content };
};
export const renderFile = (data: Frontmatter, body: string): string => matter.stringify(body, data);
export const asString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;
export const requireString = (data: Frontmatter, key: string): string => {
  const value = asString(data[key]);
  if (!value?.trim()) throw new Error(`Missing or invalid frontmatter field: ${key}`);
  return value;
};
export const rootOption = (command: Command): Command =>
  command.option("-r, --root <root>", "root directory", ".");
export const outputOption = (command: Command): Command => command.option("-o, --output <output>");
export const filesFrom = (root: string, includeHidden = false): FileTarget[] =>
  markdownFiles(resolve(root), includeHidden).flatMap((file) => {
    const parsed = parseFile(file);
    return parsed ? [parsed] : [];
  });

export type FrontmatterEdit =
  | { key: string; action: "remove" }
  | { key: string; action: "set"; value: string };

const FRONTMATTER_KEY = /^(\s*)([\w.-]+):(.*)$/;

function isContinuation(line: string): boolean {
  return /^\s{1,}/.test(line) || /^- /.test(line);
}

/**
 * Apply line-precise edits to a file's frontmatter block without re-rendering it,
 * so untouched keys keep their exact formatting and scalar types (dates, quotes,
 * flow styles). Editable keys are column-0, single-line or multi-line (indented
 * continuations, block sequences, block scalars); a multi-line value is edited as
 * a whole block. Files without a frontmatter block, and keys that are absent, are
 * left untouched.
 */
export function applyFrontmatterEdits(text: string, edits: FrontmatterEdit[]): string {
  const lines = text.split("\n");
  if (lines[0]?.trim() !== "---") return text;
  const close = lines.findIndex((line, i) => i > 0 && line.trim() === "---");
  if (close < 0) return text;
  const wanted = new Map<string, FrontmatterEdit>(edits.map((edit) => [edit.key, edit]));
  const edited = new Set<string>();
  const result: string[] = [lines[0] ?? ""];
  for (let i = 1; i < close; ) {
    const line = lines[i] ?? "";
    const match = FRONTMATTER_KEY.exec(line);
    if (!match) {
      result.push(line);
      i++;
      continue;
    }
    const indent = match[1] ?? "";
    const key = match[2] ?? "";
    if (indent !== "" || key === "") {
      result.push(line);
      i++;
      continue;
    }
    const edit = wanted.get(key);
    if (edit === undefined) {
      result.push(line);
      i++;
      continue;
    }
    let end = i + 1;
    while (end < close && isContinuation(lines[end] ?? "")) end++;
    edited.add(key);
    if (edit.action === "set") result.push(`${indent}${key}: ${edit.value}`);
    i = end;
  }
  for (const edit of edits)
    if (!edited.has(edit.key) && edit.action === "set") result.push(`${edit.key}: ${edit.value}`);
  result.push(...lines.slice(close));
  return result.join("\n");
}
