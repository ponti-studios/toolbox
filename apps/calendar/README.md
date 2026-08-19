# calendar

Apple Calendar CLI for macOS — manage calendars and events from the command line via a native EventKit helper.

## Install

```bash
npm i -g @ponti-studios/calendar
```

## Quick start

```bash
calendar setup
calendar calendars
calendar events --calendar-name "Work" --from 2025-01-01 --to 2025-01-31
```

## Permissions (macOS)

On first run, you may need to grant Calendar access.

1. Run `calendar setup`
2. In **System Settings → Privacy & Security → Calendars**, ensure the terminal or calling application has **Full Access** (not “Add Only”).

## Commands

- `setup` — trigger macOS Calendar permission prompt
- `calendars` — list calendars
- `events` — list events in a range
- `event` — fetch a single event by ID
- `create` — create an event
- `update` — update an event
- `delete` — delete an event
- `freebusy` — show busy time slots
- `config` — set/show/clear default calendar
- `audit` — preview suspicious events and duplicate candidates
- `normalize` — preview or standardize titles as `Category: detail`
- `rollback` — restore title changes from a cleanup manifest
- `preflight` — validate an ICS file before Apple Calendar import
- `verify-import` — reconcile an imported ICS file with EventKit

Run `calendar <command> --help` for command-specific options.

## JSON output

Add `--json` to most commands to output JSON (including errors).

## Date ranges

Date-only `--from` and `--to` values are parsed at local midnight. For example,
`--from 2026-02-27 --to 2026-02-28` covers February 27 only. To include all of
February 28 too, use `--to 2026-03-01` or pass an explicit end time.

## Agent-Ready

Designed for coding agents and automation: structured `--json` output on all commands, distinct exit codes (0=success, 1=runtime, 2=validation, 10=auth), machine-readable error codes, and persistent calendar IDs for reliable targeting.

## Cleanup workflows

### Hominem migration checklist

Use a timestamped directory outside the repository for migration artifacts. The
following sequence is the required local workflow:

```bash
mkdir -p "$TMPDIR/hominem-calendar-2026-08-19"
pnpm --filter @hominem/api export-calendar -- \
  --userEmail charles.ponti@icloud.com \
  --out "$TMPDIR/hominem-calendar-2026-08-19/source.ics"
calendar preflight "$TMPDIR/hominem-calendar-2026-08-19/source.ics" --json \
  > "$TMPDIR/hominem-calendar-2026-08-19/preflight.json"
# Add --expected-events N --expected-recurrences N when the source query counts are known.
```

If preflight fails, do not import the file. In Apple Calendar, create a new
writable **On My Mac** calendar named `Hominem Migration Test`, then import the
ICS file into that calendar. Do not select an iCloud calendar. In System Settings
→ Privacy & Security → Calendars, grant the terminal or calling application
**Full Access**, not Add Only.

After import, resolve the calendar’s persistent ID and verify the count before
any mutation:

```bash
calendar calendars --json
calendar verify-import "$TMPDIR/hominem-calendar-2026-08-19/source.ics" \
  --calendar-id "<migration-calendar-id>" --json \
  > "$TMPDIR/hominem-calendar-2026-08-19/verification.json"
calendar audit --calendar-id "<migration-calendar-id>" --json \
  > "$TMPDIR/hominem-calendar-2026-08-19/audit.json"
calendar normalize --calendar-id "<migration-calendar-id>" --json \
  > "$TMPDIR/hominem-calendar-2026-08-19/normalize.json"
```

`verify-import` accounts for generated recurring occurrences: the hard checks are
unique UID count, non-recurring source count, and recurring series count. Do not
continue if it reports zero events, missing recurrence data, or an unreconciled
count. Near-duplicates and recurrence anomalies are review-only.
Only exact duplicate independent events may be deleted. Review both JSON reports
before using `--apply --yes`; every apply command must provide a manifest path.

Keep `source.ics`, `preflight.json`, EventKit verification, audit/normalize
reports, manifests, and post-cleanup scans together. Repeat the workflow from
production only after local acceptance, using a separate calendar and explicit
production approval. Existing iCloud calendars remain unchanged.

Cleanup commands default to preview-only output. They scan the selected calendar from
`1900-01-01` through `2100-01-01` unless `--from` and `--to` are supplied.

```bash
# Find exact duplicates, close duplicate candidates, repeated same-day activities,
# and timezone-related recurrence shifts.
calendar audit --calendar-id "ABC123" --json

# Delete only exact duplicate independent events after reviewing the preview.
calendar audit --calendar-id "ABC123" --apply --yes --manifest ./audit.json

# Preview title normalization. Recurring events are treated as one series.
calendar normalize --calendar-id "ABC123" --json

# Apply safe deterministic proposals and retain a rollback manifest.
calendar normalize --calendar-id "ABC123" --apply --yes --manifest ./normalization.json
calendar rollback ./normalization.json --yes
```

Audit reports separate high-confidence `likelyDuplicates` from `sameDayRepeats`.
Only exact independent duplicates remain eligible for automatic deletion; all
other duplicate classifications are review-only. One-hour recurrence changes
around daylight-saving seasons are reported as `timezoneShifts`, not corruption
candidates.

The cleanup engine has no calendar-specific title taxonomy. Without `--policy`, it
preserves existing `Category: detail` titles and leaves other titles in review.
Repeated occurrences belonging to the same recurring series are never considered
duplicate events. Series renames use EventKit's future-series scope rather than
creating per-occurrence exceptions.

### Policy files

Pass `--policy policy.json` to provide the user's taxonomy, aliases, patterns,
overrides, and exclusions:

```json
{
  "taxonomy": ["Travel", "Exercise", "Work", "Personal"],
  "aliases": { "trip": "Travel" },
  "patterns": [
    {
      "id": "exercise",
      "match": "^(walk|run|hike)(?:\\s+(.+))?$",
      "category": "Exercise",
      "detail": "$1 $2",
      "confidence": 0.95
    }
  ],
  "overrides": {
    "studio": { "category": "Work", "detail": "Studio", "confidence": 1 }
  },
  "exclusions": ["Private"]
}
```

### Optional local Ollama

Use the local model to discover user-specific patterns before normalization:

```bash
calendar patterns --calendar-id "ABC123" --ollama --policy policy.json \
  --instructions ./calendar-instructions.txt --output proposed-policy.json --json
calendar normalize --calendar-id "ABC123" --policy proposed-policy.json --json
```

The CLI calls `http://127.0.0.1:11434` only; it does not send calendar data to a
remote service. It defaults to `qwen3.5:4b`, validates generated categories and
confidence, and never lets the model mutate Calendar directly. Review and edit the
generated policy before applying it. Unresolved or low-confidence titles remain in
the review output.

Every apply operation writes a timestamped manifest unless `--manifest` supplies its
path. Rollback restores titles only if the title still equals the cleanup-written value,
so it will not overwrite a later manual edit. Duplicate deletions are deliberately not
recreated by rollback.

## Notes

- macOS only (`darwin`), because it uses a native EventKit helper.
- Config path defaults to `~/.calendarrc` but can be overridden via `CALENDAR_CONFIG_PATH` (or `CALENDAR_HOME`). Legacy `ACCLI_*` variables remain supported.
