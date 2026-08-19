#!/usr/bin/env bun

// @raycast.schemaVersion 1
// @raycast.title OpenSpeek
// @raycast.mode fullOutput
// @raycast.packageName Audio
// @raycast.icon 🔊
// @raycast.description Convert a Markdown file to an AAC/M4A narration (OpenRouter Flux TTS)
// @raycast.argument1 { "type": "text", "placeholder": "Markdown file path" }

import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  existsSync,
  copyFileSync,
  mkdirSync,
  realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, basename } from "node:path";
import { generateSpeech } from "@tanstack/ai";
import { createOpenaiSpeech } from "@tanstack/ai-openai";
import {
  FLUX_VOICES,
  expandPath,
  toNarration,
  chunkText,
  pcmToWav,
  fmtDuration,
  fetchGeneration,
  runPool,
} from "./lib";

const HELP = `Usage: openspeek INPUT.md [OUTPUT.m4a]

INPUT and OUTPUT may reference environment variables, e.g. "$OBSIDIAN/chapter 1.md"
or "~/Desktop/out.m4a" — the script expands $VAR, \${VAR}, and ~.

Engine: OpenRouter neural TTS when OPENROUTER_API_KEY is set, else piper
(local neural TTS) when installed, else macOS say().

Options:
  -h, --help            show this help
      --voices          list Deepgram Flux voices (with sample clips)
  -q, --quiet           no progress bar
  -e, --engine ENGINE   openrouter | piper | say | auto (default: auto)
  -m, --model SLUG      OpenRouter TTS model (default: google/gemini-3.1-flash-tts-preview)
  -v, --voice VOICE_ID  voice for the active engine (see defaults below)
  -r, --rate WPM        macOS say() words per minute (default: 165)
  -c, --chunk-chars N   OpenRouter chunk size in chars (default: 1500)
  -s, --speed RATE      Deepgram Flux speaking-rate multiplier (0.85-1.15, default 1.0)

Environment overrides:
  OPENROUTER_API_KEY    required for the openrouter engine
  ENGINE, OR_MODEL, VOICE, RATE, OR_CHUNK_CHARS, SPEED   same as the flags above
  PIPER_DATA_DIR        piper model cache dir (default: ~/.local/share/piper-tts)
  OR_LOG_DIR            OpenRouter usage log dir (default: ~/.hominem/ai_usage; empty disables)

Defaults:
  openrouter  google/gemini-3.1-flash-tts-preview  VOICE=Zephyr
              free Deepgram: -m deepgram/flux-tts:free -v flux-gemma-en [-s 1.15]
  piper       VOICE=en_US-lessac-high
  say         VOICE=Samantha

The OpenRouter engine returns PCM audio (24 kHz/16-bit), wraps it into WAV, and
converts to M4A (or keeps .wav if the output path ends in .wav). Long inputs are
split into ~1500-char chunks synthesized 4 at a time. Each generation is logged
as JSON to OR_LOG_DIR (~$0.06/min on Gemini, $0 on Flux).
`;

const { values, positionals } = parseArgs({
  options: {
    help: { type: "boolean", short: "h" },
    voices: { type: "boolean" },
    quiet: { type: "boolean", short: "q" },
    engine: { type: "string", short: "e" },
    model: { type: "string", short: "m" },
    voice: { type: "string", short: "v" },
    rate: { type: "string", short: "r" },
    "chunk-chars": { type: "string", short: "c" },
    speed: { type: "string", short: "s" },
  },
  allowPositionals: true,
});

if (values.help) {
  console.log(HELP);
  process.exit(0);
}

