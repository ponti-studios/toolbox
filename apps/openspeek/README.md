# openspeek

Convert a Markdown file to an AAC/M4A narration using OpenRouter neural TTS —
[Deepgram Flux](https://developers.deepgram.com/docs/flux-tts/voices) (free) or
Gemini — with local [piper](https://github.com/rhasspy/piper) and macOS `say`
fallbacks. Written in TypeScript, built with [Bun](https://bun.sh).

## Install

```bash
npm install -g @ponti-studios/openspeek
```

Or run straight from the repo (no build needed):

```bash
git clone https://github.com/ponti-studios/toolbox.git
cd toolbox/apps/openspeek
bun install
./openspeek  # or: bun run src/index.ts
```

## Usage

```bash
openspeek INPUT.md [OUTPUT.m4a]
```

`INPUT`/`OUTPUT` accept `$VAR`, `${VAR}`, and `~` expansion. Requires an
`OPENROUTER_API_KEY` for the default engine.

| Flag                  | Meaning                                                                                |
| --------------------- | -------------------------------------------------------------------------------------- |
| `--voices`            | list all Deepgram Flux voices with descriptions and sample clips                       |
| `-v, --voice VOICE`   | voice for the active engine (default `flux-gemma-en` for Flux)                         |
| `-s, --speed RATE`    | Flux speaking-rate multiplier (0.85–1.15)                                              |
| `-m, --model SLUG`    | OpenRouter TTS model (`deepgram/flux-tts:free`, `google/gemini-3.1-flash-tts-preview`) |
| `-e, --engine E`      | `openrouter` \| `piper` \| `say` \| `auto` (default)                                   |
| `-c, --chunk-chars N` | OpenRouter chunk size in chars (default 1500)                                          |
| `-r, --rate WPM`      | macOS `say()` words per minute                                                         |
| `-q, --quiet`         | no progress bar                                                                        |

Examples:

```bash
openspeek "chapter 1.md"                      # default: Flux, gemma voice
openspeek -m deepgram/flux-tts:free -v flux-cliff-en -s 1.1 "chapter 1.md"
openspeek -e say -v Samantha -r 180 "chapter 1.md"
openspeek --voices                             # pick a voice, hear a sample
```

Long inputs are split into ~1500-char chunks synthesized 4 at a time, wrapped
to WAV, and converted to M4A (or kept as `.wav` if the output ends in `.wav`).
Each OpenRouter generation is logged as JSON to `~/.hominem/ai_usage/`
(`OR_LOG_DIR` overrides; empty disables).

## Development

```bash
bun test          # unit tests
bun run typecheck
bun run build     # dist/openspeek.js (node target, for npm)
bun run build:binary  # standalone macOS binary
```

## How it works

1. Strip Markdown to narration text (frontmatter, links, emphasis, lists, …).
2. Split into chunks; synthesize in parallel with TanStack AI's OpenAI speech
   adapter pointed at OpenRouter's `/api/v1/audio/speech` endpoint (PCM 24
   kHz/16-bit).
3. Wrap PCM in WAV; convert to M4A/AAC with `afconvert` (macOS).
4. Log usage (tokens, cost, latency) per generation.

Free on Deepgram Flux; Gemini runs ~$0.06/min.
