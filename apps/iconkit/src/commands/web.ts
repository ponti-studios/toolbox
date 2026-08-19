import path from "node:path";
import fs from "node:fs";
import { run, checkCmd, ensureDir } from "../utils";

interface WebOptions {
  outputDir?: string;
}

export function cmdWeb(source: string, opts: WebOptions): void {
  if (!fs.existsSync(source)) {
    console.error(`Error: file not found: ${source}`);
    process.exit(1);
  }

  checkCmd("magick", "brew install imagemagick");

  const outdir = opts.outputDir ?? path.join(path.dirname(source), "icons");
  ensureDir(outdir);

  console.log(`Generating web icons from ${source} → ${outdir}/`);

  const webRun = (size: number | string, name: string) => {
    run(["magick", source, "-resize", `${size}x${size}`, path.join(outdir, name)]);
  };

  for (const s of [16, 32, 48, 96]) webRun(s, `favicon-${s}x${s}.png`);
  run(["magick", source, "-define", "icon:auto-resize=16,32,48", path.join(outdir, "favicon.ico")]);

  for (const s of [57, 60, 72, 76, 114, 120, 144, 152, 180])
    webRun(s, `apple-touch-icon-${s}x${s}.png`);
  fs.cpSync(
    path.join(outdir, "apple-touch-icon-180x180.png"),
    path.join(outdir, "apple-touch-icon.png"),
  );

  for (const s of [36, 48, 72, 96, 144, 192]) webRun(s, `android-icon-${s}x${s}.png`);
  for (const s of [192, 384, 512]) webRun(s, `icon-${s}x${s}.png`);
  for (const s of [70, 144, 150, 310]) webRun(s, `ms-icon-${s}x${s}.png`);

  for (const name of ["og-image", "twitter-card"]) {
    run([
      "magick",
      source,
      "-resize",
      "1200x630^",
      "-gravity",
      "center",
      "-extent",
      "1200x630",
      path.join(outdir, `${name}.jpg`),
    ]);
  }

  const count = fs.readdirSync(outdir).length;
  console.log(`Done — ${count} assets in ${outdir}`);
}
