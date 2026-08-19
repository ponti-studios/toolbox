import fs from "node:fs";
import path from "node:path";
import { which } from "../utils";

const HOME = process.env.HOME ?? "/tmp";

function detectTargetDir(dir?: string): string {
  if (dir) return dir;
  for (const c of [path.join(HOME, ".local/bin"), "/usr/local/bin", path.join(HOME, "bin")]) {
    if (fs.existsSync(c)) return c;
  }
  const fallback = path.join(HOME, ".local/bin");
  fs.mkdirSync(fallback, { recursive: true });
  return fallback;
}

export function cmdInstall(dir?: string): void {
  const runtimePath = process.execPath;
  const entrypoint = process.argv[1];
  const compiled = path.basename(runtimePath) === "iconkit" && path.extname(runtimePath) === "";
  if (!compiled && (!entrypoint || !fs.existsSync(entrypoint))) {
    console.error("Error: could not determine the IconKit entrypoint");
    process.exitCode = 1;
    return;
  }

  const targetDir = detectTargetDir(dir);
  fs.mkdirSync(targetDir, { recursive: true });
  const dest = path.join(targetDir, "iconkit");

  let existing: fs.Stats | undefined;
  try {
    existing = fs.lstatSync(dest);
  } catch {
    existing = undefined;
  }
  if (existing) {
    if (existing.isSymbolicLink() && compiled) {
      const target = path.resolve(path.dirname(dest), fs.readlinkSync(dest));
      if (target === path.resolve(runtimePath)) {
        console.log(`  ✓ already installed at ${dest}`);
        return;
      }
    }
    console.error(`Error: ${dest} already exists; remove it or choose another directory`);
    process.exitCode = 1;
    return;
  }

  if (compiled) {
    fs.symlinkSync(runtimePath, dest);
  } else {
    const script = `#!/bin/sh\nexec ${JSON.stringify(runtimePath)} ${JSON.stringify(path.resolve(entrypoint!))} "$@"\n`;
    fs.writeFileSync(dest, script, { mode: 0o755 });
  }

  const inPath = which("iconkit");
  if (!inPath) {
    console.log(`  ✓ installed to ${dest}`);
    console.log(`  ! ${targetDir} is not on your PATH. Add it:`);
    console.log(`      export PATH="${targetDir}:$PATH"`);
  } else {
    console.log(`  ✓ installed to ${dest}`);
  }
}
