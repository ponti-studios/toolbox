import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"

export function run(cmd: string[]): { exitCode: number; stdout: string; stderr: string } {
  try {
    const r = spawnSync(cmd[0], cmd.slice(1))
    return {
      exitCode: r.status ?? 1,
      stdout: r.stdout?.toString() ?? "",
      stderr: r.stderr?.toString() ?? r.error?.message ?? "",
    }
  } catch (error) {
    return {
      exitCode: 127,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
    }
  }
}

export function which(cmd: string): string | null {
  const dirs = process.env.PATH?.split(path.delimiter) ?? []
  for (const dir of dirs) {
    const fp = path.join(dir, cmd)
    try { fs.accessSync(fp, fs.constants.X_OK); return fp } catch {}
  }
  return null
}

export function fmtSize(bytes: number): string {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)}GB`
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)}MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${bytes}B`
}

export function parseSize(s: string): { width: number; height: number } {
  const m = s.match(/^(\d+)x(\d+)$/)
  if (!m) throw new Error(`invalid size '${s}' (expected WxH, e.g. 500x500)`)
  return { width: parseInt(m[1]!), height: parseInt(m[2]!) }
}

export function checkCmd(cmd: string, hint: string): void {
  if (!which(cmd)) {
    console.error(`Error: ${cmd} not found. Install: ${hint}`)
    process.exit(1)
  }
}

export function isRegularFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile()
  } catch {
    return false
  }
}

export function resolveFiles(args: string[]): string[] {
  const files: string[] = []
  for (const arg of args) {
    if (isRegularFile(arg)) {
      files.push(arg)
    } else {
      console.warn(`Warning: no match for '${arg}'`)
    }
  }
  return files
}

export function getSipsDims(filePath: string): string {
  const r = run(["sips", "-g", "pixelWidth", "-g", "pixelHeight", filePath])
  if (r.exitCode !== 0) return "?"
  const w = r.stdout.match(/pixelWidth: (\d+)/)?.[1] ?? "?"
  const h = r.stdout.match(/pixelHeight: (\d+)/)?.[1] ?? "?"
  return w !== "?" && h !== "?" ? `${w}x${h}` : "?"
}

export function getFileSize(filePath: string): number {
  return fs.statSync(filePath).size
}

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true })
}

export function stripExt(p: string): string {
  const ext = path.extname(p)
  return ext ? path.basename(p, ext) : path.basename(p)
}
