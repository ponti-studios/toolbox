# careerkit

CLI for rendering Markdown resumes to DOCX, verifying DOCX text extraction, and running lightweight resume review heuristics.

## Build

```bash
cd apps/careerkit && go build -o ../../target/careerkit ./cmd/careerkit
```

Or from the repo root:

```bash
just build-careerkit
```

## Install

```bash
just install-careerkit
```

That creates `~/.dotfiles/stow/bin/bin/careerkit` as a symlink to `target/careerkit`.

## Run

```bash
./target/careerkit build --input /path/to/resume.md --output /path/to/resume.docx --verify
./target/careerkit verify --input /path/to/resume.md --docx /path/to/resume.docx
./target/careerkit review --input /path/to/resume.md
```

If you do not pass a subcommand, a single path argument is treated as a build input.
