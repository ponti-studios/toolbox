import path from "node:path"
import fs from "node:fs"
import { run, which, resolveFiles, getFileSize, fmtSize } from "../utils"

interface StripOptions {
  dryRun: boolean
}

const JPEG_EXTS = [".jpg", ".jpeg"]

function pickStripper(): { tool: string; cmd: string[]; label: string } | null {
  if (which("exiftool")) return { tool: "exiftool", cmd: ["exiftool", "-all="], label: "exiftool" }
  if (which("magick")) return { tool: "magick", cmd: ["magick", "-strip"], label: "ImageMagick" }
  return null
}

function stripFile(src: string, tmpDir: string, stripper: { tool: string; cmd: string[]; label: string }): boolean {
  if (stripper.tool === "exiftool") {
    const r = run([...stripper.cmd, src])
    if (r.exitCode === 0) {
      // exiftool creates a backup file; remove it
      const backup = src + "_original"
      if (fs.existsSync(backup)) fs.unlinkSync(backup)
      return true
    }
    return false
  }

  if (stripper.tool === "magick") {
    const tmp = path.join(tmpDir, `_strip_${path.basename(src)}`)
    const r = run([...stripper.cmd, src, tmp])
    if (r.exitCode !== 0) return false
    fs.renameSync(tmp, src)
    return true
  }

  return false
}

export function cmdStrip(files: string[], opts: StripOptions): void {
  const inputs = resolveFiles(files)
  if (inputs.length === 0) {
    console.error("Error: no valid input files")
    process.exit(1)
  }

  const stripper = pickStripper()
  if (!stripper) {
    console.error("Error: need exiftool (brew install exiftool) or ImageMagick (brew install imagemagick)")
    process.exit(1)
  }

  let stripped = 0, skipped = 0
  const dryRun = opts.dryRun
  const tmpDir = fs.mkdtempSync("iconkit-strip-")

  console.log("── iconkit strip ────────────────────────────")
  console.log(`  files:   ${inputs.length}`)
  const beforeTotal = inputs.reduce((s, f) => s + getFileSize(f), 0)
  console.log(`  size:    ${fmtSize(beforeTotal)}`)
  console.log(`  engine:  ${stripper.label}`)
  console.log("──")

  for (const src of inputs) {
    const name = path.basename(src)

    if (dryRun) {
      console.log(`  [dry] ${name}`)
      continue
    }

    if (!fs.existsSync(src)) {
      console.warn(`Warning: file not found: ${src}`)
      skipped++
      continue
    }

    const ok = stripFile(src, tmpDir, stripper)
    if (!ok) {
      console.warn(`Warning: strip failed: ${name}`)
      skipped++
      continue
    }

    stripped++
    const bytes = getFileSize(src)
    console.log(`  ✓ ${name}  (${fmtSize(bytes)})`)
  }

  fs.rmSync(tmpDir, { recursive: true, force: true })

  const afterTotal = inputs.reduce((s, f) => s + getFileSize(f), 0)
  const saved = beforeTotal - afterTotal

  console.log("── done ──────────────────────────────────────")
  if (dryRun) {
    console.log("  (dry run — no files written)")
  } else {
    console.log(`  stripped: ${stripped} | skipped: ${skipped}`)
    if (saved > 0) console.log(`  saved:    ${fmtSize(saved)}`)
  }
}
