import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FIXTURES, fakeTool, runIconkit, tempDir } from "../test-support";

const temporaryDirs: string[] = [];

afterEach(() => {
  while (temporaryDirs.length > 0) {
    fs.rmSync(temporaryDirs.pop()!, { recursive: true, force: true });
  }
});

describe("iconkit optimize", () => {
  test("rejects unsupported formats before writing output", () => {
    const output = tempDir("optimize-invalid");
    temporaryDirs.push(output);
    const source = path.join(FIXTURES, "rgb-landscape.png");
    const result = runIconkit(["optimize", "-f", "jpeg", "-o", output, source]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("unsupported format");
    expect(fs.existsSync(path.join(output, "rgb-landscape.500x500.png"))).toBe(false);
  });

  test("retains the PNG intermediate when the encoder fails", () => {
    const output = tempDir("optimize-failure");
    const fakeBin = tempDir("optimize-tools");
    temporaryDirs.push(output, fakeBin);
    const source = path.join(FIXTURES, "rgb-landscape.png");
    fakeTool(fakeBin, "cwebp", "exit 1");

    const result = runIconkit(["optimize", "-f", "webp", "-o", output, source], {
      PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("WebP conversion failed");
    expect(fs.existsSync(path.join(output, "rgb-landscape.500x500.png"))).toBe(true);
    expect(fs.existsSync(path.join(output, "rgb-landscape.500x500.webp"))).toBe(false);
  });
});
