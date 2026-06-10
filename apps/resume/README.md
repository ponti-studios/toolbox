# resume

CLI for rendering Markdown resumes to DOCX, verifying DOCX text extraction, and running lightweight resume review heuristics.

## Build

```bash
cd apps/resume && go build -o ../../target/resume ./cmd/resume
```

Or from the repo root:

```bash
just build-resume
```

## Install

```bash
just install-resume
```

That creates `~/.dotfiles/stow/bin/bin/resume` as a symlink to `target/resume`.

## Run

```bash
./target/resume build --input /path/to/resume.md --output /path/to/resume.docx --verify
./target/resume verify --input /path/to/resume.md --docx /path/to/resume.docx
./target/resume review --input /path/to/resume.md
```

If you do not pass a subcommand, a single path argument is treated as a build input.
