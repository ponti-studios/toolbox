#!/usr/bin/env node
import path from "node:path";
import { Command } from "commander";
import { cmdOptimize } from "./commands/optimize";
import { cmdResize } from "./commands/resize";
import { cmdStrip } from "./commands/strip";
import { cmdCrop } from "./commands/crop";
import { cmdConvert } from "./commands/convert";
import { cmdWeb } from "./commands/web";
import { cmdInfo } from "./commands/info";
import { cmdInstall } from "./commands/install";
import { cmdAnalyze } from "./commands/analyze";
import { cmdFixDates } from "./commands/fix-dates";
import { cmdRename } from "./commands/rename";
import { DATE_PATTERN_HELP } from "./date-patterns";

// Detect invocation name for help text: imagekit is primary, but support iconkit/photokit aliases
const invokedAs = path.basename(process.execPath).toLowerCase().includes("iconkit")
  ? "iconkit"
  : path.basename(process.execPath).toLowerCase().includes("photokit")
    ? "photokit"
    : "imagekit";

const program = new Command();

program
  .name(invokedAs === "imagekit" ? "imagekit" : invokedAs)
  .description(
    "Image asset toolkit — resize, optimize, analyze EXIF, fix dates, rename, and generate web icons from the command line",
  )
  .version("1.0.0");

// Keep primary name as imagekit for help, but allow alias detection for version output
// Ensure --version works regardless of invoked name
if (invokedAs !== "imagekit") {
  // Also register imagekit as alias name for error messages
}

program
  .command("analyze")
  .description("Analyze EXIF metadata from photos in a directory")
  .argument("[directory]", "Directory containing photos", ".")
  .option("--json", "Output as JSON")
  .option("--csv", "Output as CSV")
  .option("--geo", "Show only photos with GPS data")
  .option("--stats", "Show summary statistics")
  .option("-v, --verbose", "Show all EXIF details")
  .option("--no-progress", "Disable progress indicator")
  .option("-r, --recursive", "Recurse into subdirectories")
  .option("--extensions <list>", "Comma-separated file extensions")
  .action((directory: string, opts: Record<string, unknown>) => {
    cmdAnalyze(directory, {
      json: !!opts.json,
      csv: !!opts.csv,
      geo: !!opts.geo,
      stats: !!opts.stats,
      verbose: !!opts.verbose,
      recursive: !!opts.recursive,
      extensions: opts.extensions as string | undefined,
      noProgress: opts.progress === false,
    });
  });

program
  .command("fix-dates")
  .description("Restore EXIF date metadata from filenames in a photo directory.\n" + DATE_PATTERN_HELP)
  .argument("[directory]", "Directory containing photos", ".")
  .option("-p, --pattern <regex>", "Custom regex with named groups year, month, day (or year, doy)")
  .option("-r, --recursive", "Recurse into subdirectories")
  .option("-n, --dry-run", "Preview only — don't write EXIF data")
  .option("--extensions <list>", "Comma-separated file extensions")
  .action((directory: string, opts: Record<string, unknown>) => {
    cmdFixDates(directory, {
      pattern: opts.pattern as string | undefined,
      recursive: !!opts.recursive,
      dryRun: !!opts.dryRun,
      extensions: opts.extensions as string | undefined,
    });
  });

program
  .command("rename")
  .description("Rename photos in a directory to a normalized date-based filename.\n" + DATE_PATTERN_HELP)
  .argument("[directory]", "Directory containing photos", ".")
  .option("-p, --pattern <regex>", "Custom regex with named groups year, month, day (or year, doy)")
  .option(
    "-t, --template <tmpl>",
    "Output filename template with {year}, {month}, {day}, {hour}, {minute}, {second}, {seq}, {ext}",
    "{year}-{month:02d}-{day:02d}_{hour:02d}-{minute:02d}-{second:02d}",
  )
  .option("--collision <mode>", "How to handle collisions: increment | overwrite | skip", "increment")
  .option("-r, --recursive", "Recurse into subdirectories")
  .option("-n, --dry-run", "Preview only — don't rename")
  .option("--extensions <list>", "Comma-separated file extensions")
  .action((directory: string, opts: Record<string, unknown>) => {
    cmdRename(directory, {
      pattern: opts.pattern as string | undefined,
      template: opts.template as string,
      collision: opts.collision as string,
      recursive: !!opts.recursive,
      dryRun: !!opts.dryRun,
      extensions: opts.extensions as string | undefined,
    });
  });

