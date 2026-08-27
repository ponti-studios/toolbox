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
  const compiled =
    (path.basename(runtimePath) === "imagekit" ||
      path.basename(runtimePath) === "iconkit" ||
      path.basename(runtimePath) === "photokit") &&
    path.extname(runtimePath) === "";
  if (!compiled && (!entrypoint || !fs.existsSync(entrypoint))) {
    console.error("Error: could not determine the ImageKit entrypoint");
    process.exitCode = 1;
    return;
  }

  const targetDir = detectTargetDir(dir);
  fs.mkdirSync(targetDir, { recursive: true });

  const bins = ["imagekit", "iconkit", "photokit"];

  for (const bin of bins) {
    const dest = path.join(targetDir, bin);
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
          continue;
        }
      }
      // For node wrapper, if dest already exists and is same wrapper, skip
      if (!compiled && existing.isFile()) {
        try {
          const content = fs.readFileSync(dest, "utf8");
          if (content.includes(path.resolve(entrypoint!))) {
            console.log(`  ✓ already installed at ${dest}`);
            continue;
          }
        } catch {}
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
    console.log(`  ✓ installed ${bin} to ${dest}`);
  }

  const inPath = which("imagekit") ?? which("iconkit");
  if (!inPath) {
    console.log(`  ! ${targetDir} is not on your PATH. Add it:`);
    console.log(`      export PATH="${targetDir}:$PATH"`);
  }
}
