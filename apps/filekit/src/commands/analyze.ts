import fg from "fast-glob";
import { existsSync } from "node:fs";
import { basename, extname, relative, resolve } from "node:path";
import { readText } from "../lib/helpers.js";

export function analyze(
  root: string,
  options: {
    output?: string;
    files?: boolean;
    extensions?: string;
    includeHidden?: boolean;
    ignoreFile?: string[];
    noGitignore?: boolean;
  },
): void {
  const base = resolve(root);
  if (!existsSync(base)) throw new Error(`directory not found: ${root}`);
  const extensions = (options.extensions ?? ".md,.txt,.py,.js,.json,.yaml,.yml,.sh")
    .split(",")
    .map((ext) =>
      ext.trim().startsWith(".") ? ext.trim().toLowerCase() : `.${ext.trim().toLowerCase()}`,
    )
    .filter(Boolean);
  const ignores = [
    ".kernelignore",
    ...(options.noGitignore ? [] : [".gitignore"]),
    ...(options.ignoreFile ?? []),
  ].flatMap((file) => {
    const path = resolve(base, file);
    return existsSync(path)
      ? readText(path)
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((line) => line && !line.startsWith("#"))
      : [];
  });
  const matchesIgnore = (file: string) => {
    const rel = relative(base, file).replaceAll("\\", "/");
    if (!options.includeHidden && rel.split("/").some((part) => part.startsWith("."))) return true;
    return ignores.some((pattern) => {
      const normalized = pattern.replace(/^!/, "");
      const regex = new RegExp(
        `^${normalized.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`,
      );
      return regex.test(rel) || regex.test(basename(rel));
    });
  };
  const files = fg
    .sync("**/*", { cwd: base, absolute: true, onlyFiles: true, dot: true })
    .filter(
      (file) =>
        !matchesIgnore(file) &&
        file !== resolve(base, ".kernelignore") &&
        extensions.includes(extname(file).toLowerCase()),
    );
  const reports = files.flatMap((file) => {
    try {
      const content = readText(file);
      return [
        {
          path: relative(base, file),
          lines: content ? content.split("\n").length - (content.endsWith("\n") ? 1 : 0) : 0,
          words: content.trim() ? content.trim().split(/\s+/).length : 0,
          bytes: Buffer.byteLength(content),
          tokens: Math.max(1, Math.floor(content.length / 4)),
        },
      ];
    } catch {
      return [];
    }
  });
  const summary = {
    files: reports.length,
    lines: reports.reduce((n, r) => n + r.lines, 0),
    words: reports.reduce((n, r) => n + r.words, 0),
    bytes: reports.reduce((n, r) => n + r.bytes, 0),
    tokens: reports.reduce((n, r) => n + r.tokens, 0),
  };
  const result = {
    root: base,
    ignored_entries: 0,
    token_estimation: "rough",
    summary: {
      ...summary,
      average_tokens_per_file: summary.files ? summary.tokens / summary.files : 0,
      estimated_input_cost_usd: (summary.tokens / 1000) * 0.0005,
    },
    by_extension: [...new Set(reports.map((r) => extname(r.path).toLowerCase() || "no-ext"))]
      .sort()
      .map((extension) => {
        const selected = reports.filter(
          (r) => (extname(r.path).toLowerCase() || "no-ext") === extension,
        );
        return {
          extension,
          files: selected.length,
          lines: selected.reduce((n, r) => n + r.lines, 0),
          words: selected.reduce((n, r) => n + r.words, 0),
          bytes: selected.reduce((n, r) => n + r.bytes, 0),
          tokens: selected.reduce((n, r) => n + r.tokens, 0),
        };
      }),
    ...(options.files ? { files: reports } : {}),
  };
  if (options.output === "json") console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`\n📊 Analysis of: ${base}`);
    console.log(`Files: ${summary.files}`);
    console.log(`Lines: ${summary.lines}`);
    console.log(`Words: ${summary.words}`);
    console.log(`Bytes: ${summary.bytes}`);
    console.log(`Tokens: ${summary.tokens}`);
    if (options.files)
      for (const file of reports)
        console.log(
          `${file.path}: ${file.lines} lines, ${file.words} words, ${file.bytes} bytes, ${file.tokens} tokens`,
        );
  }
}

