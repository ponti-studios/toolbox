import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import fs from "node:fs"
import path from "node:path"
import { BIN } from "../test-support"

const TMP = "/tmp/iconkit-test-convert"

const MINIMAL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYPgPAAEDAQAIicLsAAAAAElFTkSuQmCC",
  "base64",
)

function run(args: string[]): { exitCode: number; stdout: string; stderr: string } {
  const result = Bun.spawnSync([BIN, ...args], { env: { ...process.env } })
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }
}

function dims(filePath: string): string {
  const r = Bun.spawnSync(["sips", "-g", "pixelWidth", "-g", "pixelHeight", filePath])
  const out = r.stdout.toString()
  const w = out.match(/pixelWidth: (\d+)/)?.[1] ?? "?"
  const h = out.match(/pixelHeight: (\d+)/)?.[1] ?? "?"
  return `${w}x${h}`
}

function createSource(name: string, w = 100, h = 100): string {
  const p = path.join(TMP, name)
  const tmp1x1 = path.join(TMP, "_1x1.png")
  fs.writeFileSync(tmp1x1, MINIMAL_PNG)
  Bun.spawnSync(["sips", "-z", String(h), String(w), tmp1x1, "--out", p])
  return p
}

beforeAll(() => {
  fs.mkdirSync(TMP, { recursive: true })
})

afterAll(() => {
  fs.rmSync(TMP, { recursive: true, force: true })
})

describe("iconkit convert", () => {
  test("converts PNG to JPG", () => {
    const src = createSource("to-jpg.png")
    const result = run(["convert", "-f", "jpg", src, "-o", TMP])
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("✓")
    const outPath = path.join(TMP, "to-jpg.jpg")
    expect(fs.existsSync(outPath)).toBe(true)
    expect(dims(outPath)).toBe("100x100")
  })

  test("converts PNG to TIFF", () => {
    const src = createSource("to-tiff.png")
    const result = run(["convert", "-f", "tiff", src, "-o", TMP])
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("✓")
    expect(fs.existsSync(path.join(TMP, "to-tiff.tiff"))).toBe(true)
  })

  test("converts PNG to BMP", () => {
    const src = createSource("to-bmp.png")
    const result = run(["convert", "-f", "bmp", src, "-o", TMP])
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("✓")
    expect(fs.existsSync(path.join(TMP, "to-bmp.bmp"))).toBe(true)
  })

  test("converts PNG to GIF", () => {
    const src = createSource("to-gif.png")
    const result = run(["convert", "-f", "gif", src, "-o", TMP])
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("✓")
    expect(fs.existsSync(path.join(TMP, "to-gif.gif"))).toBe(true)
  })

  test("skips same-format conversion", () => {
    const src = createSource("same-fmt.png")
    const result = run(["convert", "-f", "png", src, "-o", TMP])
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("skipped")
  })

  test("skips already-existing output", () => {
    const src = createSource("dup.png")
    run(["convert", "-f", "jpg", src, "-o", TMP])
    const result = run(["convert", "-f", "jpg", src, "-o", TMP])
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("skipped")
  })

  test("converts to a different output directory", () => {
    const src = createSource("to-alt.png")
    const altDir = path.join(TMP, "alt")
    const result = run(["convert", "-f", "jpg", src, "-o", altDir])
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("✓")
    expect(fs.existsSync(path.join(altDir, "to-alt.jpg"))).toBe(true)
  })

  test("dry run does not write files", () => {
    const src = createSource("dry-run.png")
    const result = run(["convert", "-f", "jpg", "-d", src, "-o", TMP])
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("dry")
    expect(fs.existsSync(path.join(TMP, "dry-run.jpg"))).toBe(false)
  })

  test("rejects unsupported format", () => {
    const src = createSource("bad-fmt.png")
    const result = run(["convert", "-f", "webp", src])
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("unsupported format")
  })

  test("handles nonexistent file gracefully", () => {
    const result = run(["convert", "-f", "jpg", "/tmp/nonexistent-iconkit.png"])
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("no valid input files")
  })
})