if (values.voices) {
  // Works from source (src/index.ts -> ../samples), from an installed npm
  // package (dist/openspeek.js -> ../samples), and falls back to the repo URL
  // for compiled binaries (virtual $bunfs path) or clones without the clips.
  let scriptDir = "";
  try {
    scriptDir = dirname(realpathSync(process.argv[1] ?? ""));
  } catch {
    // compiled binary: no local filesystem path
  }
  const samplesDir = scriptDir ? join(scriptDir, "..", "samples") : "";
  const local = (v: string) => join(samplesDir, `${v}.m4a`);
  const url = (v: string) =>
    `https://raw.githubusercontent.com/ponti-studios/toolbox/main/apps/openspeek/samples/${v}.m4a`;
  console.log(
    "Deepgram Flux voices (use with: openspeek -m deepgram/flux-tts:free -v flux-<voice>-en)",
  );
  console.log(
    "Default: flux-gemma-en (British, Female, Young). Sample clips are the same narration passage.\n",
  );
  const byAccent = new Map<string, typeof FLUX_VOICES>();
  for (const v of FLUX_VOICES) {
    const list = byAccent.get(v.accent) ?? [];
    list.push(v);
    byAccent.set(v.accent, list);
  }
  for (const [accentName, voices] of byAccent) {
    console.log(`${accentName.toUpperCase()} English`);
    console.log("-".repeat(72));
    for (const v of voices) {
      console.log(
        `flux-${v.voice}-en  ${v.gender} · ${v.age}\n` +
          `  ${v.character}. For ${v.uses}.\n` +
          `  ${samplesDir && existsSync(local(v.voice)) ? `file://${local(v.voice)}` : url(v.voice)}`,
      );
    }
    console.log();
  }
  process.exit(0);
}

if (positionals.length < 1 || positionals.length > 2) {
  console.error(HELP);
  process.exit(1);
}

const input = expandPath(positionals[0]);
if (!existsSync(input)) {
  console.error(`Input file not found: ${input}`);
  process.exit(1);
}
const output = positionals[1] ? expandPath(positionals[1]) : input.replace(/\.[^.]+$/, "") + ".m4a";
mkdirSync(dirname(output), { recursive: true });

const tmp = mkdtempSync(join(tmpdir(), "openspeek."));

function have(cmd: string): boolean {
  return spawnSync("which", [cmd]).status === 0;
}

function run(
  cmd: string,
  args: string[],
): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

if (!have("afconvert")) {
  console.error("This script requires afconvert (macOS).");
  process.exit(1);
}

const engineArg = values.engine ?? process.env.ENGINE ?? "auto";
let engine = engineArg;
if (engine === "auto") {
  if (process.env.OPENROUTER_API_KEY) engine = "openrouter";
  else if (have("piper") || run("python3", ["-m", "piper", "--help"]).status === 0)
    engine = "piper";
  else engine = "say";
}
if (!["openrouter", "piper", "say"].includes(engine)) {
  console.error(`Unknown ENGINE: ${engine} (use openrouter, piper, say, or auto)`);
  process.exit(1);
}

let isTTY = process.stdout.isTTY;
let lastBar = "";

function renderBar(done: number, total: number, start: number): void {
  if (!isTTY || values.quiet) return;
  const elapsed = (Date.now() - start) / 1000;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const width = 24;
  const filled = Math.round((width * done) / total);
  const bar = "█".repeat(filled) + "░".repeat(width - filled);
  const line = `[${bar}] ${done}/${total} chunks · ${pct}% · ${fmtDuration(elapsed)}`;
  if (line !== lastBar) {
    process.stdout.write(`\r\x1b[K${line}`);
    lastBar = line;
  }
}

function finishBar(): void {
  if (isTTY && lastBar) process.stdout.write("\n");
}

// ---------------------------------------------------------------------------
// openrouter engine
// ---------------------------------------------------------------------------

