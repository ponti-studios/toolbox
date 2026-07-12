# Monotone

Content pipeline CLI. Three commands:

```bash
npm install -g @ponti-studios/monotone
monotone rewrite essay.md              # raw notes → polished essay
monotone extract essay.v1.md           # essay → X post + TikTok clips
monotone queue essay.v1.posts.md       # posts → Typefully drafts
```

## Setup

```bash
# 1. Install CLI
npm install -g @ponti-studios/monotone

# 2. Install skills
npx skills add ponti-studios/kernel --all --yes

# 3. Configure
cp .env.example .env
# Add your TYPEFULLY_API_KEY and TYPEFULLY_SOCIAL_SET_ID

# 4. Run
monotone rewrite path/to/essay.md
```

## Requirements

- **Node.js** (runtime)
- **Ollama** (local LLM serving)
- **Skills** installed via `npx skills add ponti-studios/kernel`
- **Typefully API key and social set ID** (for `queue` command)

## Environment

Create a `.env` file in the directory where you run `monotone`:

```bash
TYPEFULLY_API_KEY=
TYPEFULLY_SOCIAL_SET_ID=
OLLAMA_URL=http://localhost:11434
MODEL=gemma4:e2b-mlx
```

Find your Typefully social set IDs:

```bash
curl -H "Authorization: Bearer $TYPEFULLY_API_KEY" https://api.typefully.com/v2/social-sets
```
