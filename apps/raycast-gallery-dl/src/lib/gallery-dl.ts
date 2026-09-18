import { execFile } from "node:child_process";
import {
  accessSync,
  appendFileSync,
  constants,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type Browser =
  "chrome" | "firefox" | "edge" | "safari" | "brave" | "none";

export interface ExtensionPreferences {
  downloadDir: string;
  browser: Browser;
  photosOnly: boolean;
  cookiesFile: string;
  galleryDlPath: string;
}

export const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".webm", ".mkv"]);
// Audio-only files: dash-stream fragments gallery-dl sometimes leaves behind
// (.m4a) plus anything else that isn't a photo.
const AUDIO_EXTENSIONS = new Set([
  ".m4a",
  ".mp3",
  ".opus",
  ".ogg",
  ".wav",
  ".flac",
]);

export const IG_URL_RE =
  /^https?:\/\/(www\.)?instagram\.com\/(p|reel|tv)\/[A-Za-z0-9_-]+\/?(\?.*)?$/;
const ANY_URL_RE = /https?:\/\/[^\s"']+/;

/** Expand ~, $VAR, and ${VAR} like a shell would. */
export function expandPath(raw: string): string {
  let out = raw.trim();
  if (out === "~") return homedir();
  if (out.startsWith("~/")) out = join(homedir(), out.slice(2));
  return out.replace(
    /\$([A-Za-z_][A-Za-z0-9_]*)|\$\{([^}]+)\}/g,
    (match, name1: string, name2: string) =>
      process.env[name1 ?? name2] ?? match,
  );
}

export function firstUrl(text: string): string | undefined {
  return text.match(ANY_URL_RE)?.[0];
}

export interface GalleryDlBinary {
  command: string;
  prefixArgs: string[];
}

const EXTRA_BIN_DIRS = [
  join(homedir(), ".local", "bin"),
  join(homedir(), ".local", "share", "mise", "shims"),
  "/opt/homebrew/bin",
  "/usr/local/bin",
];

function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

const DEBUG_LOG = join(homedir(), ".cache", "raycast-gallery-dl", "debug.log");

/** Where failure details are kept (Raycast toasts vanish too fast to copy). */
export function debugLogPath(): string {
  return DEBUG_LOG;
}

function appendDebugLog(text: string): void {
  try {
    mkdirSync(dirname(DEBUG_LOG), { recursive: true });
    try {
      if (statSync(DEBUG_LOG).size > 1024 * 1024) writeFileSync(DEBUG_LOG, "");
    } catch {
      // fresh log file
    }
    appendFileSync(DEBUG_LOG, `[${new Date().toISOString()}] ${text}\n`);
  } catch {
    // never break a download over logging
  }
}

function searchDirs(extraDir?: string): string[] {
  const seen = new Set<string>();
  const dirs = [
    ...(extraDir ? [extraDir] : []),
    ...EXTRA_BIN_DIRS,
    ...(process.env.PATH ?? "/usr/bin:/bin:/usr/sbin:/sbin").split(":"),
  ];
  return dirs.filter((dir) => {
    if (!dir || seen.has(dir)) return false;
    seen.add(dir);
    return true;
  });
}

function findTool(name: string, extraDir?: string): string | undefined {
  for (const dir of searchDirs(extraDir)) {
    const candidate = join(dir, name);
    if (isExecutable(candidate)) return candidate;
  }
  return undefined;
}

/**
 * gallery-dl shells out to ffmpeg to merge dash video+audio. Under Raycast's
 * minimal PATH a Homebrew ffmpeg is invisible, so expose every tool dir we
 * know about to the child process.
 */
function childEnv(extraDirs: Array<string | undefined>): NodeJS.ProcessEnv {
  const path = [
    ...extraDirs.filter((dir): dir is string => !!dir),
    ...searchDirs(),
  ]
    .filter((dir, index, all) => all.indexOf(dir) === index)
    .join(":");
  return { ...process.env, PATH: path };
}

