# mediakit

Swift CLI for transcribing video files into Markdown using Apple's Speech framework.

## Requirements

- macOS
- Swift 6+
- Speech Recognition permission for the terminal or shell app you run from

## Install

Preferred distribution is via the studio Homebrew tap.

For local development:

```bash
cd apps/mediakit
swift run mediakit -- --help
```

## Command

### `transcribe` - Transcribe a video file into Markdown

```bash
mediakit transcribe <input-video> [--output <path.md>] [--language <locale>] [--timestamps|--no-timestamps] [--overwrite]
```

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `<input-video>` | Video or audio file to transcribe | required |
| `-o, --output <PATH>` | Markdown output file path | `<input>.md` |
| `-l, --language <LOCALE>` | Speech locale, e.g. `en-US` | `en-US` |
| `--timestamps` | Include timestamped paragraph blocks | on |
| `--no-timestamps` | Emit a plain transcript without timestamps | off |
| `--overwrite` | Replace an existing output file | off |

**Examples:**

```bash
mediakit transcribe meeting.mp4
mediakit transcribe interview.mov --output transcript.md
mediakit transcribe lecture.mp4 --language en-US --timestamps
mediakit transcribe clip.mov --no-timestamps --overwrite
```

## Output format

The generated Markdown includes:

- a title based on the source file name
- the source path and language used
- a generated timestamp
- the transcript body, either plain or timestamped

## Notes

- The command uses `Speech` plus `AVFoundation` to extract audio and recognize speech.
- Long or noisy media files may produce lower-quality transcripts.
- If transcription fails because speech recognition permission is denied, grant access in System Settings.
