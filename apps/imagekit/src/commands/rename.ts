import fs from "node:fs";
import path from "node:path";
import { autoDetect, matchFromPattern } from "../date-patterns";

interface RenameOptions {
  pattern?: string;
  template: string;
  collision: string;
  recursive: boolean;
  dryRun: boolean;
  extensions?: string;
}

const DEFAULT_TEMPLATE = "{year}-{month:02d}-{day:02d}_{hour:02d}-{minute:02d}-{second:02d}";

const DEFAULT_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".tiff",
  ".tif",
  ".heic",
  ".heif",
  ".webp",
]);

function parseExtensions(extStr?: string): Set<string> {
  if (!extStr) return DEFAULT_EXTENSIONS;
  const set = new Set<string>();
  for (const e of extStr.split(",")) {
    const trimmed = e.trim().toLowerCase();
    if (!trimmed) continue;
    const withDot = trimmed.startsWith(".") ? trimmed : `.${trimmed}`;
    set.add(withDot);
  }
  return set.size > 0 ? set : DEFAULT_EXTENSIONS;
}

function findImages(directory: string, extensions: Set<string>, recursive: boolean): string[] {
  const results: string[] = [];
  const dir = path.resolve(directory);

  function walk(current: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith("._")) continue;
      const full = path.join(current, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (recursive) walk(full);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (extensions.has(ext)) results.push(full);
      }
    }
  }

  walk(dir);
  return results.sort();
}

function renderTemplate(template: string, parts: Record<string, number | string>, seq?: number | null, ext?: string): string {
  // Support Python-style format specs: {year}, {month:02d}, {day:02d}, etc.
  // We translate {key:02d} -> zero-padded number
  const ctx: Record<string, unknown> = { ...parts };
  ctx["ext"] = ext ?? "";
  ctx["seq"] = seq ?? 0;

  // Replace each {key[:format]} with value
  // Supported format: 02d, 2d, d
  return template.replace(/\{(\w+)(?::([^}]+))?\}/g, (_match, key: string, fmt: string | undefined) => {
    const val = ctx[key];
    if (val === undefined) {
      throw new Error(`Unknown template placeholder: ${key}`);
    }
    if (fmt) {
      // Handle integer formatting like 02d, 04d
      const m = fmt.match(/^0?(\d+)d$/);
      if (m) {
        const width = parseInt(m[1]!, 10);
        const num = typeof val === "number" ? val : parseInt(String(val), 10);
        if (Number.isNaN(num)) return String(val);
        return String(num).padStart(width, "0");
      }
      // Fallback: just string
      return String(val);
    }
    return String(val);
  });
}

