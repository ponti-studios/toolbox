import path from "node:path"
import fs from "node:fs"
import { run, checkCmd, resolveFiles, getFileSize, fmtSize, ensureDir, stripExt } from "../utils"

interface ConvertOptions {
  format: string
  outputDir?: string
  dryRun: boolean
}

const VALID_FORMATS = ["png", "jpg", "jpeg", "tiff", "gif", "bmp"]
const SIPS_FORMAT_MAP: Record<string, string> = {
  png: "png",
  jpg: "jpeg",
  jpeg: "jpeg",
  tiff: "tiff",
  gif: "gif",
  bmp: "bmp",
}

export function cmdConvert(files: string[], opts: ConvertOptions): void {
  const inputs = resolveFiles(files)
  if (inputs.length === 0) {
    console.error("Error: no valid input files")
    process.exit(1)
  }

  const targetFmt = opts.format.toLowerCase()
  if (!VALID_FORMATS.includes(targetFmt)) {
    console.error(`Error: unsupported format '${targetFmt}'. Use: ${VALID_FORMATS.join(", ")}`)
    process.exit(1)
  }

  checkCmd("sips", "part of macOS")

  const sipsFmt = SIPS_FORMAT_MAP[targetFmt]!
  const dryRun = opts.dryRun
  let converted = 0, skipped = 0, failed = 0

  console.log("── iconkit convert ──────────────────────────")
  console.log(`  files:   ${inputs.length}`)
  console.log(`  format:  ${targetFmt}`)
  console.log("──")

  for (const src of inputs) {
    const dir = path.dirname(src)
    const base = stripExt(src)
    const outdir = opts.outputDir ?? dir
    const outName = `${base}.${targetFmt}`
    const outPath = path.join(outdir, outName)
    const srcExt = path.extname(src).replace(/^\./, "").toLowerCase()

    if (srcExt === targetFmt && dir === outdir) {
      console.log(`  - ${path.basename(src)}  (already ${targetFmt}, skipped)`)
      skipped++
      continue
    }

    if (dryRun) {
      console.log(`  [dry] ${path.basename(src)} → ${outName}`)
      continue
    }

    ensureDir(outdir)

    if (fs.existsSync(outPath)) {
      skipped++
      console.log(`  - ${outName}  (already exists, skipped)`)
      continue
    }

    const r = run(["sips", "-s", "format", sipsFmt, src, "--out", outPath])
    if (r.exitCode !== 0) {
      console.warn(`Warning: convert failed: ${path.basename(src)}`)
      failed++
      skipped++
      continue
    }

    converted++
    const bytes = getFileSize(outPath)
    console.log(`  ✓ ${outName}  (${fmtSize(bytes)})`)
  }

  console.log("── done ──────────────────────────────────────")
  if (dryRun) {
    console.log("  (dry run — no files written)")
  } else {
    console.log(`  converted: ${converted} | skipped: ${skipped} | failed: ${failed}`)
    if (failed > 0) process.exitCode = 1
  }
}
