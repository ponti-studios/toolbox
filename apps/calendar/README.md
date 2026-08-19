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

Cleanup commands default to preview-only output. They scan the selected calendar from
`1900-01-01` through tomorrow unless `--from` and `--to` are supplied.

```bash
# Find exact duplicate independent events, near-duplicates, and recurring timing anomalies.
calendar audit --calendar-id "ABC123" --json

# Delete only exact duplicate independent events after reviewing the preview.
calendar audit --calendar-id "ABC123" --apply --yes --manifest ./audit.json

# Preview title normalization. Recurring events are treated as one series.
calendar normalize --calendar-id "ABC123" --json

# Apply safe deterministic proposals and retain a rollback manifest.
calendar normalize --calendar-id "ABC123" --apply --yes --manifest ./normalization.json
calendar rollback ./normalization.json --yes
```

The built-in canonical labels are Travel, Exercise, Food, Health, Work, Meetings,
People, Entertainment, Errands, Finance, Home, Learning, Personal, Reminders, and
Holidays. Repeated occurrences belonging to the same recurring series are never
considered duplicate events. Series renames use EventKit's future-series scope rather
than creating per-occurrence exceptions.

### Policy files

Pass `--policy policy.json` to provide exact title overrides or exclusions:

```json
{
  "overrides": {
    "studio": { "category": "Work", "detail": "Studio" }
  },
  "exclusions": ["Private"]
}
```

### Optional local Ollama

Use `--ollama` only for titles that deterministic rules leave for review. The CLI calls
`http://127.0.0.1:11434` only; it does not send calendar data to a remote service. It
defaults to `qwen3.5:4b`, can be changed with `--ollama-model`, and accepts only
high-confidence responses that validate against the built-in taxonomy. Unresolved or
low-confidence titles remain in the review output.

Every apply operation writes a timestamped manifest unless `--manifest` supplies its
path. Rollback restores titles only if the title still equals the cleanup-written value,
so it will not overwrite a later manual edit. Duplicate deletions are deliberately not
recreated by rollback.

## Notes

- macOS only (`darwin`), because it uses a native EventKit helper.
- Config path defaults to `~/.calendarrc` but can be overridden via `CALENDAR_CONFIG_PATH` (or `CALENDAR_HOME`). Legacy `ACCLI_*` variables remain supported.
