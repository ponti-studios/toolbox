import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import fs from "node:fs"
import path from "node:path"
import { BIN } from "../test-support"

const TMP = "/tmp/iconkit-test-web"
const MINIMAL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYPgPAAEDAQAIicLsAAAAAElFTkSuQmCC",
  "base64",
)

function run(args: string[]) {
  const result = Bun.spawnSync([BIN, ...args], { env: { ...process.env } })
  return { exitCode: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString() }
}

function dimensions(filePath: string): string {
  const result = Bun.spawnSync(["sips", "-g", "pixelWidth", "-g", "pixelHeight", filePath])
  const output = result.stdout.toString()
  const width = output.match(/pixelWidth: (\d+)/)?.[1] ?? "?"
  const height = output.match(/pixelHeight: (\d+)/)?.[1] ?? "?"
  return `${width}x${height}`
}

beforeAll(() => fs.mkdirSync(TMP, { recursive: true }))
afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }))

describe("iconkit web", () => {
  test("generates exact square dimensions and can be rerun", () => {
    const source = path.join(TMP, "source.png")
    const output = path.join(TMP, "icons")
    const fixture = path.join(TMP, "fixture.png")
    fs.writeFileSync(fixture, MINIMAL_PNG)
    Bun.spawnSync(["sips", "-z", "100", "200", fixture, "--out", source])

    const first = run(["web", source, "-o", output])
    expect(first.exitCode).toBe(0)
    expect(dimensions(path.join(output, "favicon-16x16.png"))).toBe("16x16")
    expect(dimensions(path.join(output, "apple-touch-icon-180x180.png"))).toBe("180x180")
    expect(dimensions(path.join(output, "icon-512x512.png"))).toBe("512x512")

    const second = run(["web", source, "-o", output])
    expect(second.exitCode).toBe(0)
    expect(fs.existsSync(path.join(output, "apple-touch-icon.png"))).toBe(true)
  })
})
