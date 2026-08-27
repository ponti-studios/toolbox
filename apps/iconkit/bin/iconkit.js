#!/usr/bin/env node
// Compatibility shim: delegates to @ponti-studios/imagekit
import { createRequire } from "node:module";
import path from "node:path";
import { spawnSync } from "node:child_process";

// Resolve imagekit entrypoint via package
let entry;
try {
  const require = createRequire(import.meta.url);
  entry = require.resolve("@ponti-studios/imagekit/dist/imagekit.js");
} catch {
  // Fallback: try relative to toolbox monorepo when developing locally
  const local = path.resolve(import.meta.dirname, "../../imagekit/dist/imagekit.js");
  const fs = await import("node:fs");
  if (fs.existsSync(local)) entry = local;
}

if (!entry) {
  console.error("Error: @ponti-studios/imagekit not found. Install it with: npm install -g @ponti-studios/imagekit");
  process.exit(1);
}

const result = spawnSync(process.execPath, [entry, ...process.argv.slice(2)], { stdio: "inherit" });
process.exit(result.status ?? 1);