async function commandWorks(command: string, args: string[]): Promise<boolean> {
  try {
    await execFileAsync(command, [...args, "--version"], { timeout: 15_000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Locate gallery-dl. Raycast extensions run with a minimal PATH, so check the
 * explicit preference first, then common install locations, then fall back to
 * `python3 -m gallery_dl` (pip/pipx installs without the binary on PATH).
 */
export async function resolveGalleryDl(
  explicitPath?: string,
): Promise<GalleryDlBinary> {
  const explicit = explicitPath?.trim();
  if (explicit) {
    const command = expandPath(explicit);
    if (await commandWorks(command, [])) return { command, prefixArgs: [] };
    throw new Error(
      `gallery-dl is not runnable at ${command}. Check the "gallery-dl Binary" extension preference.`,
    );
  }

  const pathDirs = searchDirs();
  for (const dir of pathDirs) {
    const candidate = join(dir, "gallery-dl");
    if (isExecutable(candidate)) return { command: candidate, prefixArgs: [] };
  }
  for (const dir of pathDirs) {
    const python = join(dir, "python3");
    if (
      isExecutable(python) &&
      (await commandWorks(python, ["-m", "gallery_dl"]))
    ) {
      return { command: python, prefixArgs: ["-m", "gallery_dl"] };
    }
  }
  throw new Error(
    "gallery-dl not found. Install it first: `brew install gallery-dl` or `pipx install gallery-dl`.",
  );
}

export interface DownloadRequest {
  url: string;
  outDir: string;
  browser: Browser;
  cookiesFile?: string;
  photosOnly: boolean;
}

export interface DownloadResult {
  images: string[];
  videosRemoved: number;
  outDir: string;
}

function listFilesRecursive(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...listFilesRecursive(full));
    else if (entry.isFile()) found.push(full);
  }
  return found;
}

function extensionOf(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot >= 0 ? path.slice(dot).toLowerCase() : "";
}

type ExecError = NodeJS.ErrnoException & { stderr?: unknown; stdout?: unknown };

function describeFailure(error: unknown): string {
  const execError = error as Partial<ExecError>;
  const raw =
    typeof execError.stderr === "string" && execError.stderr.trim()
      ? execError.stderr
      : error instanceof Error
        ? error.message
        : String(error);
  const tail = raw.trim().split("\n").slice(-4).join("\n").slice(-600);
  const hint = /40[013]|login|rate.?limit|unauthorized|forbidden/i.test(raw)
    ? " Instagram rejected the request — re-login at instagram.com in that browser, or export a cookies.txt and set it in preferences."
    : "";
  return `${tail}${hint}`;
}

/** Run gallery-dl for one URL and return the downloaded image paths. */
export async function downloadGallery(
  binary: GalleryDlBinary,
  request: DownloadRequest,
): Promise<DownloadResult> {
  const outDir = expandPath(request.outDir);
  mkdirSync(outDir, { recursive: true });
  const filesBeforeDownload = new Set(listFilesRecursive(outDir));

  const url = request.url.trim();
  const binaryDir = binary.command.includes("/")
    ? dirname(binary.command)
    : undefined;
  const ffmpeg = findTool("ffmpeg", binaryDir);
  const env = childEnv([binaryDir, ffmpeg ? dirname(ffmpeg) : undefined]);
  appendDebugLog(
    `start url=${url} outDir=${outDir} binary=${binary.command} ffmpeg=${ffmpeg ?? "not-found"}`,
  );

  const args = [...binary.prefixArgs];
  const cookies = request.cookiesFile?.trim();
  if (cookies) {
    args.push("--cookies", expandPath(cookies));
  } else if (request.browser !== "none") {
    args.push("--cookies-from-browser", request.browser);
  }
  args.push("--retries", "3", "-d", outDir, url);

  try {
    await execFileAsync(binary.command, args, {
      maxBuffer: 64 * 1024 * 1024,
      timeout: 30 * 60 * 1000,
      env,
    });
  } catch (error) {
    const execError = error as Partial<ExecError>;
    const raw =
      typeof execError.stderr === "string" && execError.stderr.trim()
        ? execError.stderr
        : error instanceof Error
          ? error.message
          : String(error);
    appendDebugLog(`FAIL ${url}\n${raw.slice(-4000)}`);
    throw new Error(describeFailure(error));
  }

  let videosRemoved = 0;
  if (request.photosOnly) {
    for (const file of listFilesRecursive(outDir)) {
      if (filesBeforeDownload.has(file)) continue;
      const ext = extensionOf(file);
      if (VIDEO_EXTENSIONS.has(ext) || AUDIO_EXTENSIONS.has(ext)) {
        rmSync(file);
        videosRemoved++;
      }
    }
  }

  const images = listFilesRecursive(outDir)
    .filter((file) => IMAGE_EXTENSIONS.has(extensionOf(file)))
    .sort();
  return { images, videosRemoved, outDir };
}
