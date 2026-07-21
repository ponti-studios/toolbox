# Monotone

Content pipeline CLI. Three commands:

```bash
npm install -g @hackefeller/monotone
monotone run essay.md --skill write-essay          # notes → essay
monotone run essay.v1.md --skill extract-posts      # essay → social posts
monotone run essay.v1.md --skill write-video        # essay → video script
monotone queue essay.v1.v1.posts.json               # posts → Typefully
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
# Add TYPEFULLY_API_KEY and TYPEFULLY_SOCIAL_SET_ID

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

## Queueing Posts

`extract-posts` writes queueable JSON by default:

```json
{
  "posts": [{ "id": 1, "type": "long_post", "text": "..." }],
  "tiktok_clips": [{ "hook": "...", "timestamp": "...", "visual": "...", "caption": "..." }]
}
```

Only `posts` are queued to Typefully. `tiktok_clips` are kept as creative metadata.

```bash
monotone queue essay.v2.posts.json --dry-run
monotone queue essay.v2.posts.json --social-set "$TYPEFULLY_SOCIAL_SET_ID"
```

Legacy `.posts.md` files using the old `## 1. [type]` heading format are still accepted.

## Requirements

- **Node.js** or **Bun** (runtime)
- **Ollama** (local LLM serving)
- **Skills** installed via `npx skills add ponti-studios/kernel`
- **Typefully API key and social set ID** (for `queue` command)
