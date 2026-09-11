import path from "node:path";
import fs from "node:fs";
import { run, checkCmd, ensureDir, isRegularFile } from "../utils";

interface WebOptions {
  outputDir?: string;
  /** Background color (any ImageMagick color spec) to flatten onto and pad with.
   *  Omit to keep the source's own transparency (legacy behavior). Required for
   *  icons that must be fully opaque (apple-touch-icon) or safely maskable (PWA
   *  icon-*, android-icon-*) when the source art doesn't already bleed edge to edge. */
  bg?: string;
  /** Fraction (0-1) of the canvas the source content should occupy when `bg` is
   *  set — the rest is padding, keeping content inside the safe zone that OS
   *  icon masks (circle, squircle, rounded square) crop to. Ignored without `bg`. */
  safeZone?: number;
}

export function cmdWeb(source: string, opts: WebOptions): void {
  if (!isRegularFile(source)) {
    console.error(`Error: file not found: ${source}`);
    process.exit(1);
  }

  checkCmd("magick", "brew install imagemagick");

  const outdir = opts.outputDir ?? path.join(path.dirname(source), "icons");
  ensureDir(outdir);

  const bg = opts.bg;
  const safeZone = Math.min(1, Math.max(0.1, opts.safeZone ?? 0.8));

  console.log(`Generating web icons from ${source} → ${outdir}/`);
  if (bg) {
    console.log(`  background: ${bg}, safe zone: ${Math.round(safeZone * 100)}%`);
  }

  let failed = 0;

  // Square icon: content resized to fit the safe zone and centered on a
  // full-bleed opaque background, so any OS mask (circle/squircle/rounded
  // square) never clips it and never reveals transparency as stray white/black.
  const paddedArgs = (size: number) => {
    const target = Math.max(1, Math.round(size * safeZone));
    return [
      "-trim",
      "+repage",
      "-resize",
      `${target}x${target}`,
      "-background",
      bg as string,
      "-flatten",
      "-gravity",
      "center",
      "-extent",
      `${size}x${size}`,
      "-alpha",
      "remove",
      "-alpha",
      "off",
    ];
  };

  // Legacy behavior: cover-crop to size, keeping source transparency as-is.
  const coverArgs = (size: number) => [
    "-resize",
    `${size}x${size}^`,
    "-gravity",
    "center",
    "-extent",
    `${size}x${size}`,
  ];

  const webRun = (size: number, name: string) => {
    const output = path.join(outdir, name);
    const result = run(["magick", source, ...(bg ? paddedArgs(size) : coverArgs(size)), output]);
    if (result.exitCode !== 0 || !fs.existsSync(output)) {
      console.warn(`Warning: failed to generate ${name}`);
      failed++;
    }
  };

  for (const s of [16, 32, 48, 96]) webRun(s, `favicon-${s}x${s}.png`);
  const favicon = path.join(outdir, "favicon.ico");
  const faviconArgs = bg ? paddedArgs(48) : [];
  const faviconResult = run([
    "magick",
    source,
    ...faviconArgs,
    "-define",
    "icon:auto-resize=16,32,48",
    favicon,
  ]);
  if (faviconResult.exitCode !== 0 || !fs.existsSync(favicon)) {
    console.warn("Warning: failed to generate favicon.ico");
    failed++;
  }

  for (const s of [57, 60, 72, 76, 114, 120, 144, 152, 180])
    webRun(s, `apple-touch-icon-${s}x${s}.png`);
  const appleSource = path.join(outdir, "apple-touch-icon-180x180.png");
  if (fs.existsSync(appleSource)) {
    try {
      fs.copyFileSync(appleSource, path.join(outdir, "apple-touch-icon.png"));
    } catch {
      console.warn("Warning: failed to generate apple-touch-icon.png");
      failed++;
    }
  }

  for (const s of [36, 48, 72, 96, 144, 192]) webRun(s, `android-icon-${s}x${s}.png`);
  for (const s of [192, 384, 512]) webRun(s, `icon-${s}x${s}.png`);
  for (const s of [70, 144, 150, 310]) webRun(s, `ms-icon-${s}x${s}.png`);

  for (const name of ["og-image", "twitter-card"]) {
    const result = run([
      "magick",
      source,
      "-resize",
      "1200x630^",
      ...(bg ? ["-background", bg, "-flatten"] : []),
      "-gravity",
      "center",
      "-extent",
      "1200x630",
      path.join(outdir, `${name}.jpg`),
    ]);
    if (result.exitCode !== 0 || !fs.existsSync(path.join(outdir, `${name}.jpg`))) {
      console.warn(`Warning: failed to generate ${name}.jpg`);
      failed++;
    }
  }

  const count = fs.readdirSync(outdir).length;
  console.log(`Done — ${count} assets in ${outdir}`);
  if (failed > 0) {
    console.log(`  failed:  ${failed}`);
    process.exitCode = 1;
  }
}
