import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import fs from "node:fs"
import path from "node:path"

const BIN = path.resolve(import.meta.dir, "../../iconkit")
const TMP = "/tmp/iconkit-test-strip"

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

function createFixture(name: string): string {
  const p = path.join(TMP, name)
  fs.writeFileSync(p, MINIMAL_PNG)
  Bun.spawnSync(["sips", "-z", "200", "200", p, "--out", p])
  Bun.spawnSync(["sips", "--setProperty", "description", "iconkit-test-fixture", p])
  return p
}

beforeAll(() => {
  fs.mkdirSync(TMP, { recursive: true })
})

afterAll(() => {
  fs.rmSync(TMP, { recursive: true, force: true })
})

describe("iconkit strip", () => {
  test("strips metadata and reduces file size", () => {
    const f = createFixture("meta-test.png")
    const beforeSize = fs.statSync(f).size
    const result = run(["strip", f])
    expect(result.exitCode).toBe(0)
    const afterSize = fs.statSync(f).size
    expect(afterSize).toBeLessThanOrEqual(beforeSize)
  })

  test("dry run does not modify the file", () => {
    const f = createFixture("dry-test.png")
    const beforeSize = fs.statSync(f).size
    const result = run(["strip", "-d", f])
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("dry")
    const afterSize = fs.statSync(f).size
    expect(afterSize).toBe(beforeSize)
  })

  test("reports progress for each file", () => {
    const f = createFixture("progress-test.png")
    const result = run(["strip", f])
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("✓")
    expect(result.stdout).toContain("stripped:")
  })

  test("handles nonexistent file with graceful message", () => {
    const result = run(["strip", "/tmp/nonexistent-iconkit.png"])
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("no valid input files")
  })

  test("strips multiple files", () => {
    const a = createFixture("multi-a.png")
    const b = createFixture("multi-b.png")
    const result = run(["strip", a, b])
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("files:   2")
    expect(result.stdout).toContain("stripped: 2")
  })
})
