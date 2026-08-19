import path from "node:path";
import fs from "node:fs";
import {
  run,
  parseSize,
  checkCmd,
  resolveFiles,
  getFileSize,
  fmtSize,
  ensureDir,
  stripExt,
} from "../utils";

interface OptimizeOptions {
  size: string;
  quality: number;
  outputDir?: string;
  keepPng: boolean;
  format: string;
  dryRun: boolean;
}

export function cmdOptimize(files: string[], opts: OptimizeOptions): void {
  const inputs = resolveFiles(files);
  if (inputs.length === 0) {
    console.error("Error: no valid input files");
    process.exit(1);
  }

  checkCmd("sips", "part of macOS");
  if (opts.format === "webp" || opts.format === "both") checkCmd("cwebp", "brew install webp");
  if (opts.format === "avif" || opts.format === "both") checkCmd("avifenc", "brew install libavif");

  const { width, height } = parseSize(opts.size);
  const q = opts.quality;
  const fmt = opts.format;
  const dryRun = opts.dryRun;
  const keepPng = opts.keepPng;

  let resized = 0,
    webpOk = 0,
    avifOk = 0,
    skipped = 0;

  console.log("── iconkit optimize ─────────────────────────");
  console.log(`  files:   ${inputs.length}`);
  console.log(`  size:    ${width}x${height}`);
  console.log(`  quality: ${q}`);
  console.log(`  format:  ${fmt}`);
  console.log("──");

  for (const src of inputs) {
    const dir = path.dirname(src);
    const base = stripExt(src);
    const outdir = opts.outputDir ?? dir;
    const suffix = `${width}x${height}`;
    const resizedPng = path.join(outdir, `${base}.${suffix}.png`);
    const webpOut = path.join(outdir, `${base}.${suffix}.webp`);
    const avifOut = path.join(outdir, `${base}.${suffix}.avif`);

    if (dryRun) {
      console.log(`  [dry] ${src} → ${width}x${height}`);
      if (keepPng || fmt === "png") console.log(`  [dry]   └─ ${resizedPng}`);
      if (fmt === "webp" || fmt === "both") console.log(`  [dry]   └─ ${webpOut}`);
      if (fmt === "avif") console.log(`  [dry]   └─ ${avifOut}`);
      continue;
    }

    ensureDir(outdir);

    if (!fs.existsSync(resizedPng)) {
      const r = run(["sips", "-z", String(height), String(width), src, "--out", resizedPng]);
      if (r.exitCode !== 0) {
        console.warn(`Warning: resize failed: ${src}`);
        skipped++;
        continue;
      }
      resized++;
    } else {
      skipped++;
    }

    if ((fmt === "webp" || fmt === "both") && !fs.existsSync(webpOut)) {
      run(["cwebp", "-q", String(q), resizedPng, "-o", webpOut]);
      webpOk++;
    }

    if ((fmt === "avif" || fmt === "both") && !fs.existsSync(avifOut)) {
      run(["avifenc", "-q", String(q), resizedPng, avifOut]);
      avifOk++;
    }

    if (!keepPng && fmt !== "png") {
      fs.unlinkSync(resizedPng);
    }

    if ((fmt === "webp" || fmt === "both") && fs.existsSync(webpOut)) {
      const srcBytes = getFileSize(src);
      const outBytes = getFileSize(webpOut);
      const pct = 100 - Math.round((outBytes * 100) / srcBytes);
      console.log(`  ✓ ${base}.${suffix}.webp  (${fmtSize(outBytes)}, ${pct}% vs source)`);
    }
    if ((fmt === "avif" || fmt === "both") && fs.existsSync(avifOut)) {
      const outBytes = getFileSize(avifOut);
      console.log(`  ✓ ${base}.${suffix}.avif  (${fmtSize(outBytes)})`);
    }
  }

  console.log("── done ──────────────────────────────────────");
  if (dryRun) {
    console.log("  (dry run — no files written)");
  } else {
    console.log(`  resized: ${resized} | webp: ${webpOk} | avif: ${avifOk} | skipped: ${skipped}`);
  }
}
