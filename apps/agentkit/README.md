# agentkit

Unified AI agent usage and cost analytics CLI. Scans Claude Code, Codex,
Copilot, OpenRouter, and OpenCode usage logs and reports aggregated cost,
token consumption, and quota usage across providers.

## Quick start

```bash
cd apps/agentkit
npm ci && npm run build
node dist/index.js --help
```

## Commands

- `scan` — scan agent usage logs across configured providers
- `report` — aggregated cost and token report
