# Monotone

Content pipeline CLI. Three commands:

```bash
npm install -g @hackefeller/monotone
monotone run essay.md --skill write-essay          # notes → essay
monotone run essay.v1.md --skill extract-posts      # essay → social posts
monotone run essay.v1.md --skill write-video        # essay → video script
monotone queue essay.v1.v1.posts.md                 # posts → Typefully
monotone logs                                        # view Ollama history
```

## Setup

```bash
# 1. Install skills
npx skills add ponti-studios/kernel --all --yes

# 2. Install CLI
npm install -g @hackefeller/monotone

# 3. Configure
cp .env.example .env
# Add your TYPEFULLY_API_KEY

# 4. Run
monotone run path/to/essay.md --skill write-essay
```

## Available Skills

| Skill | Description |
|---|---|
| `write-essay` | Raw notes → polished essay (300-800 words) |
| `write-video` | Idea/essay → short-form video script with visual cues |
| `extract-posts` | Essay → 1 long-form X post + TikTok clip ideas |

Voice rules come from `kernel-voice`. Override with `--voice <skill>`.

## Requirements

- **Node.js** or **Bun** (runtime)
- **Ollama** (local LLM serving)
- **Skills** installed via `npx skills add ponti-studios/kernel`
- **Typefully API key** (for `queue` command)
