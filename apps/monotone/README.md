# Monotone

Content pipeline CLI. Three commands:

```bash
npm install -g @hackefeller/monotone
monotone rewrite essay.md              # raw notes → polished essay
monotone extract essay.v1.md           # essay → X post + TikTok clips
monotone queue essay.v1.posts.md       # posts → Typefully drafts
```

## Setup

```bash
# 1. Install CLI
npm install -g @hackefeller/monotone

# 2. Install skills
npx skills add ponti-studios/kernel --all --yes

# 3. Configure
cp .env.example .env
# Add your TYPEFULLY_API_KEY

# 4. Run
monotone rewrite path/to/essay.md
```

## Requirements

- **Node.js** (runtime)
- **Ollama** (local LLM serving)
- **Skills** installed via `npx skills add ponti-studios/kernel`
- **Typefully API key** (for `queue` command)
