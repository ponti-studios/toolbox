# Calendar cleanup agent handoff

Updated: 2026-08-19

## Objective

Continue building a generic Apple Calendar cleanup workflow. The cleanup engine must
work on any user's calendar: calendar-specific labels, aliases, and patterns belong
in a user-supplied policy file, not in TypeScript source.

The safe architecture is:

1. EventKit scans calendar data.
2. Deterministic code applies only an explicit policy.
3. Ollama (local) or OpenRouter (remote, opt-in) optionally discovers policy
   proposals from compact title data.
4. A human reviews the policy.
5. Calendar writes require `--apply --yes` and produce a rollback manifest.

Ollama must never mutate Calendar directly. The OpenRouter path sends only the
compressed title list (top `--max-titles` `{ title, count }` rows) to a remote
model and is opt-in via `--provider openrouter`; the local-Ollama default never
sends data anywhere.

## Current implementation

The relevant package is `/Users/charlesponti/Developer/toolbox/apps/calendar`.

Implemented commands and behavior:

- `calendar audit`: full-range audit by default; exact independent duplicates are
  the only deletion candidates. Near-duplicates and recurrence anomalies are
  report-only. Occurrences from one recurring series are not duplicates.
- `calendar normalize`: deterministic policy-driven title normalization to
  `Category: detail`. Without a policy, canonical titles are preserved and other
  titles remain in review.
- `calendar patterns`: scans unresolved titles, compresses them into frequency
  representatives, and asks local Ollama (default) or OpenRouter
  (`--provider openrouter`, requires `OPENROUTER_API_KEY`) for reusable regex
  policy proposals. This command never writes Calendar.
  `--openrouter-model` selects the remote model (default
  `deepseek/deepseek-v4-flash-0731`, reasoning/thinking disabled).
- `calendar rollback <manifest> --yes`: restores titles only when the current title
  still equals the value written by the manifest. It does not recreate deleted
  duplicates.
- EventKit recurring updates use series/future scope rather than editing generated
  occurrences independently.
- `preflight` and `verify-import` support the Hominem-to-Apple Calendar migration.
- The model-pattern validator is extracted as a pure `proposedPatterns` function:
  a pattern is kept only if its `match` compiles, `category` is in the taxonomy,
  `confidence` is at least `0.9`, and the regex matches at least one example.

Policy shape is documented in `README.md`. The taxonomy is intentionally supplied
by the policy. The starter policy used during the local experiment is outside the
repository at:

`/tmp/hominem-calendar-2026-08-19/pattern-discovery-policy.json`

## Prompt/data optimization

The pattern-discovery path is optimized around the main computer-science constraint:
the model does not need every event instance to infer title conventions.

Current reduction pipeline:

- Exclude titles already classified by deterministic policy rules.
- Clean titles before counting them.
- Group identical cleaned titles and attach a frequency count.
- Sort by frequency and send only the top `--max-titles` representatives (default
  250), each as `{ title, count }`.
- Send user instructions and the taxonomy once, not repeated per event.
- Require regex patterns to match at least one supplied example.
- Require taxonomy membership and confidence of at least `0.9`.
- Use deterministic Ollama settings (`temperature: 0`, bounded `num_predict`).
- Bound the local HTTP request to 120 seconds.

This retains the signal needed for reusable patterns while removing repeated event
instances, descriptions, dates, locations, and other irrelevant personal data.
The discovery result reports both `unresolvedRecords` and `totalUniqueTitles`, so a
future agent can measure compression and choose a larger or smaller representative
budget.

## Local experiment results

The isolated migration calendar is:

`DAF35675-2055-4E50-BF50-C36AF477B5F9`

Artifacts are outside the repository:

`/tmp/hominem-calendar-2026-08-19`

The migration was validated before cleanup:

- source ICS: 3,264 VEVENTs and 3,264 unique UIDs;
- 87 recurrence rules;
- EventKit: 5,458 generated records, 3,264 unique UIDs, 3,177 non-recurring
  events, and 87 recurring series;
- after reviewed duplicate deletion: 5,452 scanned records;
- exact duplicate candidates after deletion: 0;
- likely duplicate candidates: 0;
- near-duplicates remaining for review: 5;
- recurrence timing anomalies: 0 suspicious anomalies; 12 DST/timezone shifts.

Earlier local-only mutations produced:

- `/tmp/hominem-calendar-2026-08-19/walk-dedup-manifest.json`
- `/tmp/hominem-calendar-2026-08-19/normalization-manifest.json`

No production Hominem data or existing iCloud calendar was changed by this
workflow.

## Ollama experiment and known limitation

`ollama` is available at `http://127.0.0.1:11434`.

- `qwen3.5:4b` became unresponsive on a large full-history prompt and was stopped.
  Do not retry the full-history prompt.
- `gemma4:e2b-mlx` responded to a 25-title trial in about 90 seconds.
- The raw response contained malformed patterns: prose was returned in `match`
  where a regex was required. The validator now rejects patterns that do not
  compile and match at least one example.
- The trial also returned potentially useful ambiguous clusters, including
  `Move: Los Angeles` vs `First Arrived In London (2013)`, `Notes Triage`, and
  `Food: Coffee`. These are review leads, not approved classifications.

The prior raw/proposed outputs are:

