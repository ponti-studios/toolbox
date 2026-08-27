import fs from "node:fs";
import path from "node:path";
import { run, checkCmd } from "../utils";

export interface AnalyzeOptions {
  json: boolean;
  csv: boolean;
  geo: boolean;
  stats: boolean;
  verbose: boolean;
  recursive: boolean;
  extensions?: string;
  noProgress?: boolean;
}

const DEFAULT_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".tiff",
  ".tif",
  ".heic",
  ".heif",
  ".webp",
  ".raw",
  ".cr2",
  ".nef",
  ".arw",
  ".dng",
]);

function parseExtensions(extStr?: string): Set<string> {
  if (!extStr) return DEFAULT_EXTENSIONS;
  const set = new Set<string>();
  for (const e of extStr.split(",")) {
    const trimmed = e.trim().toLowerCase();
    if (!trimmed) continue;
    const withDot = trimmed.startsWith(".") ? trimmed : `.${trimmed}`;
    set.add(withDot);
  }
  return set.size > 0 ? set : DEFAULT_EXTENSIONS;
}

function findImages(directory: string, extensions: Set<string>, recursive: boolean): string[] {
  const results: string[] = [];
  const dir = path.resolve(directory);

  function walk(current: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith("._")) continue;
      const full = path.join(current, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (recursive) walk(full);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (extensions.has(ext)) results.push(full);
      }
    }
  }

  walk(dir);
  return results.sort();
}

interface PhotoMeta {
  filename: string;
  filepath: string;
  file_size: number;
  date_taken: string | null;
  camera_make: string | null;
  camera_model: string | null;
  lens: string | null;
  iso: string | null;
  aperture: string | null;
  shutter_speed: string | null;
  focal_length: string | null;
  flash: string | null;
  latitude: number | null;
  longitude: number | null;
  location: string | null;
  orientation: string | null;
  software: string | null;
  copyright: string | null;
  artist: string | null;
  width: string | null;
  height: string | null;
  error: string | null;
}

function extractExifBatch(filePaths: string[]): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  if (filePaths.length === 0) return map;

  // Use exiftool -j -n -s -G to get grouped short tags with numeric values
  // Add -time:all and gps etc. Just run with default.
  // We also want Composite GPS for signed decimal.
  const args = ["exiftool", "-j", "-s", "-G", "-n", ...filePaths];
  const r = run(args);
  if (r.exitCode !== 0 && !r.stdout.trim().startsWith("[")) {
    // exiftool failed; fallback to per-file later
    return map;
  }
  try {
    const parsed = JSON.parse(r.stdout) as Record<string, unknown>[];
    for (const obj of parsed) {
      const src = obj["SourceFile"] as string | undefined;
      if (src) map.set(path.resolve(src), obj);
    }
  } catch {
    // ignore parse error
  }
  return map;
}

function getTag(obj: Record<string, unknown>, suffix: string): unknown {
  // Match grouped tag like "EXIF:Make" or "IFD0:Model" ending with suffix
  for (const [k, v] of Object.entries(obj)) {
    if (k === suffix || k.endsWith(`:${suffix}`)) return v;
  }
  return undefined;
}

