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
  const binaryPath = process.execPath;
  if (!fs.existsSync(binaryPath)) {
    console.error(`Error: cannot find binary at ${binaryPath}`);
    console.error("  Run 'iconkit install' from the compiled binary, not from source.");
    process.exit(1);
  }

  const targetDir = detectTargetDir(dir);
  fs.mkdirSync(targetDir, { recursive: true });
  const dest = path.join(targetDir, "iconkit");

  if (fs.existsSync(dest)) {
    const existing = fs.readlinkSync(dest);
    if (existing === binaryPath) {
      console.log(`  ✓ already installed at ${dest}`);
      return;
    }
    console.log(`  ! ${dest} already exists — overwriting`);
    fs.unlinkSync(dest);
  }

  fs.symlinkSync(binaryPath, dest);

  const inPath = which("iconkit");
  if (!inPath) {
    console.log(`  ✓ installed to ${dest}`);
    console.log(`  ! ${targetDir} is not on your PATH. Add it:`);
    console.log(`      export PATH="${targetDir}:$PATH"`);
  } else {
    console.log(`  ✓ installed to ${dest}`);
  }
}