export function cmdRename(directory: string, opts: RenameOptions): void {
  const extensions = parseExtensions(opts.extensions);
  const dir = path.resolve(directory ?? ".");
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    console.error(`Error: directory not found: ${directory}`);
    process.exit(1);
  }

  const template = opts.template ?? DEFAULT_TEMPLATE;
  const collision = opts.collision ?? "increment";

  const images = findImages(dir, extensions, !!opts.recursive);
  if (images.length === 0) {
    console.log(`No images found in ${dir}`);
    return;
  }

  console.log(`\n📷  Found ${images.length} image(s) in ${dir}\n`);

  // Pre-scan to count collisions for template without seq
  const timestampCounts = new Map<string, number>();
  const datePartsByPath = new Map<string, (ReturnType<typeof autoDetect>)>();

  for (const filepath of images) {
    const name = path.basename(filepath);
    let parts: ReturnType<typeof autoDetect> = null;
    try {
      if (opts.pattern) {
        parts = matchFromPattern(opts.pattern, name);
      } else {
        parts = autoDetect(name);
      }
    } catch (e) {
      console.error(`  ❌ Invalid pattern: ${e instanceof Error ? e.message : String(e)}`);
      process.exit(1);
    }
    datePartsByPath.set(filepath, parts);
    if (parts) {
      const ext = path.extname(filepath).toLowerCase();
      const key = renderTemplate(template, parts as unknown as Record<string, number>, null, ext);
      // The key includes extension? In python, they included ext when counting
      // python: key = render_template(template, parts, ext=filepath.suffix.lower())
      // That extension will be interpolated only if template contains {ext}
      // Otherwise ext not in key but they still used it; We'll follow same: if template contains {ext}, then key distinct per ext
      // Otherwise same key regardless of ext will still count
      timestampCounts.set(key, (timestampCounts.get(key) ?? 0) + 1);
    }
  }

  let renamed = 0;
  let unchanged = 0;
  let skipped = 0;
  let errors = 0;
  const seqCounter = new Map<string, number>();

  for (const filepath of images) {
    const parts = datePartsByPath.get(filepath);
    if (!parts) {
      console.log(`  ⚠️  Could not parse date from: ${path.basename(filepath)}`);
      skipped++;
      continue;
    }

    const ext = path.extname(filepath).toLowerCase();
    const baseKey = renderTemplate(template, parts as unknown as Record<string, number>, null, ext);
    const totalForKey = timestampCounts.get(baseKey) ?? 0;
    const seqCount = (seqCounter.get(baseKey) ?? 0) + 1;
    seqCounter.set(baseKey, seqCount);
    const seq = seqCount;

    let newName: string;
    if (totalForKey > 1) {
      newName = renderTemplate(template, parts as unknown as Record<string, number>, seq, ext);
      // If template doesn't contain seq, need to ensure uniqueness anyway
      if (newName === baseKey && seq > 1) {
        // Append seq manually if collision would remain
        const stem = path.basename(newName, ext);
        newName = `${stem}_${String(seq).padStart(4, "0")}${ext}`;
      }
    } else {
      newName = renderTemplate(template, parts as unknown as Record<string, number>, null, ext);
      // If template lacks {ext}, add ext
      if (!template.includes("{ext}") && !newName.toLowerCase().endsWith(ext)) {
        newName = `${newName}${ext}`;
      }
    }

    // Ensure newName has extension if template didn't include it
    if (!path.extname(newName)) {
      newName = `${newName}${ext}`;
    }

    const newPath = path.join(dir, newName);

    if (path.resolve(newPath) === path.resolve(filepath)) {
      unchanged++;
      continue;
    }

    if (fs.existsSync(newPath) && path.resolve(newPath) !== path.resolve(filepath)) {
      if (collision === "skip") {
        console.log(`  ⚠️  Collision — skipping: ${path.basename(filepath)}`);
        skipped++;
        continue;
      } else if (collision === "overwrite") {
        // allow overwrite
      } else {
        // increment
        const safeBase = path.basename(newName, ext);
        let candidate = `${safeBase}_${String(seq).padStart(4, "0")}${ext}`;
        let candidatePath = path.join(dir, candidate);
        let extraSeq = seq;
        while (fs.existsSync(candidatePath) && path.resolve(candidatePath) !== path.resolve(filepath)) {
          // Append hash of original name modulo 10000 as python did
          let hash = 0;
          for (let i = 0; i < filepath.length; i++) hash = (hash * 31 + filepath.charCodeAt(i)) % 10000;
          candidate = `${safeBase}_${String(extraSeq).padStart(4, "0")}_${String(hash).padStart(4, "0")}${ext}`;
          candidatePath = path.join(dir, candidate);
          extraSeq++;
          if (extraSeq > seq + 10) break;
        }
        newName = candidate;
      }
    }

    const finalPath = path.join(dir, newName);

    if (opts.dryRun) {
      const displayOld = path.basename(filepath).slice(0, 60);
      const displayNew = newName.slice(0, 60);
      console.log(`  🔄 ${displayOld}  →  ${displayNew}`);
      renamed++;
      continue;
    }

    try {
      fs.renameSync(filepath, finalPath);
      console.log(`  ✅ ${path.basename(filepath).slice(0, 60)}  →  ${newName.slice(0, 60)}`);
      renamed++;
    } catch (exc) {
      console.error(`  ❌ Error renaming ${path.basename(filepath)}: ${exc instanceof Error ? exc.message : String(exc)}`);
      errors++;
    }
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(`  Renamed:   ${renamed}`);
  console.log(`  Unchanged: ${unchanged}`);
  console.log(`  Skipped:   ${skipped}`);
  console.log(`  Errors:    ${errors}`);
  if (errors > 0) process.exitCode = 1;
}
