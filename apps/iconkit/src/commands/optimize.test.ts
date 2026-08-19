import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import fs from "node:fs"
import path from "node:path"

const BIN = path.resolve(import.meta.dir, "../../iconkit")
const TMP = "/tmp/iconkit-test-optimize"
const MINIMAL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYPgPAAEDAQAIicLsAAAAAElFTkSuQmCC",
  "base64",
)

function run(args: string[], env: Record<string, string> = {}) {
  const result = Bun.spawnSync([BIN, ...args], { env: { ...process.env, ...env } })
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }
}

function createSource(name: string): string {
  const source = path.join(TMP, name)
  const fixture = path.join(TMP, "fixture.png")
  fs.writeFileSync(fixture, MINIMAL_PNG)
  Bun.spawnSync(["sips", "-z", "100", "100", fixture, "--out", source])
  return source
}

beforeAll(() => {
  fs.mkdirSync(TMP, { recursive: true })
})

afterAll(() => {
  fs.rmSync(TMP, { recursive: true, force: true })
})

describe("iconkit optimize", () => {
  test("rejects unsupported formats before writing output", () => {
    const source = createSource("invalid-format.png")
    const result = run(["optimize", "-f", "jpeg", source])
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("unsupported format")
    expect(fs.existsSync(path.join(TMP, "invalid-format.500x500.png"))).toBe(false)
  })

  test("retains the PNG intermediate when the encoder fails", () => {
    const source = createSource("encoder-failure.png")
    const fakeBin = path.join(TMP, "bin")
    fs.mkdirSync(fakeBin, { recursive: true })
    const fakeCwebp = path.join(fakeBin, "cwebp")
    fs.writeFileSync(fakeCwebp, "#!/bin/sh\nexit 1\n", { mode: 0o755 })

    const result = run(
      ["optimize", "-f", "webp", "-o", TMP, source],
      { PATH: `${fakeBin}:${process.env.PATH ?? ""}` },
    )

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("WebP conversion failed")
    expect(fs.existsSync(path.join(TMP, "encoder-failure.500x500.png"))).toBe(true)
    expect(fs.existsSync(path.join(TMP, "encoder-failure.500x500.webp"))).toBe(false)
  })
})
