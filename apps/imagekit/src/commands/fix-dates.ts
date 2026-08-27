import fs from "node:fs";
import path from "node:path";
import { run, checkCmd } from "../utils";
import { autoDetect, matchFromPattern } from "../date-patterns";

interface FixDatesOptions {
  pattern?: string;
  recursive: boolean;
  dryRun: boolean;
  extensions?: string;
}

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

function createExifDateString(parts: { year: number; month: number; day: number; hour: number; minute: number; second: number }): string {
  return `${String(parts.year).padStart(4, "0")}:${String(parts.month).padStart(2, "0")}:${String(parts.day).padStart(2, "0")} ${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}:${String(parts.second).padStart(2, "0")}`;
}

function writeExifDate(filepath: string, dateParts: { year: number; month: number; day: number; hour: number; minute: number; second: number }): boolean {
  const dateStr = createExifDateString(dateParts);
  // Use exiftool to write; -overwrite_original to avoid backup
  // Write to common date tags: DateTimeOriginal, CreateDate, ModifyDate
  // Also FileModifyDate via exiftool?
  // For PNG, exiftool will add appropriate chunks.
  const args = [
    "exiftool",
    "-overwrite_original",
    `-DateTimeOriginal=${dateStr}`,
    `-CreateDate=${dateStr}`,
    `-ModifyDate=${dateStr}`,
    `-FileModifyDate=${dateStr}`,
    filepath,
  ];
  const r = run(args);
  if (r.exitCode !== 0) {
    console.error(`  ❌ Error writing EXIF to ${path.basename(filepath)}: ${r.stderr.trim() || r.stdout.trim()}`);
    return false;
  }
  return true;
}

export function cmdFixDates(directory: string, opts: FixDatesOptions): void {
  checkCmd("exiftool", "brew install exiftool");

  const extensions = parseExtensions(opts.extensions);
  const dir = directory ?? ".";
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    console.error(`Error: directory not found: ${dir}`);
    process.exit(1);
  }

  const images = findImages(dir, extensions, !!opts.recursive);
  if (images.length === 0) {
    console.log(`No images found in ${dir}`);
    return;
  }

  console.log(`\n📷  Found ${images.length} image(s) in ${dir}\n`);

  let fixed = 0;
  let skipped = 0;
  let errors = 0;

  for (const filepath of images) {
    const name = path.basename(filepath);
    let dateParts: ReturnType<typeof autoDetect> = null;
    try {
      if (opts.pattern) {
        dateParts = matchFromPattern(opts.pattern, name);
      } else {
        dateParts = autoDetect(name);
      }
    } catch (e) {
      console.error(`  ❌ Invalid pattern: ${e instanceof Error ? e.message : String(e)}`);
      process.exit(1);
    }

    if (!dateParts) {
      console.log(`  ⚠️  Could not parse date from: ${name}`);
      skipped++;
      continue;
    }

    const ds = dateParts;
    console.log(
      `  📷 ${name}\n     Extracted date: ${String(ds.year).padStart(4, "0")}-${String(ds.month).padStart(2, "0")}-${String(ds.day).padStart(2, "0")} ${String(ds.hour).padStart(2, "0")}:${String(ds.minute).padStart(2, "0")}:${String(ds.second).padStart(2, "0")}`,
    );

    if (opts.dryRun) {
      console.log("     (dry run — skipped)");
      fixed++;
      continue;
    }

    if (writeExifDate(filepath, dateParts)) {
      fixed++;
    } else {
      errors++;
    }
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(`  Fixed:    ${fixed}`);
  console.log(`  Skipped:  ${skipped}`);
  console.log(`  Errors:   ${errors}`);
  if (errors > 0) process.exitCode = 1;
}
