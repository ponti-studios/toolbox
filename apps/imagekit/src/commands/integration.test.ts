import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  APP_DIR,
  BIN,
  FIXTURES,
  dimensions,
  fakeTool,
  metadata,
  runIconkit,
  runSource,
  tempDir,
} from "../test-support";

const temporaryDirs: string[] = [];

function outputDir(label: string): string {
  const dir = tempDir(label);
  temporaryDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (temporaryDirs.length > 0) {
    fs.rmSync(temporaryDirs.pop()!, { recursive: true, force: true });
  }
});

describe("iconkit binary fixture matrix", () => {
  test("reports dimensions for the committed fixture corpus", () => {
    const result = runIconkit([
      "info",
      path.join(FIXTURES, "rgb-landscape.png"),
      path.join(FIXTURES, "rgb-portrait.png"),
      path.join(FIXTURES, "transparent-rgba.png"),
      path.join(FIXTURES, "metadata-exif.jpg"),
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("1600x900");
    expect(result.stdout).toContain("900x1600");
    expect(result.stdout).toContain("512x512");
    expect(result.stdout).toContain("640x480");
  });

  test("rejects directories as image inputs", () => {
    const result = runIconkit(["info", FIXTURES]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("no valid input files");
  });

  test("reports malformed image inputs without creating output", () => {
    const output = outputDir("malformed");
    const result = runIconkit([
      "convert",
      "-f",
      "jpg",
      "-o",
      output,
      path.join(FIXTURES, "malformed.png"),
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("convert failed");
    expect(fs.existsSync(path.join(output, "malformed.jpg"))).toBe(false);
  });

  test("resizes assets with spaces and multiple dots in their names", () => {
    const output = outputDir("filename");
    const source = path.join(FIXTURES, "asset with spaces.v1.png");
    const result = runIconkit(["resize", "-s", "320x180", "-o", output, source]);
    const generated = path.join(output, "asset with spaces.v1.320x180.png");

    expect(result.exitCode).toBe(0);
    expect(fs.existsSync(generated)).toBe(true);
    expect(dimensions(generated)).toEqual({ width: 320, height: 180 });
  });

  test("crops every supported gravity to exact dimensions", () => {
    for (const gravity of ["center", "north", "south", "east", "west"]) {
      const output = outputDir(`crop-${gravity}`);
      const result = runIconkit([
        "crop",
        "-s",
        "320x320",
        "-g",
        gravity,
        "-o",
        output,
        path.join(FIXTURES, "rgb-landscape.png"),
      ]);
      const generated = path.join(output, "rgb-landscape.320x320.png");

      expect(result.exitCode).toBe(0);
      expect(dimensions(generated)).toEqual({ width: 320, height: 320 });
    }
  });

  test("converts TIFF and GIF fixtures to supported formats", () => {
    const output = outputDir("formats");
    const gifOutput = path.join(output, "gif");
    const tiff = path.join(FIXTURES, "conversion-source.tiff");
    const gif = path.join(FIXTURES, "conversion-source.gif");

    for (const format of ["png", "jpg", "tiff", "gif", "bmp"]) {
      const result = runIconkit(["convert", "-f", format, tiff, "-o", output]);
      expect(result.exitCode).toBe(0);
      expect(fs.existsSync(path.join(output, `conversion-source.${format}`))).toBe(true);
    }

    const gifResult = runIconkit(["convert", "-f", "png", gif, "-o", gifOutput]);
    expect(gifResult.exitCode).toBe(0);
    expect(dimensions(path.join(gifOutput, "conversion-source.png"))).toEqual({
      width: 900,
      height: 1600,
    });
  });

  test("strips EXIF fields while preserving image dimensions", () => {
    const output = outputDir("metadata");
    const source = path.join(FIXTURES, "metadata-exif.jpg");
    const copy = path.join(output, "metadata-exif.jpg");
    fs.copyFileSync(source, copy);
    expect(metadata(copy, "Artist")).toBe("Ponti Studios");

    const result = runIconkit(["strip", copy]);
    expect(result.exitCode).toBe(0);
    expect(metadata(copy, "Artist")).toBe("");
    expect(metadata(copy, "Description")).toBe("");
    expect(dimensions(copy)).toEqual({ width: 640, height: 480 });
  });

  test("optimizes WebP while retaining PNG when requested and skipping existing output", () => {
    const output = outputDir("optimize");
    const source = path.join(FIXTURES, "rgb-landscape.png");
    const args = ["optimize", "-s", "800x450", "-f", "webp", "-k", "-o", output, source];
    const first = runIconkit(args);
    const png = path.join(output, "rgb-landscape.800x450.png");
    const webp = path.join(output, "rgb-landscape.800x450.webp");

    expect(first.exitCode).toBe(0);
    expect(fs.existsSync(png)).toBe(true);
    expect(fs.existsSync(webp)).toBe(true);
    expect(dimensions(webp)).toEqual({ width: 800, height: 450 });

    const before = fs.statSync(webp).mtimeMs;
    const second = runIconkit(args);
    expect(second.exitCode).toBe(0);
    expect(fs.statSync(webp).mtimeMs).toBe(before);
  });

  test("optimizes AVIF through the encoder boundary", () => {
    const output = outputDir("avif");
    const fakeBin = outputDir("avif-tools");
    fakeTool(fakeBin, "avifenc", 'touch "$4"');
    const result = runIconkit(
      [
        "optimize",
        "-s",
        "640x360",
        "-f",
        "avif",
        "-o",
        output,
        path.join(FIXTURES, "rgb-landscape.png"),
      ],
      { PATH: `${fakeBin}:${process.env.PATH ?? ""}` },
    );

    expect(result.exitCode).toBe(0);
    expect(fs.existsSync(path.join(output, "rgb-landscape.640x360.avif"))).toBe(true);
  });

  test("reports web generation failures without claiming success", () => {
    const output = outputDir("web-failure");
    const fakeBin = outputDir("magick-tools");
    fakeTool(fakeBin, "magick", "exit 1");
    const result = runIconkit(["web", path.join(FIXTURES, "transparent-rgba.png"), "-o", output], {
      PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("failed to generate");
    expect(result.stdout).toContain("failed:");
  });

  test("handles compiled installation conflicts without crashing", () => {
    const output = outputDir("install");
    const destination = path.join(output, "iconkit");
    fs.writeFileSync(destination, "existing file");
    const result = runIconkit(["install", output]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("already exists");
  });

  test("installs the compiled binary and recognizes an existing symlink", () => {
    const output = outputDir("install-link");
    const first = runIconkit(["install", output]);
    const second = runIconkit(["install", output]);
    const destination = path.join(output, "iconkit");

    expect(first.exitCode).toBe(0);
    expect(second.exitCode).toBe(0);
    expect(fs.readlinkSync(destination)).toBe(BIN);
  });

  test("installs a Node-targeted wrapper and executes it", () => {
    const output = outputDir("install-node");
    const result = runSource(["install", output]);
    const destination = path.join(output, "iconkit");
    const version = Bun.spawnSync([destination, "--version"], { env: { ...process.env } });

    expect(result.exitCode).toBe(0);
    expect(fs.readFileSync(destination, "utf8")).toContain(APP_DIR);
    expect(version.exitCode).toBe(0);
    expect(version.stdout.toString().trim()).toBe("1.0.0");
  });

  test("handles a broken existing symlink without crashing", () => {
    const output = outputDir("install-broken-link");
    const destination = path.join(output, "iconkit");
    fs.symlinkSync(path.join(output, "missing-binary"), destination);
    const result = runIconkit(["install", output]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("already exists");
  });
});
