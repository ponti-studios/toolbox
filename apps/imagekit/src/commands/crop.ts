import path from "node:path";
import fs from "node:fs";
import { run, checkCmd, resolveFiles, getFileSize, fmtSize, ensureDir, stripExt } from "../utils";

interface CropOptions {
  size: string;
  gravity?: string;
  outputDir?: string;
  dryRun: boolean;
}

const GRAVITIES = ["center", "north", "south", "west", "east"];
const GRAVITY_MAGICK: Record<string, string> = {
  center: "Center",
  north: "North",
  south: "South",
  west: "West",
  east: "East",
};

function parseRatio(s: string): { num: number; den: number } | null {
  const m = s.match(/^(\d+):(\d+)$/);
  if (!m) return null;
  return { num: parseInt(m[1]!), den: parseInt(m[2]!) };
}

function getSipsPixelDim(filePath: string, key: string): number {
  const r = run(["sips", "-g", key, filePath]);
  if (r.exitCode !== 0) return 0;
  const m = r.stdout.toString().match(new RegExp(`${key}: (\\d+)`));
  return m ? parseInt(m[1]!) : 0;
}

export function cmdCrop(files: string[], opts: CropOptions): void {
  const inputs = resolveFiles(files);
  if (inputs.length === 0) {
    console.error("Error: no valid input files");
    process.exit(1);
  }

  const gravity = opts.gravity ?? "center";
  if (!GRAVITIES.includes(gravity)) {
    console.error(`Error: invalid gravity '${gravity}'. Use: ${GRAVITIES.join(", ")}`);
    process.exit(1);
  }

  const needsMagick = gravity !== "center";

  checkCmd("sips", "part of macOS");
  if (needsMagick) checkCmd("magick", "brew install imagemagick");

  const pxMatch = opts.size.match(/^(\d+)x(\d+)$/);
  const ratioMatch = parseRatio(opts.size);

  if (!pxMatch && !ratioMatch) {
    console.error("Error: invalid size. Use WxH (e.g. 1200x630) or A:B (e.g. 16:9)");
    process.exit(1);
  }

  const dryRun = opts.dryRun;
  let cropped = 0,
    skipped = 0;

  const mode = pxMatch ? "pixels" : "ratio";
  const label = mode === "pixels" ? opts.size : `${opts.size} crop`;

  console.log("── imagekit crop ────────────────────────────");
  console.log(`  files:   ${inputs.length}`);
  console.log(`  target:  ${label}`);
  console.log(`  gravity: ${gravity}`);
  console.log("──");

  for (const src of inputs) {
    const dir = path.dirname(src);
    const base = stripExt(src);
    const outdir = opts.outputDir ?? dir;

    if (dryRun) {
      console.log(`  [dry] ${path.basename(src)} → ${gravity} ${label}`);
      continue;
    }

    ensureDir(outdir);

    const srcW = getSipsPixelDim(src, "pixelWidth");
    const srcH = getSipsPixelDim(src, "pixelHeight");
    if (srcW === 0 || srcH === 0) {
      console.warn(`Warning: could not read dimensions: ${path.basename(src)}`);
      skipped++;
      continue;
    }

    let cropW: number, cropH: number;
    if (pxMatch) {
      cropW = parseInt(pxMatch[1]!);
      cropH = parseInt(pxMatch[2]!);
    } else {
      const ratio = ratioMatch!;
      if (ratio.num / ratio.den > srcW / srcH) {
        cropW = srcW;
        cropH = Math.round((srcW * ratio.den) / ratio.num);
      } else {
        cropH = srcH;
        cropW = Math.round((srcH * ratio.num) / ratio.den);
      }
    }

    const suffix = `${cropW}x${cropH}`;
    const outName = `${base}.${suffix}.png`;
    const outPath = path.join(outdir, outName);

    if (fs.existsSync(outPath)) {
      skipped++;
      console.log(`  - ${outName}  (already exists, skipped)`);
      continue;
    }

    let r;
    if (!needsMagick) {
      r = run(["sips", "--cropToHeightWidth", String(cropH), String(cropW), src, "--out", outPath]);
    } else {
      r = run([
        "magick",
        src,
        "-gravity",
        GRAVITY_MAGICK[gravity]!,
        "-crop",
        `${cropW}x${cropH}+0+0`,
        outPath,
      ]);
    }

    if (r.exitCode !== 0) {
      console.warn(`Warning: crop failed: ${path.basename(src)}`);
      skipped++;
      continue;
    }

    cropped++;
    const bytes = getFileSize(outPath);
    console.log(`  ✓ ${outName}  (${fmtSize(bytes)})`);
  }

  console.log("── done ──────────────────────────────────────");
  if (dryRun) {
    console.log("  (dry run — no files written)");
  } else {
    console.log(`  cropped: ${cropped} | skipped: ${skipped}`);
  }
}
