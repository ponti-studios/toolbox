#!/usr/bin/env node
import { Command } from "commander";
import { cmdOptimize } from "./commands/optimize";
import { cmdResize } from "./commands/resize";
import { cmdStrip } from "./commands/strip";
import { cmdCrop } from "./commands/crop";
import { cmdConvert } from "./commands/convert";
import { cmdWeb } from "./commands/web";
import { cmdInfo } from "./commands/info";
import { cmdInstall } from "./commands/install";

const program = new Command();

program
  .name("iconkit")
  .description(
    "Image asset toolkit — resize, optimize, and generate web icons from the command line",
  )
  .version("1.0.0");

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
  .description("Symlink iconkit into your PATH")
  .argument("[directory]", "Target directory")
  .action((dir: string | undefined) => {
    cmdInstall(dir);
  });

program.parse();
