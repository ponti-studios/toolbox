import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const BIN = path.resolve(import.meta.dir, "../.test-bin/imagekit");
export const ICONKIT_BIN = BIN; // compat
export const APP_DIR = path.resolve(import.meta.dir, "..");
export const FIXTURES = path.resolve(import.meta.dir, "../tests/fixtures");

export function runImagekit(args: string[], env: Record<string, string> = {}) {
  const result = Bun.spawnSync([BIN, ...args], { env: { ...process.env, ...env } });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

// Compat alias: runIconkit
export const runIconkit = runImagekit;

export function runSource(args: string[], env: Record<string, string> = {}) {
  const result = Bun.spawnSync(["bun", "run", "src/index.ts", ...args], {
    cwd: APP_DIR,
    env: { ...process.env, ...env },
  });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

export function tempDir(label: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `imagekit-${label}-`));
}

export function dimensions(filePath: string): { width: number; height: number } {
  const result = Bun.spawnSync(["sips", "-g", "pixelWidth", "-g", "pixelHeight", filePath]);
  const output = result.stdout.toString();
  const width = Number(output.match(/pixelWidth: (\d+)/)?.[1] ?? 0);
  const height = Number(output.match(/pixelHeight: (\d+)/)?.[1] ?? 0);
  return { width, height };
}

export function metadata(filePath: string, field: string): string {
  const result = Bun.spawnSync(["exiftool", "-s3", `-${field}`, filePath]);
  return result.stdout.toString().trim();
}

export function fakeTool(dir: string, name: string, body: string): string {
  const toolPath = path.join(dir, name);
  fs.writeFileSync(toolPath, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  return toolPath;
}
