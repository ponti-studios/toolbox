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