async function engineOpenRouter(narration: string): Promise<void> {
  const model = values.model ?? process.env.OR_MODEL ?? "google/gemini-3.1-flash-tts-preview";
  let voice = values.voice ?? process.env.VOICE ?? "";
  if (!voice) {
    if (model.includes("gemini")) voice = "Zephyr";
    else if (model.includes("flux")) voice = "flux-gemma-en";
    else {
      console.error(`Set --voice for model ${model} (see supported voices on openrouter.ai)`);
      process.exit(1);
    }
  }
  if (model.includes("flux") && !voice.startsWith("flux-")) {
    console.warn(
      `⚠ Voice ${voice} looks wrong for Flux; expected "flux-<voice>-en" (see --voices).`,
    );
  }
  const chunkMax = Number(values["chunk-chars"] ?? process.env.OR_CHUNK_CHARS ?? 1500);
  const speedRaw = values.speed ?? process.env.SPEED ?? "";
  const speed = speedRaw === "" ? null : Number(speedRaw);
  if (speed !== null && (Number.isNaN(speed) || speed <= 0)) {
    console.error(`Invalid --speed: ${speedRaw}`);
    process.exit(1);
  }
  const orLogDir =
    process.env.OR_LOG_DIR === ""
      ? ""
      : (process.env.OR_LOG_DIR ?? join(process.env.HOME ?? "", ".hominem", "ai_usage"));
  if (orLogDir) mkdirSync(orLogDir, { recursive: true });

  const chunks = chunkText(narration, chunkMax);
  const start = Date.now();
  let done = 0;
  const pcmParts: Buffer[] = Array.from({ length: chunks.length });
  const meta: { rate: number; channels: number }[] = Array.from({ length: chunks.length });
  let totalCost = 0;

  await runPool(chunks, 4, async (text, idx) => {
    let generationId = "";
    let provider = "";
    // OpenRouter accepts custom TTS model slugs through its OpenAI-compatible
    // endpoint, while the adapter's type is limited to OpenAI's model catalog.
    const adapter = createOpenaiSpeech(
      model as Parameters<typeof createOpenaiSpeech>[0],
      process.env.OPENROUTER_API_KEY!,
      {
        baseURL: "https://openrouter.ai/api/v1",
        fetch: async (url, init) => {
          const res = await globalThis.fetch(url, init);
          generationId = res.headers.get("x-generation-id") ?? "";
          provider = res.headers.get("x-provider-name") ?? "";
          return res;
        },
      },
    );

    try {
      const result = await generateSpeech({
        adapter,
        text,
        voice,
        format: "pcm",
        ...(speed !== null ? { speed } : {}),
        timeout: 180_000,
      });
      const buf = Buffer.from(result.audio, "base64");
      pcmParts[idx] = buf;
      meta[idx] = { rate: 24000, channels: 1 };

      if (orLogDir && generationId) {
        try {
          const d = await fetchGeneration(generationId);
          const cost = typeof d.total_cost === "number" ? d.total_cost : null;
          if (typeof cost === "number") totalCost += cost;
          const createdAt =
            typeof d.created_at === "string" ? d.created_at : new Date().toISOString();
          const created = Math.floor(Date.parse(createdAt) / 1000) || null;
          const ts = new Date().toISOString();
          const log = {
            timestamp: ts,
            model,
            voice,
            chunk: String(idx + 1).padStart(3, "0"),
            input_file: basename(input),
            prompt: text,
            id: generationId,
            created,
            duration_seconds:
              Math.round((buf.length / (meta[idx].rate * meta[idx].channels * 2)) * 100) / 100,
            latency_ms: typeof d.latency === "number" ? d.latency : null,
            provider: (d.provider_name as string) ?? provider,
            usage: {
              prompt_tokens: (d.native_tokens_prompt ?? d.tokens_prompt ?? null) as number | null,
              completion_tokens: (d.native_tokens_completion ?? d.tokens_completion ?? null) as
                | number
                | null,
              total_tokens:
                ((d.native_tokens_prompt ?? 0) as number) +
                  ((d.native_tokens_completion ?? 0) as number) || null,
              cost,
            },
          };
          writeFileSync(
            join(orLogDir, `${ts.replace(/:/g, "-")}.json`),
            JSON.stringify(log, null, 2),
          );
        } catch {
          // logging is best-effort
        }
      }
    } catch (error) {
      throw new Error(
        `OpenRouter TTS failed on chunk ${idx + 1}/${chunks.length}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { cause: error },
      );
    }

    done++;
    renderBar(done, chunks.length, start);
  });
  finishBar();

  const rate = meta[0]?.rate ?? 24000;
  const channels = meta[0]?.channels ?? 1;
  const wav = pcmToWav(Buffer.concat(pcmParts), rate, channels);
  if (output.endsWith(".wav")) {
    writeFileSync(output, wav);
  } else {
    const wavPath = join(tmp, "narration.wav");
    writeFileSync(wavPath, wav);
    const c = run("afconvert", ["-f", "m4af", "-d", "aac", wavPath, output]);
    if (c.status !== 0) throw new Error(c.stderr || `afconvert failed (${c.status})`);
  }
  console.log(
    `✓ Wrote ${output} (${model}: ${voice}, ${chunks.length} chunks, ${fmtDuration((Date.now() - start) / 1000)})`,
  );
  if (totalCost > 0) console.log(`  Cost: $${totalCost.toFixed(4)}`);
}

// ---------------------------------------------------------------------------
// piper engine
// ---------------------------------------------------------------------------

function enginePiper(narration: string): void {
  const dataDir =
    process.env.PIPER_DATA_DIR ?? join(process.env.HOME ?? "", ".local", "share", "piper-tts");
  const voice = values.voice ?? process.env.VOICE ?? "en_US-lessac-high";
  const narrationPath = join(tmp, "narration.txt");
  const wavPath = join(tmp, "narration.wav");
  writeFileSync(narrationPath, narration);

  const piperArgs = (extra: string[]): string[] => [
    ...extra,
    "--data-dir",
    dataDir,
    "--model",
    voice,
    "--sentence-silence",
    "0.4",
    "-i",
    narrationPath,
    "-f",
    wavPath,
  ];
  const runPiper = (): ReturnType<typeof run> =>
    have("piper") ? run("piper", piperArgs([])) : run("python3", ["-m", "piper", ...piperArgs([])]);

  let r = runPiper();
  if (r.status !== 0) {
    console.log(`Downloading piper voice ${voice} (one-time)...`);
    const dl =
      run("python3", ["-m", "piper.download_voices", "--data-dir", dataDir, voice]).status === 0 ||
      run("pipx", [
        "run",
        "--spec",
        "piper-tts",
        "python3",
        "-m",
        "piper.download_voices",
        "--data-dir",
        dataDir,
        voice,
      ]).status === 0;
    if (!dl) {
      console.error(r.stderr || "Piper failed.");
      process.exit(1);
    }
    r = runPiper();
  }
  if (r.status !== 0) {
    console.error(r.stderr || `Piper failed (${r.status}).`);
    process.exit(1);
  }
  if (output.endsWith(".wav")) copyFileSync(wavPath, output);
  else {
    const c = run("afconvert", ["-f", "m4af", "-d", "aac", wavPath, output]);
    if (c.status !== 0) throw new Error(c.stderr || `afconvert failed (${c.status})`);
  }
  console.log(`✓ Wrote ${output} (piper: ${voice})`);
}

// ---------------------------------------------------------------------------
// say engine
// ---------------------------------------------------------------------------

function engineSay(narration: string): void {
  const voice = values.voice ?? process.env.VOICE ?? "Samantha";
  const rate = Number(values.rate ?? process.env.RATE ?? 165);
  const narrationPath = join(tmp, "narration.txt");
  const aiffPath = join(tmp, "narration.aiff");
  writeFileSync(narrationPath, narration);

  const s = run("say", ["-v", voice, "-r", String(rate), "-f", narrationPath, "-o", aiffPath]);
  if (s.status !== 0) {
    console.error(s.stderr || `say() failed for voice ${voice}.`);
    process.exit(1);
  }
  const c = output.endsWith(".wav")
    ? run("afconvert", ["-f", "WAVE", aiffPath, output])
    : run("afconvert", ["-f", "m4af", "-d", "aac", aiffPath, output]);
  if (c.status !== 0) throw new Error(c.stderr || `afconvert failed (${c.status})`);
  console.log(`✓ Wrote ${output} (say: ${voice})`);
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

try {
  const narration = toNarration(readFileSync(input, "utf8"));
  if (engine === "openrouter") await engineOpenRouter(narration);
  else if (engine === "piper") enginePiper(narration);
  else engineSay(narration);
} catch (e) {
  finishBar();
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}