function getFirstTag(obj: Record<string, unknown>, candidates: string[]): unknown {
  for (const c of candidates) {
    const v = getTag(obj, c);
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return undefined;
}

function buildPhotoMeta(filePath: string, exifObj: Record<string, unknown> | undefined): PhotoMeta {
  const result: PhotoMeta = {
    filename: path.basename(filePath),
    filepath: filePath,
    file_size: 0,
    date_taken: null,
    camera_make: null,
    camera_model: null,
    lens: null,
    iso: null,
    aperture: null,
    shutter_speed: null,
    focal_length: null,
    flash: null,
    latitude: null,
    longitude: null,
    location: null,
    orientation: null,
    software: null,
    copyright: null,
    artist: null,
    width: null,
    height: null,
    error: null,
  };

  try {
    try {
      result.file_size = fs.statSync(filePath).size;
    } catch {
      // ignore
    }

    if (!exifObj) {
      // No exif data; return with error not set but empty
      return result;
    }

    // date_taken prioritize similar to python (EXIF DateTimeOriginal, Image DateTime, GPS GPSDate)
    const dateCandidates = [
      "DateTimeOriginal",
      "CreateDate",
      "MediaCreateDate",
      "DateTime",
      "GPSDateTime",
      "GPSDate",
    ];
    const dateVal = getFirstTag(exifObj, dateCandidates);
    if (dateVal !== undefined) {
      // exiftool with -n still formats dates as string; convert "2024:03:12 11:32:03+00:00" to keep
      result.date_taken = String(dateVal).split("+")[0]!.trim().replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1:$2:$3");
      // Ensure format like "2024:03:12 11:32:03"
      // exiftool may give "2024:03:12 11:32:03" already; keep as is
    }

    const make = getTag(exifObj, "Make");
    if (make !== undefined) result.camera_make = String(make).trim();
    const model = getTag(exifObj, "Model");
    if (model !== undefined) result.camera_model = String(model).trim();
    const lens = getFirstTag(exifObj, ["LensModel", "Lens"]);
    if (lens !== undefined) result.lens = String(lens).trim();

    const iso = getTag(exifObj, "ISO");
    if (iso !== undefined) result.iso = `ISO ${String(iso).trim()}`;
    const fnum = getTag(exifObj, "FNumber");
    if (fnum !== undefined) result.aperture = `f/${String(fnum).trim()}`;
    const exp = getTag(exifObj, "ExposureTime");
    if (exp !== undefined) result.shutter_speed = `${String(exp).trim()}s`;
    const focal = getTag(exifObj, "FocalLength");
    if (focal !== undefined) result.focal_length = `${String(focal).trim()}mm`;
    const flash = getTag(exifObj, "Flash");
    if (flash !== undefined) result.flash = String(flash).trim();

    // GPS: try Composite first (signed), fallback to GPS:GPSLatitude + ref
    let lat: number | null = null;
    let lon: number | null = null;
    const compLat = getTag(exifObj, "GPSLatitude");
    const compLon = getTag(exifObj, "GPSLongitude");
    // Composite GPS tags are decimal; but there may be duplicate GPS:GPSLatitude numeric
    // If object contains GPSLatitude as number, we can use it
    // exiftool -n gives numeric degrees for GPS:GPSLatitude; need ref to sign
    // Composite gives signed already
    // We'll prefer Composite if exists and is number
    // Since we requested -Composite:GPSLatitude etc, those keys are "Composite:GPSLatitude"
    const compositeLat = exifObj["Composite:GPSLatitude"];
    const compositeLon = exifObj["Composite:GPSLongitude"];
    if (typeof compositeLat === "number" && typeof compositeLon === "number") {
      lat = compositeLat as number;
      lon = compositeLon as number;
    } else if (typeof compLat === "number" && typeof compLon === "number") {
      // Check refs
      const latRef = getTag(exifObj, "GPSLatitudeRef");
      const lonRef = getTag(exifObj, "GPSLongitudeRef");
      lat = compLat as number;
      lon = compLon as number;
      if (String(latRef) === "S") lat = -Math.abs(lat);
      if (String(lonRef) === "W") lon = -Math.abs(lon);
    }
    if (lat !== null && lon !== null && !Number.isNaN(lat) && !Number.isNaN(lon)) {
      result.latitude = lat;
      result.longitude = lon;
    }

    const orientation = getTag(exifObj, "Orientation");
    if (orientation !== undefined) result.orientation = String(orientation).trim();
    const software = getTag(exifObj, "Software");
    if (software !== undefined) result.software = String(software).trim();
    const copyright = getTag(exifObj, "Copyright");
    if (copyright !== undefined) result.copyright = String(copyright).trim();
    const artist = getFirstTag(exifObj, ["Artist", "Creator"]);
    if (artist !== undefined) result.artist = String(artist).trim();

    const width = getFirstTag(exifObj, ["ExifImageWidth", "ImageWidth", "SourceImageWidth"]);
    if (width !== undefined) result.width = String(width).trim();
    const height = getFirstTag(exifObj, ["ExifImageHeight", "ImageHeight", "SourceImageHeight"]);
    if (height !== undefined) result.height = String(height).trim();

  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e);
  }

  return result;
}