- `/tmp/hominem-calendar-2026-08-19/pattern-discovery-gemma-v2.json`
- `/tmp/hominem-calendar-2026-08-19/proposed-policy-gemma.json`
- `/tmp/hominem-calendar-2026-08-19/proposed-policy-gemma-v2.json`

Treat those files as experimental artifacts. Re-run with the current validator
before trusting any pattern in them.

## Recommended next steps

1. Run `pnpm build` in `apps/calendar` so `dist` reflects the latest validator.
   DONE — build, tests, and lint are green; `dist` is current.
2. Run a fresh small discovery trial, for example:

   ```bash
   calendar patterns \
     --calendar-id "DAF35675-2055-4E50-BF50-C36AF477B5F9" \
     --ollama \
     --policy /tmp/hominem-calendar-2026-08-19/pattern-discovery-policy.json \
     --max-titles 25 \
     --output /tmp/hominem-calendar-2026-08-19/proposed-policy-current.json \
     --json
   ```

3. Inspect the JSON. Reject patterns that are overly broad, encode personal
   assumptions, lose meaningful detail, or are not supported by multiple examples.
4. Prefer asking Ollama for aliases or narrowly scoped regexes before asking for
   broad semantic categories. A pattern should generalize from title text, not
   infer category from event time, location, or guessed intent.
5. Add a test fixture for malformed model output and a test proving that a valid
   regex must match an example before it enters the proposed policy.
   DONE — `proposedPatterns` is now a pure exported function with two tests covering
   malformed shapes and the match-an-example rule (42 tests passing).
6. If the model remains unreliable, keep the workflow deterministic and use the
   model only to produce review questions and candidate aliases.
7. Apply only after policy review:

   ```bash
   calendar normalize \
     --calendar-id "DAF35675-2055-4E50-BF50-C36AF477B5F9" \
     --policy /tmp/hominem-calendar-2026-08-19/proposed-policy-current.json \
     --apply --yes \
     --manifest /tmp/hominem-calendar-2026-08-19/normalization-current.json \
     --json
   ```

Do not run against production or an existing iCloud calendar until the isolated
local workflow passes review.

## Fresh discovery trial (2026-08-19, current validator)

Run with the freshly built `dist`:

- `qwen3.5:4b` returned invalid pattern JSON (`OLLAMA_UNAVAILABLE`). Same failure
  mode as before; do not rely on it.
- `gemma4:e2b-mlx` responded to the 25-title trial in roughly 90 seconds. The
  validator rejected every proposed pattern (0 kept). Only review leads survived:
  `Tube`?, `Life Refactor` vs `Design Jam`, and `Code` vs `Cycle`.
- Output: `/tmp/hominem-calendar-2026-08-19/proposed-policy-current.json`

The model is still unreliable for producing valid, example-anchored regex
patterns from the small local models. The fallback (step 6 above) is the working
path until a model run produces patterns that pass the validator and review.

## OpenRouter provider (2026-08-19)

A shared `packages/ai` workspace package wraps OpenRouter via TanStack AI
(`@tanstack/ai` + `@tanstack/ai-openai`, `createOpenaiChatCompletions` against
`https://openrouter.ai/api/v1`). It exposes `chatText`, `chatJson` (zod schema),
`chatJsonLoose` (`response_format: json_object`), `openRouterTextAdapter`, and
typed `AiError` codes (`AUTH_MISSING`, `REQUEST_TIMEOUT`, `INVALID_RESPONSE`,
`MODEL_ERROR`, `NETWORK_ERROR`). Provider errors are surfaced instead of being
swallowed by the SDK (the non-streaming `chat()` text path otherwise resolves
`""` on failure — `chatText` uses the streaming path to catch `RUN_ERROR`).

Calendar consumes it as `@ponti-studios/ai` (workspace dependency) with a dynamic
`import()` from CommonJS. `discoverPatternsWithOpenRouter` runs the same
compression + validator pipeline as the Ollama path. Verified live with
`deepseek/deepseek-v4-flash-0731`, `thinking: false`
(`reasoning: { enabled: false }`), ~5s per discovery prompt, schema-valid output.
The prior `qwen/qwen3.5-9b` OpenRouter trials were dropped: slow and
reasoning-dominated.

Example:

```bash
calendar patterns \
  --calendar-id "DAF35675-2055-4E50-BF50-C36AF477B5F9" \
  --provider openrouter \
  --policy /tmp/hominem-calendar-2026-08-19/pattern-discovery-policy.json \
  --max-titles 25 \
  --output /tmp/hominem-calendar-2026-08-19/proposed-policy-openrouter.json \
  --json
```

## Validation status

At the last checkpoint:

- 42 tests passed in `apps/calendar` (two new: malformed pattern shapes and the
  match-an-example rule);
- 8 tests passed in `packages/ai` (auth, adapter, chatText and chatJsonLoose
  error mapping);
- lint and build passed in both packages;
- no Calendar mutation was performed during the validator/provider work.

Run the package checks again after any change:

```bash
cd /Users/charlesponti/Developer/toolbox/apps/calendar
pnpm build
pnpm test
pnpm lint

cd /Users/charlesponti/Developer/toolbox/packages/ai
pnpm build
pnpm test
pnpm lint
```