program
  .command("optimize")
  .alias("opt")
  .description("Resize images and convert to WebP/AVIF")
  .option("-s, --size <WxH>", "Target dimensions", "500x500")
  .option("-q, --quality <number>", "WebP/AVIF quality 0–100", (v) => parseInt(v), 85)
  .option("-o, --output-dir <dir>", "Output directory")
  .option("-k, --keep-png", "Keep the resized PNG alongside WebP")
  .option("-f, --format <fmt>", "Output format: webp | avif | both | png", "webp")
  .option("-d, --dry-run", "Show what would be done without doing it")
  .argument("<files...>", "Input image files")
  .action((files: string[], opts: Record<string, unknown>) => {
    cmdOptimize(files, {
      size: opts.size as string,
      quality: opts.quality as number,
      outputDir: opts.outputDir as string | undefined,
      keepPng: !!opts.keepPng,
      format: opts.format as string,
      dryRun: !!opts.dryRun,
    });
  });

program
  .command("resize")
  .description("Resize images to specified dimensions")
  .requiredOption("-s, --size <WxH>", "Target dimensions (e.g. 200x200)")
  .option("-o, --output-dir <dir>", "Output directory")
  .option(
    "-f, --format <fmt>",
    "Output format: png | jpg | tiff | gif | bmp (default: same as input)",
  )
  .option("--suffix <str>", "Custom filename suffix (default: {width}x{height})")
  .option("-d, --dry-run", "Show what would be done without doing it")
  .argument("<files...>", "Input image files")
  .action((files: string[], opts: Record<string, unknown>) => {
    cmdResize(files, {
      size: opts.size as string,
      outputDir: opts.outputDir as string | undefined,
      format: opts.format as string | undefined,
      suffix: opts.suffix as string | undefined,
      dryRun: !!opts.dryRun,
    });
  });

program
  .command("strip")
  .description("Strip EXIF and metadata from images")
  .option("-d, --dry-run", "Show what would be done without doing it")
  .argument("<files...>", "Input image files")
  .action((files: string[], opts: Record<string, unknown>) => {
    cmdStrip(files, { dryRun: !!opts.dryRun });
  });

program
  .command("crop")
  .description("Crop images to exact dimensions or aspect ratio")
  .requiredOption(
    "-s, --size <WxH|RATIO>",
    "Target dimensions (e.g. 1200x630) or aspect ratio (e.g. 16:9)",
  )
  .option("-g, --gravity <dir>", "Crop gravity: center | north | south | west | east", "center")
  .option("-o, --output-dir <dir>", "Output directory")
  .option("-d, --dry-run", "Show what would be done without doing it")
  .argument("<files...>", "Input image files")
  .action((files: string[], opts: Record<string, unknown>) => {
    cmdCrop(files, {
      size: opts.size as string,
      gravity: opts.gravity as string,
      outputDir: opts.outputDir as string | undefined,
      dryRun: !!opts.dryRun,
    });
  });

program
  .command("convert")
  .description("Convert images between formats (PNG <-> JPG <-> TIFF <-> GIF <-> BMP)")
  .requiredOption("-f, --format <fmt>", "Output format: png | jpg | tiff | gif | bmp")
  .option("-o, --output-dir <dir>", "Output directory")
  .option("-d, --dry-run", "Show what would be done without doing it")
  .argument("<files...>", "Input image files")
  .action((files: string[], opts: Record<string, unknown>) => {
    cmdConvert(files, {
      format: opts.format as string,
      outputDir: opts.outputDir as string | undefined,
      dryRun: !!opts.dryRun,
    });
  });

program
  .command("web")
  .description("Generate favicon, app icons, and social-card assets")
  .option("-o, --output-dir <dir>", "Output directory")
  .argument("<source>", "Source image file")
  .action((source: string, opts: Record<string, unknown>) => {
    cmdWeb(source, { outputDir: opts.outputDir as string | undefined });
  });

program
  .command("info")
  .description("Show image dimensions and file sizes")
  .argument("<files...>", "Input image files")
  .action((files: string[]) => {
    cmdInfo(files);
  });

program
  .command("install")
  .description("Symlink imagekit into your PATH (with iconkit/photokit aliases)")
  .argument("[directory]", "Target directory")
  .action((dir: string | undefined) => {
    cmdInstall(dir);
  });

program.parse();
