import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import fs from "node:fs"
import path from "node:path"

const BIN = path.resolve(import.meta.dir, "../../iconkit")
const TMP = "/tmp/iconkit-test-crop"

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

function createFixture(name: string, w: number, h: number): string {
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

describe("iconkit crop", () => {
  test("crops landscape to exact pixel dimensions (center)", () => {
    const src = createFixture("exact.png", 200, 100)
    const result = run(["crop", "-s", "100x100", src, "-o", TMP])
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("✓")
    expect(result.stdout).toContain("cropped:")
    expect(fs.existsSync(path.join(TMP, "exact.100x100.png"))).toBe(true)
  })

  test("crops landscape to square via aspect ratio", () => {
    const src = createFixture("ratio-land.png", 200, 100)
    const result = run(["crop", "-s", "1:1", src, "-o", TMP])
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("✓")
    const outPath = path.join(TMP, "ratio-land.100x100.png")
    expect(fs.existsSync(outPath)).toBe(true)
  })

  test("crops portrait to 16:9", () => {
    const src = createFixture("ratio-port.png", 100, 200)
    const result = run(["crop", "-s", "16:9", src, "-o", TMP])
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("✓")
    // 16:9 from 100w 200h → crop to 100w x 56h
    expect(fs.existsSync(path.join(TMP, "ratio-port.100x56.png"))).toBe(true)
  })

  test("skips already-existing output", () => {
    const result = run(["crop", "-s", "100x100", path.join(TMP, "exact.png"), "-o", TMP])
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("skipped")
  })

  test("dry run does not write files", () => {
    const src = createFixture("dry-crop.png", 100, 100)
    const beforeCount = fs.readdirSync(TMP).length
    const result = run(["crop", "-s", "50x50", "-d", src, "-o", TMP])
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("dry")
    const afterCount = fs.readdirSync(TMP).length
    expect(afterCount).toBe(beforeCount)
  })

  test("rejects invalid size format", () => {
    const src = createFixture("bad-size.png", 100, 100)
    const result = run(["crop", "-s", "foo", src])
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("invalid size")
  })

  test("rejects invalid gravity", () => {
    const src = createFixture("bad-grav.png", 100, 100)
    const result = run(["crop", "-s", "100x100", "-g", "top", src])
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("invalid gravity")
  })

  test("north gravity crops from top", () => {
    const src = createFixture("gravity-north.png", 100, 200)
    const result = run(["crop", "-s", "100x100", "-g", "north", src, "-o", TMP])
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("✓")
    expect(fs.existsSync(path.join(TMP, "gravity-north.100x100.png"))).toBe(true)
  })
})
