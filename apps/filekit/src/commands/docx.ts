import fg from "fast-glob";
import { existsSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

export function docxToMd(paths: string[], overwrite: boolean, noMedia: boolean): void {
  const inputs = paths.length ? paths : ["."];
  const files = inputs.flatMap((path) =>
    statSync(path).isDirectory()
      ? fg.sync("**/*.docx", { cwd: resolve(path), absolute: true })
      : [resolve(path)],
  );
  for (const file of files) {
    const destination = file.replace(/\.docx$/i, ".md");
    if (existsSync(destination) && !overwrite) {
      console.log(`Skipped: ${file}`);
      continue;
    }
    const args = [file, "-t", "gfm", "--wrap=none"];
    if (!noMedia) args.push(`--extract-media=${file.replace(/\.docx$/i, "_media")}`);
    args.push("-o", destination);
    const result = spawnSync("pandoc", args, { stdio: "inherit" });
    if (result.status !== 0) throw new Error(`pandoc failed for ${file}`);
    console.log(`Converted: ${file} -> ${destination}`);
  }
}

