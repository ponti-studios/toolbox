# Essay Classifier

CLI tool for organizing and classifying markdown essays using embeddings and LLMs.

## Features

- **5-pass pipeline**: Parse → Embed → Cluster → Classify → Execute
- **Multiple LLM providers**: Ollama (local) or OpenAI
- **Interactive TUI**: Visual cluster exploration with Bubble Tea
- **Auto-classification**: Confidence-based auto-move with review workflow
- **CSV export**: Export move plans for external review

## Installation

```bash
cd apps/essay-classifier
go install ./cmd
```

## Usage

```bash
# Basic usage (set ESSAY_DIR or use --dir)
essay-classifier --dir /path/to/essays

# With custom LLM
essay-classifier --dir /path/to/essays --llm openai --api-key sk-...

# Interactive TUI mode
essay-classifier --dir /path/to/essays --tui

# Execute the move plan
essay-classifier --dir /path/to/essays --execute

# Export to CSV
essay-classifier --dir /path/to/essays --csv move_plan.csv
```

## Options

| Flag | Default | Description |
|------|---------|-------------|
| `--dir` | `$ESSAY_DIR` | Directory containing markdown essays |
| `--llm` | `ollama` | LLM provider: `ollama` or `openai` |
| `--threshold` | `0.75` | Confidence threshold for auto-move |
| `--cluster-threshold` | `0.75` | Clustering distance threshold |
| `--execute` | false | Execute the move plan |
| `--tui` | false | Launch interactive TUI |
| `--resume` | false | Resume from highest completed pass |
| `--csv` | - | Export move plan to CSV |

## Pipeline

1. **Pass 1**: Parse markdown files, extract fingerprints (title, word count, tags)
2. **Pass 2**: Generate embeddings via LLM
3. **Pass 3**: Hierarchical clustering of embeddings
4. **Pass 4**: LLM classification of each essay
5. **Pass 5**: Build move plan based on classifications