function formatSize(sizeBytes: number): string {
  let s = sizeBytes;
  for (const unit of ["B", "KB", "MB", "GB"]) {
    if (s < 1024) return `${s.toFixed(1)} ${unit}`;
    s /= 1024;
  }
  return `${s.toFixed(1)} TB`;
}

function printPhotoSummary(photo: PhotoMeta, verbose: boolean): void {
  console.log(`\n📷  ${photo.filename}`);
  console.log(`    Path: ${photo.filepath}`);
  console.log(`    Size: ${formatSize(photo.file_size)}`);
  if (photo.error) {
    console.log(`    ⚠️  Error: ${photo.error}`);
    return;
  }
  if (photo.date_taken) console.log(`    📅  Date: ${photo.date_taken}`);
  if (photo.camera_make || photo.camera_model) {
    const camera = [photo.camera_make, photo.camera_model].filter(Boolean).join(" ");
    console.log(`    📷  Camera: ${camera}`);
  }
  if (photo.lens) console.log(`    🔍  Lens: ${photo.lens}`);
  const exposure: string[] = [];
  if (photo.iso) exposure.push(photo.iso);
  if (photo.aperture) exposure.push(photo.aperture);
  if (photo.shutter_speed) exposure.push(photo.shutter_speed);
  if (photo.focal_length) exposure.push(photo.focal_length);
  if (exposure.length > 0) console.log(`    ⚡ Exposure: ${exposure.join(" | ")}`);
  if (photo.latitude !== null && photo.longitude !== null) {
    console.log(`    📍  Location: ${photo.latitude.toFixed(6)}, ${photo.longitude.toFixed(6)}`);
  }
  if (verbose) {
    if (photo.software) console.log(`    💻  Software: ${photo.software}`);
    if (photo.copyright) console.log(`    ©️  Copyright: ${photo.copyright}`);
    if (photo.artist) console.log(`    👤  Artist: ${photo.artist}`);
  }
}

