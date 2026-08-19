import { afterEach, describe, expect, test } from "bun:test"
import fs from "node:fs"
import path from "node:path"
import { FIXTURES, dimensions, runIconkit, tempDir } from "../test-support"

const temporaryDirs: string[] = []

afterEach(() => {
  while (temporaryDirs.length > 0) {
    fs.rmSync(temporaryDirs.pop()!, { recursive: true, force: true })
  }
})

describe("iconkit web", () => {
  test("generates exact square dimensions and can be rerun", () => {
    const tmp = tempDir("web")
    temporaryDirs.push(tmp)
    const source = path.join(FIXTURES, "transparent-rgba.png")
    const output = path.join(tmp, "icons")

    const first = runIconkit(["web", source, "-o", output])
    expect(first.exitCode).toBe(0)
    expect(dimensions(path.join(output, "favicon-16x16.png"))).toEqual({ width: 16, height: 16 })
    expect(dimensions(path.join(output, "apple-touch-icon-180x180.png"))).toEqual({ width: 180, height: 180 })
    expect(dimensions(path.join(output, "icon-512x512.png"))).toEqual({ width: 512, height: 512 })

    const second = runIconkit(["web", source, "-o", output])
    expect(second.exitCode).toBe(0)
    expect(fs.existsSync(path.join(output, "apple-touch-icon.png"))).toBe(true)
  })

  test("reports a copy failure without aborting web generation", () => {
    const tmp = tempDir("web-copy-failure")
    temporaryDirs.push(tmp)
    const output = path.join(tmp, "icons")
    fs.mkdirSync(output, { recursive: true })
    fs.mkdirSync(path.join(output, "apple-touch-icon.png"))

    const result = runIconkit(["web", path.join(FIXTURES, "transparent-rgba.png"), "-o", output])

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("failed to generate apple-touch-icon.png")
    expect(result.stdout).toContain("failed:")
    expect(fs.existsSync(path.join(output, "icon-512x512.png"))).toBe(true)
  })
})
