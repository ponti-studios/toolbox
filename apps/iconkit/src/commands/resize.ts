import path from "node:path"
import fs from "node:fs"
import { run, parseSize, checkCmd, resolveFiles, getFileSize, fmtSize, ensureDir, stripExt } from "../utils"

interface ResizeOptions {
  size: string
  outputDir?: string
  format?: string
  suffix?: string
  dryRun: boolean
}

const VALID_FORMATS = ["png", "jpg", "jpeg", "tiff", "gif", "bmp"]

export function cmdResize(files: string[], opts: ResizeOptions): void {
  const inputs = resolveFiles(files)
  if (inputs.length === 0) {
    console.error("Error: no valid input files")
    process.exit(1)
  }

  checkCmd("sips", "part of macOS")

  const { width, height } = parseSize(opts.size)
  const suffix = opts.suffix ?? `${width}x${height}`
  const dryRun = opts.dryRun
  const targetFmt = opts.format?.toLowerCase()

  if (targetFmt && !VALID_FORMATS.includes(targetFmt)) {
    console.error(`Error: unsupported format '${targetFmt}'. Use: ${VALID_FORMATS.join(", ")}`)
    process.exit(1)
  }

  let resized = 0, skipped = 0

  console.log("── iconkit resize ───────────────────────────")
  console.log(`  files:   ${inputs.length}`)
  console.log(`  size:    ${width}x${height}`)
  if (targetFmt) console.log(`  format:  ${targetFmt}`)
  if (suffix !== `${width}x${height}`) console.log(`  suffix:  ${suffix}`)
  console.log("──")

  for (const src of inputs) {
    const dir = path.dirname(src)
    const base = stripExt(src)
    const srcExt = path.extname(src).replace(/^\./, "") || "png"
    const outExt = targetFmt ?? srcExt
    const outdir = opts.outputDir ?? dir
    const outName = `${base}.${suffix}.${outExt}`
    const outPath = path.join(outdir, outName)

    if (dryRun) {
      console.log(`  [dry] ${src} → ${outPath}`)
      continue
    }

    ensureDir(outdir)

    if (!fs.existsSync(outPath)) {
      const r = run(["sips", "-z", String(height), String(width), src, "--out", outPath])
      if (r.exitCode !== 0) {
        console.warn(`Warning: resize failed: ${src}`)
        skipped++
        continue
      }
      resized++
    } else {
      skipped++
      console.log(`  - ${outName}  (already exists, skipped)`)
      continue
    }

    const outBytes = getFileSize(outPath)
    const srcBytes = getFileSize(src)
    const pct = 100 - Math.round((outBytes * 100) / srcBytes)
    const verb = pct <= 0 ? `(${fmtSize(outBytes)})` : `(${fmtSize(outBytes)}, ${pct}% vs source)`
    console.log(`  ✓ ${outName}  ${verb}`)
  }

  console.log("── done ──────────────────────────────────────")
  if (dryRun) {
    console.log("  (dry run — no files written)")
  } else {
    console.log(`  resized: ${resized} | skipped: ${skipped}`)
  }
}