function printStats(photos: PhotoMeta[]): void {
  const total = photos.length;
  const withExif = photos.filter((p) => !p.error).length;
  const withDate = photos.filter((p) => !!p.date_taken).length;
  const withGps = photos.filter((p) => p.latitude !== null && p.longitude !== null).length;
  const totalSize = photos.reduce((s, p) => s + p.file_size, 0);

  const cameras: Record<string, number> = {};
  for (const p of photos) {
    if (p.camera_model) cameras[p.camera_model] = (cameras[p.camera_model] ?? 0) + 1;
  }
  const dates: Record<string, number> = {};
  for (const p of photos) {
    if (p.date_taken) {
      const year = p.date_taken.slice(0, 4) || "Unknown";
      dates[year] = (dates[year] ?? 0) + 1;
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log("  📊 PHOTO ANALYSIS SUMMARY");
  console.log("=".repeat(50));
  console.log(`\n  Total photos:     ${total}`);
  console.log(`  With EXIF data:   ${withExif} (${((100 * withExif) / Math.max(total, 1)).toFixed(1)}%)`);
  console.log(`  With date:        ${withDate} (${((100 * withDate) / Math.max(total, 1)).toFixed(1)}%)`);
  console.log(`  With GPS:         ${withGps} (${((100 * withGps) / Math.max(total, 1)).toFixed(1)}%)`);
  console.log(`  Total size:       ${formatSize(totalSize)}`);

  if (Object.keys(cameras).length > 0) {
    console.log("\n  📷  Cameras used:");
    const sorted = Object.entries(cameras).sort((a, b) => b[1] - a[1]).slice(0, 5);
    for (const [cam, cnt] of sorted) console.log(`      ${cam}: ${cnt} photos`);
  }
  if (Object.keys(dates).length > 0) {
    console.log("\n  📅  Photos by year:");
    for (const [year, cnt] of Object.entries(dates).sort().slice(0, 10)) console.log(`      ${year}: ${cnt} photos`);
  }
  console.log();
}

export function cmdAnalyze(directory: string, opts: AnalyzeOptions): void {
  checkCmd("exiftool", "brew install exiftool");

  const extensions = parseExtensions(opts.extensions);
  const dir = directory ?? ".";
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    console.error(`Error: directory not found: ${dir}`);
    process.exit(1);
  }

  console.log("\n🔍  imagekit - Photo EXIF Analyzer\n");
  console.log(`  Scanning: ${path.resolve(dir)}\n`);

  const images = findImages(dir, extensions, !!opts.recursive);
  if (images.length === 0) {
    console.log(`⚠️  No images found in ${dir}`);
    return;
  }
  console.log(`  Found ${images.length} image(s)...\n`);

  // Extract in batches to avoid command line length limits
  const BATCH = 100;
  const photos: PhotoMeta[] = [];
  for (let i = 0; i < images.length; i += BATCH) {
    const batch = images.slice(i, i + BATCH);
    const exifMap = extractExifBatch(batch);
    for (const p of batch) {
      const resolved = path.resolve(p);
      const obj = exifMap.get(resolved);
      // If batch failed (empty map), try per-file fallback
      let usedObj = obj;
      if (!obj && exifMap.size === 0) {
        // fallback single file
        const single = extractExifBatch([p]);
        usedObj = single.get(resolved);
      }
      photos.push(buildPhotoMeta(p, usedObj));
    }
    if (!opts.noProgress) {
      // simple progress indicator
      const done = Math.min(i + BATCH, images.length);
      if (done < images.length) {
        process.stderr.write(`  Analyzing ${done}/${images.length}\r`);
      }
    }
  }
  if (!opts.noProgress) process.stderr.write("\n");

  let filtered = photos;
  if (opts.geo) {
    filtered = photos.filter((p) => p.latitude !== null && p.longitude !== null);
    if (filtered.length > 0) {
      console.log(`\n  📍  Found ${filtered.length} photo(s) with GPS data:\n`);
    } else {
      console.log("\n  ⚠️  No photos with GPS data found.");
      return;
    }
  }

  if (opts.json) {
    const output = {
      scanned_at: new Date().toISOString(),
      directory: path.resolve(dir),
      total_photos: filtered.length,
      photos: filtered,
    };
    console.log(JSON.stringify(output, null, 2));
  } else if (opts.csv) {
    if (filtered.length === 0) return;
    const fieldnames = [
      "filename",
      "filepath",
      "file_size",
      "date_taken",
      "camera_make",
      "camera_model",
      "lens",
      "iso",
      "aperture",
      "shutter_speed",
      "focal_length",
      "latitude",
      "longitude",
      "width",
      "height",
      "software",
    ];
    console.log(fieldnames.join(","));
    for (const p of filtered) {
      const row = fieldnames
        .map((f) => {
          const v = (p as unknown as Record<string, unknown>)[f];
          if (v === null || v === undefined) return "";
          const s = String(v);
          if (s.includes(",") || s.includes('"') || s.includes("\n")) {
            return `"${s.replace(/"/g, '""')}"`;
          }
          return s;
        })
        .join(",");
      console.log(row);
    }
  } else if (opts.stats) {
    printStats(filtered);
  } else {
    if (filtered.length === 0) return;
    for (const photo of filtered) printPhotoSummary(photo, !!opts.verbose);
    console.log("\n" + "-".repeat(50));
    console.log(`  Total: ${filtered.length} photo(s) analyzed`);
    console.log();
  }
}
