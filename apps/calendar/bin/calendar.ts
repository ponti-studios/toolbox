#!/usr/bin/env node
// @ts-nocheck
"use strict";

const { runScript, ERROR_CODES, EXIT_VALIDATION_ERROR } = require("../lib/calendar-helper-runner");
const output = require("../lib/output");
const config = require("../lib/config");
const cleanup = require("../lib/cleanup");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const readline = require("readline");

// Parse command line arguments
// Returns { ok: true, result: {...} } or { ok: false, error: {...} }
function parseArgs(args) {
  const result = {
    command: null,
    positional: [],
    flags: {},
    arrays: {},
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg.startsWith("--")) {
      const key = arg.slice(2);

      // Handle boolean flags
      if (
        key === "json" ||
        key === "help" ||
        key === "version" ||
        key === "all-day" ||
        key === "no-all-day" ||
        key === "apply" ||
        key === "yes" ||
        key === "ollama"
      ) {
        result.flags[key] = true;
        i++;
        continue;
      }

      // Handle array flags (--calendar, --calendar-id, --calendar-index can be repeated)
      if (key === "calendar" || key === "calendar-id" || key === "calendar-index") {
        const value = args[i + 1];
        if (value === undefined || value.startsWith("--")) {
          return {
            ok: false,
            error: { code: ERROR_CODES.MISSING_REQUIRED, message: `--${key} requires a value` },
          };
        }
        if (!result.arrays[key]) {
          result.arrays[key] = [];
        }
        result.arrays[key].push(value);
        i += 2;
        continue;
      }

      // Handle key-value flags
      const value = args[i + 1];
      if (value === undefined || value.startsWith("--")) {
        return {
          ok: false,
          error: { code: ERROR_CODES.MISSING_REQUIRED, message: `--${key} requires a value` },
        };
      }
      result.flags[key] = value;
      i += 2;
    } else if (!result.command) {
      result.command = arg;
      i++;
    } else {
      result.positional.push(arg);
      i++;
    }
  }

  return { ok: true, result };
}

// Validate datetime format
function isValidDatetime(str) {
  // Date only: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const date = new Date(str + "T00:00:00");
    return !isNaN(date.getTime());
  }
  // Datetime: YYYY-MM-DDTHH:mm or YYYY-MM-DDTHH:mm:ss
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(str)) {
    const date = new Date(str);
    return !isNaN(date.getTime());
  }
  return false;
}

function isDateOnly(str) {
  return /^\d{4}-\d{2}-\d{2}$/.test(str);
}

// Show help
function showHelp(command = null) {
  const globalHelp = `
  calendar - Apple Calendar CLI for macOS

USAGE:
  calendar <command> [options]

COMMANDS:
  setup        Trigger macOS Calendars permission
  calendars    List all calendars
  events       List events from a calendar
  event        Get a single event by ID
  create       Create a new event
  update       Update an existing event
  delete       Delete an event
  freebusy     Get busy time slots
  config       Manage configuration (default calendar)
  audit        Find duplicate and suspicious events
  normalize    Preview or normalize event titles
  rollback     Restore titles from a cleanup manifest

GLOBAL OPTIONS:
  --json       Output JSON (errors included as JSON)
  --help       Show help information
  --version    Print version

DATETIME FORMATS:
  Timed events: YYYY-MM-DDTHH:mm or YYYY-MM-DDTHH:mm:ss
  All-day:      YYYY-MM-DD

EXAMPLES:
  calendar setup
  calendar calendars --json
  calendar events Work --from 2025-01-01 --to 2025-01-31
  calendar create Work --summary "Meeting" --start 2025-01-15T14:00 --end 2025-01-15T15:00
`;

  const commandHelp = {
    setup: `
  calendar setup - Trigger macOS Calendar permission

USAGE:
  calendar setup [--json]

DESCRIPTION:
  Triggers the macOS Calendars permission prompt by accessing calendar data via EventKit.
  Run this first if you see "NOT_AUTHORIZED" errors.
  Note: On recent macOS versions the Calendars permission may be set to "Add Only" by default; calendar needs "Full Access".
  In System Settings > Privacy & Security > Calendars, click "Options…" next to the terminal or calling app and select "Full Access".

EXAMPLES:
  calendar setup
  calendar setup --json
`,
    calendars: `
  calendar calendars - List all calendars

USAGE:
  calendar calendars [--json]

DESCRIPTION:
  Lists all calendars with their names and persistent IDs.

EXAMPLES:
  calendar calendars
  calendar calendars --json
`,
    events: `
  calendar events - List events from a calendar

USAGE:
  calendar events <calendarName> [options]

OPTIONS:
  --calendar-id <id>        Persistent calendar ID (recommended)
  --calendar-index <index>  Unstable calendar index (deprecated)
  --calendar-name <name>    Calendar name (exact match)
  --from <datetime>    Start of range (default: now)
  --to <datetime>      End of range (default: from + 7 days)
  --max <n>            Maximum events to return (default: 50)
  --query <q>          Case-insensitive filter on summary/location/description
  --json               Output JSON

DATE RANGES:
  Date-only values are parsed at local midnight. For example,
  --from 2026-02-27 --to 2026-02-28 covers Feb 27 only.

EXAMPLES:
  calendar events Work
  calendar events --calendar-id "ABC123-DEF456-..." --from 2025-01-01 --to 2025-01-31
  calendar events Work --query "standup" --max 10
`,
    event: `
  calendar event - Get a single event by ID

USAGE:
  calendar event <calendarName> <eventId> [options]

OPTIONS:
  --calendar-id <id>        Persistent calendar ID (recommended)
  --calendar-index <index>  Unstable calendar index (deprecated)
  --calendar-name <name>    Calendar name (exact match)
  --json               Output JSON

EXAMPLES:
  calendar event Work event-id-123
  calendar event --calendar-id "ABC123" event-id-123 --json
`,
    create: `
  calendar create - Create a new event

USAGE:
  calendar create <calendarName> --summary <s> --start <datetime> --end <datetime> [options]

OPTIONS:
  --calendar-id <id>        Persistent calendar ID (recommended)
  --calendar-index <index>  Unstable calendar index (deprecated)
  --calendar-name <name>    Calendar name (exact match)
  --summary <s>        Event title (required)
  --start <datetime>   Start time (required)
  --end <datetime>     End time (required)
  --location <l>       Event location
  --description <d>    Event description
  --all-day            Create an all-day event
  --json               Output JSON

EXAMPLES:
  calendar create Work --summary "Meeting" --start 2025-01-15T14:00 --end 2025-01-15T15:00
  calendar create Personal --summary "Holiday" --start 2025-12-25 --end 2025-12-25 --all-day
`,
    update: `
  calendar update - Update an existing event

USAGE:
  calendar update <calendarName> <eventId> [options]

OPTIONS:
  --calendar-id <id>        Persistent calendar ID (recommended)
  --calendar-index <index>  Unstable calendar index (deprecated)
  --calendar-name <name>    Calendar name (exact match)
  --summary <s>        New event title
  --start <datetime>   New start time
  --end <datetime>     New end time
  --location <l>       New location
  --description <d>    New description
  --all-day            Convert to all-day event
  --no-all-day         Convert to timed event
  --json               Output JSON

EXAMPLES:
  calendar update Work event-id-123 --summary "Updated meeting"
  calendar update Work event-id-123 --start 2025-01-15T15:00 --end 2025-01-15T16:00
`,
    delete: `
  calendar delete - Delete an event

USAGE:
  calendar delete <calendarName> <eventId> [options]

OPTIONS:
  --calendar-id <id>        Persistent calendar ID (recommended)
  --calendar-index <index>  Unstable calendar index (deprecated)
  --calendar-name <name>    Calendar name (exact match)
  --json               Output JSON

EXAMPLES:
  calendar delete Work event-id-123
  calendar delete --calendar-id "ABC123" event-id-123
`,
    freebusy: `
  calendar freebusy - Get busy time slots

USAGE:
  calendar freebusy --calendar <name> --from <datetime> --to <datetime> [options]

OPTIONS:
  --calendar <name>    Calendar name (can be repeated)
  --calendar-id <id>        Persistent calendar ID (can be repeated)
  --calendar-index <index>  Unstable calendar index (can be repeated)
  --from <datetime>    Start of range (required)
  --to <datetime>      End of range (required)
  --json               Output JSON

DESCRIPTION:
  Shows busy time slots across one or more calendars.
  Excludes cancelled, declined, and "free/transparent" events.

EXAMPLES:
  calendar freebusy --calendar Work --calendar Personal --from 2025-01-15 --to 2025-01-16
  calendar freebusy --calendar-id "ABC123-DEF456-..." --from 2025-01-15T09:00 --to 2025-01-15T18:00
`,
    config: `
  calendar config - Manage configuration

USAGE:
  calendar config <action> [options]

ACTIONS:
  set-default    Set the default calendar
  show           Show current configuration
  clear          Clear the default calendar setting

OPTIONS (for set-default):
  --calendar <name>         Calendar name (non-interactive)
  --calendar-id <id>        Persistent calendar ID (non-interactive)
  --json                    Output JSON

DESCRIPTION:
  Manages calendar configuration stored in ~/.calendarrc.
  When a default calendar is set, commands like events, create, update, delete
  will use it automatically if no calendar is specified.

EXAMPLES:
  calendar config set-default                           # Interactive selection
  calendar config set-default --calendar Work           # Set by name
  calendar config set-default --calendar-id "ABC123..." # Set by ID
  calendar config show
  calendar config clear
`,
    audit: `
  calendar audit - Find duplicate and suspicious events

USAGE:
  calendar audit <calendarName> [--calendar-id <id>] [--from <date>] [--to <date>] [--apply --yes] [--manifest <path>] [--json]

DESCRIPTION:
  Scans all available history by default. It reports exact duplicates, same-day near-duplicates,
  and recurring series with inconsistent occurrence times. --apply --yes removes only exact,
  independent duplicates and writes a manifest.
`,
    normalize: `
  calendar normalize - Standardize event titles

USAGE:
  calendar normalize <calendarName> [--calendar-id <id>] [--from <date>] [--to <date>] [--policy <path>] [--ollama] [--ollama-model <model>] [--apply --yes] [--manifest <path>] [--json]

DESCRIPTION:
  Previews canonical Category: detail titles by default. Recurring events are changed as a series.
  --ollama uses only the local Ollama service for unresolved titles; low-confidence results remain
  in review. --apply requires --yes and writes a rollback manifest.
`,
    rollback: `
  calendar rollback - Restore titles from a cleanup manifest

USAGE:
  calendar rollback <manifest> --yes [--json]

DESCRIPTION:
  Restores title changes only when the event still has the title written by the cleanup run.
  Deleted duplicate events are intentionally not recreated.
`,
  };

  if (command && commandHelp[command]) {
    console.log(commandHelp[command].trim());
  } else {
    console.log(globalHelp.trim());
  }
}

function promptYesNo(question) {
  if (!process.stdin.isTTY) return Promise.resolve(false);

  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      const normalized = String(answer || "")
        .trim()
        .toLowerCase();
      resolve(normalized === "y" || normalized === "yes");
    });
  });
}

function openCalendarsPrivacySettings() {
  const url = "x-apple.systempreferences:com.apple.preference.security?Privacy_Calendars";
  spawnSync("open", [url], { stdio: "ignore" });
}

// Main command handlers
async function handleSetup(args) {
  const result = await runScript("setup", { json: !!args.flags.json });

  if (result.success) {
    output.output(result.data, {
      json: args.flags.json,
      formatter: output.formatSetup,
    });
  } else {
    output.outputError(result.error, { json: args.flags.json });

    if (!args.flags.json && result.error && result.error.code === ERROR_CODES.NOT_AUTHORIZED) {
      const shouldOpen = await promptYesNo(
        "Open System Settings > Privacy & Security > Calendars now? (Then click Options… and set Full Access for the terminal or calling app.) [y/N] ",
      );
      if (shouldOpen) openCalendarsPrivacySettings();
    }
  }

  process.exitCode = result.exitCode;
  return;
}

async function handleCalendars(args) {
  const result = await runScript("calendars", {});

  if (result.success) {
    output.output(result.data, {
      json: args.flags.json,
      formatter: output.formatCalendars,
    });
  } else {
    output.outputError(result.error, { json: args.flags.json });
  }

  process.exitCode = result.exitCode;
  return;
}

async function handleEvents(args) {
  const calendarNamePositional = args.positional[0];
  const calendarNameFlag = args.flags["calendar-name"];
  const calendarIds = args.arrays["calendar-id"] || [];
  const calendarIndexes = args.arrays["calendar-index"] || [];

  if (calendarNamePositional && calendarNameFlag) {
    output.outputError(
      {
        code: ERROR_CODES.INVALID_ARGUMENT,
        message: "Specify calendar as positional <calendarName> or via --calendar-name, not both",
      },
      { json: args.flags.json },
    );
    process.exitCode = EXIT_VALIDATION_ERROR;
    return;
  }

  if (calendarIndexes.length > 1) {
    output.outputError(
      {
        code: ERROR_CODES.INVALID_ARGUMENT,
        message: "Only one --calendar-index is allowed for this command",
      },
      { json: args.flags.json },
    );
    process.exitCode = EXIT_VALIDATION_ERROR;
    return;
  }

  if (calendarIds.length > 1) {
    output.outputError(
      {
        code: ERROR_CODES.INVALID_ARGUMENT,
        message: "Only one --calendar-id is allowed for this command",
      },
      { json: args.flags.json },
    );
    process.exitCode = EXIT_VALIDATION_ERROR;
    return;
  }

  const calendarIndex = calendarIndexes.length === 1 ? calendarIndexes[0] : null;
  const calendarId = calendarIds.length === 1 ? calendarIds[0] : null;
  const calendarName = calendarNameFlag || calendarNamePositional || null;

  let resolvedCalendarId = calendarId || null;
  let resolvedCalendarIndex = calendarIndex;

  if (resolvedCalendarId && resolvedCalendarIndex) {
    output.outputError(
      {
        code: ERROR_CODES.INVALID_ARGUMENT,
        message: "Use either --calendar-id or --calendar-index, not both",
      },
      { json: args.flags.json },
    );
    process.exitCode = EXIT_VALIDATION_ERROR;
    return;
  }

  // Backward compatibility: numeric --calendar-id used to be an index
  if (resolvedCalendarId && /^\d+$/.test(resolvedCalendarId) && !resolvedCalendarIndex) {
    if (!args.flags.json) {
      console.error(
        "Warning: numeric --calendar-id is deprecated; use --calendar-index or a persistent --calendar-id from `accli calendars`.",
      );
    }
    resolvedCalendarIndex = resolvedCalendarId;
    resolvedCalendarId = null;
  }

  if (!calendarName && !resolvedCalendarId && !resolvedCalendarIndex) {
    // Check for default calendar
    const defaultId = config.getDefaultCalendarId();
    if (defaultId) {
      resolvedCalendarId = defaultId;
    } else {
      output.outputError(
        {
          code: ERROR_CODES.MISSING_REQUIRED,
          message:
            "Calendar name, --calendar-name, --calendar-id, or --calendar-index is required (or set a default with `accli config set-default`)",
        },
        { json: args.flags.json },
      );
      process.exitCode = EXIT_VALIDATION_ERROR;
      return;
    }
  }

  // Validate datetime formats
  if (args.flags.from && !isValidDatetime(args.flags.from)) {
    output.outputError(
      {
        code: ERROR_CODES.INVALID_DATETIME,
        message: `Invalid --from datetime: ${args.flags.from}`,
      },
      { json: args.flags.json },
    );
    process.exitCode = EXIT_VALIDATION_ERROR;
    return;
  }

  if (args.flags.to && !isValidDatetime(args.flags.to)) {
    output.outputError(
      { code: ERROR_CODES.INVALID_DATETIME, message: `Invalid --to datetime: ${args.flags.to}` },
      { json: args.flags.json },
    );
    process.exitCode = EXIT_VALIDATION_ERROR;
    return;
  }

  const scriptArgs = {
    calendarName: calendarName || null,
    calendarId: resolvedCalendarId,
    calendarIndex: resolvedCalendarIndex,
    from: args.flags.from || null,
    to: args.flags.to || null,
    max: args.flags.max ? parseInt(args.flags.max, 10) : 50,
    query: args.flags.query || null,
  };

  const result = await runScript("events", scriptArgs);

  if (result.success) {
    output.output(result.data, {
      json: args.flags.json,
      formatter: output.formatEvents,
    });
  } else {
    output.outputError(result.error, { json: args.flags.json });
  }

  process.exitCode = result.exitCode;
  return;
}

async function handleEvent(args) {
  const calendarNameFlag = args.flags["calendar-name"];
  const calendarIds = args.arrays["calendar-id"] || [];
  const calendarIndexes = args.arrays["calendar-index"] || [];

  if (calendarIndexes.length > 1) {
    output.outputError(
      {
        code: ERROR_CODES.INVALID_ARGUMENT,
        message: "Only one --calendar-index is allowed for this command",
      },
      { json: args.flags.json },
    );
    process.exitCode = EXIT_VALIDATION_ERROR;
    return;
  }

  if (calendarIds.length > 1) {
    output.outputError(
      {
        code: ERROR_CODES.INVALID_ARGUMENT,
        message: "Only one --calendar-id is allowed for this command",
      },
      { json: args.flags.json },
    );
    process.exitCode = EXIT_VALIDATION_ERROR;
    return;
  }

  const calendarIndex = calendarIndexes.length === 1 ? calendarIndexes[0] : null;
  const calendarId = calendarIds.length === 1 ? calendarIds[0] : null;

  let resolvedCalendarId = calendarId || null;
  let resolvedCalendarIndex = calendarIndex;

  if (resolvedCalendarId && resolvedCalendarIndex) {
    output.outputError(
      {
        code: ERROR_CODES.INVALID_ARGUMENT,
        message: "Use either --calendar-id or --calendar-index, not both",
      },
      { json: args.flags.json },
    );
    process.exitCode = EXIT_VALIDATION_ERROR;
    return;
  }

  if (resolvedCalendarId && /^\d+$/.test(resolvedCalendarId) && !resolvedCalendarIndex) {
    if (!args.flags.json) {
      console.error(
        "Warning: numeric --calendar-id is deprecated; use --calendar-index or a persistent --calendar-id from `accli calendars`.",
      );
    }
    resolvedCalendarIndex = resolvedCalendarId;
    resolvedCalendarId = null;
  }

  // Determine if calendar is already specified via flags
  const calendarFromFlags = calendarNameFlag || resolvedCalendarId || resolvedCalendarIndex;
  const defaultCalendarId = config.getDefaultCalendarId();

  // Parse positionals based on count and whether calendar is specified via flags
  // Rules:
  //   - 2 positionals: <calendarName> <eventId> (always, even if default exists - allows override)
  //   - 1 positional + calendar from flags: <eventId>
  //   - 1 positional + default exists (no flags): <eventId> (use default)
  //   - 1 positional + no default (no flags): <calendarName> (eventId missing error)
  //   - 0 positionals: eventId missing error
  let calendarName = calendarNameFlag || null;
  let eventId;

  if (args.positional.length >= 2) {
    // Two or more positionals: first is calendar name, second is eventId
    if (calendarFromFlags) {
      output.outputError(
        {
          code: ERROR_CODES.INVALID_ARGUMENT,
          message:
            "Too many positional arguments. When using --calendar-id/--calendar-index/--calendar-name, only provide <eventId>",
        },
        { json: args.flags.json },
      );
      process.exitCode = EXIT_VALIDATION_ERROR;
      return;
    }
    calendarName = args.positional[0];
    eventId = args.positional[1];
  } else if (args.positional.length === 1) {
    if (calendarFromFlags) {
      // Calendar from flags, positional is eventId
      eventId = args.positional[0];
    } else if (defaultCalendarId) {
      // Use default calendar, positional is eventId
      resolvedCalendarId = defaultCalendarId;
      eventId = args.positional[0];
    } else {
      // No calendar specified anywhere - positional must be calendar name, eventId is missing
      calendarName = args.positional[0];
      eventId = undefined;
    }
  }
  // else: 0 positionals, eventId will be undefined

  // Apply default calendar if no calendar specified
  if (!calendarName && !resolvedCalendarId && !resolvedCalendarIndex) {
    if (defaultCalendarId) {
      resolvedCalendarId = defaultCalendarId;
    } else {
      output.outputError(
        {
          code: ERROR_CODES.MISSING_REQUIRED,
          message:
            "Calendar name, --calendar-name, --calendar-id, or --calendar-index is required (or set a default with `accli config set-default`)",
        },
        { json: args.flags.json },
      );
      process.exitCode = EXIT_VALIDATION_ERROR;
      return;
    }
  }

  if (!eventId) {
    output.outputError(
      { code: ERROR_CODES.MISSING_REQUIRED, message: "Event ID is required" },
      { json: args.flags.json },
    );
    process.exitCode = EXIT_VALIDATION_ERROR;
    return;
  }

  const scriptArgs = {
    calendarName: calendarName || null,
    calendarId: resolvedCalendarId,
    calendarIndex: resolvedCalendarIndex,
    eventId,
  };

  const result = await runScript("event", scriptArgs);

  if (result.success) {
    output.output(result.data, {
      json: args.flags.json,
      formatter: output.formatEventDetail,
    });
  } else {
    output.outputError(result.error, { json: args.flags.json });
  }

  process.exitCode = result.exitCode;
  return;
}

async function handleCreate(args) {
  const calendarNamePositional = args.positional[0];
  const calendarNameFlag = args.flags["calendar-name"];
  const calendarIds = args.arrays["calendar-id"] || [];
  const calendarIndexes = args.arrays["calendar-index"] || [];

  if (calendarNamePositional && calendarNameFlag) {
    output.outputError(
      {
        code: ERROR_CODES.INVALID_ARGUMENT,
        message: "Specify calendar as positional <calendarName> or via --calendar-name, not both",
      },
      { json: args.flags.json },
    );
    process.exitCode = EXIT_VALIDATION_ERROR;
    return;
  }

  if (calendarIndexes.length > 1) {
    output.outputError(
      {
        code: ERROR_CODES.INVALID_ARGUMENT,
        message: "Only one --calendar-index is allowed for this command",
      },
      { json: args.flags.json },
    );
    process.exitCode = EXIT_VALIDATION_ERROR;
    return;
  }

  if (calendarIds.length > 1) {
    output.outputError(
      {
        code: ERROR_CODES.INVALID_ARGUMENT,
        message: "Only one --calendar-id is allowed for this command",
      },
      { json: args.flags.json },
    );
    process.exitCode = EXIT_VALIDATION_ERROR;
    return;
  }

  const calendarIndex = calendarIndexes.length === 1 ? calendarIndexes[0] : null;
  const calendarId = calendarIds.length === 1 ? calendarIds[0] : null;
  const calendarName = calendarNameFlag || calendarNamePositional || null;

  let resolvedCalendarId = calendarId || null;
  let resolvedCalendarIndex = calendarIndex;

  if (resolvedCalendarId && resolvedCalendarIndex) {
    output.outputError(
      {
        code: ERROR_CODES.INVALID_ARGUMENT,
        message: "Use either --calendar-id or --calendar-index, not both",
      },
      { json: args.flags.json },
    );
    process.exitCode = EXIT_VALIDATION_ERROR;
    return;
  }

  if (resolvedCalendarId && /^\d+$/.test(resolvedCalendarId) && !resolvedCalendarIndex) {
    if (!args.flags.json) {
      console.error(
        "Warning: numeric --calendar-id is deprecated; use --calendar-index or a persistent --calendar-id from `accli calendars`.",
      );
    }
    resolvedCalendarIndex = resolvedCalendarId;
    resolvedCalendarId = null;
  }

  if (!calendarName && !resolvedCalendarId && !resolvedCalendarIndex) {
    // Check for default calendar
    const defaultId = config.getDefaultCalendarId();
    if (defaultId) {
      resolvedCalendarId = defaultId;
    } else {
      output.outputError(
        {
          code: ERROR_CODES.MISSING_REQUIRED,
          message:
            "Calendar name, --calendar-name, --calendar-id, or --calendar-index is required (or set a default with `accli config set-default`)",
        },
        { json: args.flags.json },
      );
      process.exitCode = EXIT_VALIDATION_ERROR;
      return;
    }
  }

  if (!args.flags.summary) {
    output.outputError(
      { code: ERROR_CODES.MISSING_REQUIRED, message: "--summary is required" },
      { json: args.flags.json },
    );
    process.exitCode = EXIT_VALIDATION_ERROR;
    return;
  }

  if (!args.flags.start) {
    output.outputError(
      { code: ERROR_CODES.MISSING_REQUIRED, message: "--start is required" },
      { json: args.flags.json },
    );
    process.exitCode = EXIT_VALIDATION_ERROR;
    return;
  }

  if (!args.flags.end) {
    output.outputError(
      { code: ERROR_CODES.MISSING_REQUIRED, message: "--end is required" },
      { json: args.flags.json },
    );
    process.exitCode = EXIT_VALIDATION_ERROR;
    return;
  }

  // Validate datetime formats
  if (!isValidDatetime(args.flags.start)) {
    output.outputError(
      {
        code: ERROR_CODES.INVALID_DATETIME,
        message: `Invalid --start datetime: ${args.flags.start}`,
      },
      { json: args.flags.json },
    );
    process.exitCode = EXIT_VALIDATION_ERROR;
    return;
  }

  if (!isValidDatetime(args.flags.end)) {
    output.outputError(
      { code: ERROR_CODES.INVALID_DATETIME, message: `Invalid --end datetime: ${args.flags.end}` },
      { json: args.flags.json },
    );
    process.exitCode = EXIT_VALIDATION_ERROR;
    return;
  }

  const allDay = args.flags["all-day"] || false;

  // Validate all-day format
  if (allDay) {
    if (!isDateOnly(args.flags.start) || !isDateOnly(args.flags.end)) {
      output.outputError(
        {
          code: ERROR_CODES.INVALID_DATETIME,
          message: "--all-day requires YYYY-MM-DD format for --start and --end",
        },
        { json: args.flags.json },
      );
      process.exitCode = EXIT_VALIDATION_ERROR;
      return;
    }
  }

  const scriptArgs = {
    calendarName: calendarName || null,
    calendarId: resolvedCalendarId,
    calendarIndex: resolvedCalendarIndex,
    summary: args.flags.summary,
    start: args.flags.start,
    end: args.flags.end,
    location: args.flags.location || null,
    description: args.flags.description || null,
    allDay,
  };

  const result = await runScript("create", scriptArgs);

  if (result.success) {
    output.output(result.data, {
      json: args.flags.json,
      formatter: output.formatCreate,
    });
  } else {
    output.outputError(result.error, { json: args.flags.json });
  }

  process.exitCode = result.exitCode;
  return;
}

async function handleUpdate(args) {
  const calendarNameFlag = args.flags["calendar-name"];
  const calendarIds = args.arrays["calendar-id"] || [];
  const calendarIndexes = args.arrays["calendar-index"] || [];

  if (calendarIndexes.length > 1) {
    output.outputError(
      {
        code: ERROR_CODES.INVALID_ARGUMENT,
        message: "Only one --calendar-index is allowed for this command",
      },
      { json: args.flags.json },
    );
    process.exitCode = EXIT_VALIDATION_ERROR;
    return;
  }

  if (calendarIds.length > 1) {
    output.outputError(
      {
        code: ERROR_CODES.INVALID_ARGUMENT,
        message: "Only one --calendar-id is allowed for this command",
      },
      { json: args.flags.json },
    );
    process.exitCode = EXIT_VALIDATION_ERROR;
    return;
  }

  const calendarIndex = calendarIndexes.length === 1 ? calendarIndexes[0] : null;
  const calendarId = calendarIds.length === 1 ? calendarIds[0] : null;

  let resolvedCalendarId = calendarId || null;
  let resolvedCalendarIndex = calendarIndex;

  if (resolvedCalendarId && resolvedCalendarIndex) {
    output.outputError(
      {
        code: ERROR_CODES.INVALID_ARGUMENT,
        message: "Use either --calendar-id or --calendar-index, not both",
      },
      { json: args.flags.json },
    );
    process.exitCode = EXIT_VALIDATION_ERROR;
    return;
  }

  if (resolvedCalendarId && /^\d+$/.test(resolvedCalendarId) && !resolvedCalendarIndex) {
    if (!args.flags.json) {
      console.error(
        "Warning: numeric --calendar-id is deprecated; use --calendar-index or a persistent --calendar-id from `accli calendars`.",
      );
    }
    resolvedCalendarIndex = resolvedCalendarId;
    resolvedCalendarId = null;
  }

  // Determine if calendar is already specified via flags
  const calendarFromFlags = calendarNameFlag || resolvedCalendarId || resolvedCalendarIndex;
  const defaultCalendarId = config.getDefaultCalendarId();

  // Parse positionals based on count and whether calendar is specified via flags
  // Rules:
  //   - 2 positionals: <calendarName> <eventId> (always, even if default exists - allows override)
  //   - 1 positional + calendar from flags: <eventId>
  //   - 1 positional + default exists (no flags): <eventId> (use default)
  //   - 1 positional + no default (no flags): <calendarName> (eventId missing error)
  //   - 0 positionals: eventId missing error
  let calendarName = calendarNameFlag || null;
  let eventId;

  if (args.positional.length >= 2) {
    // Two or more positionals: first is calendar name, second is eventId
    if (calendarFromFlags) {
      output.outputError(
        {
          code: ERROR_CODES.INVALID_ARGUMENT,
          message:
            "Too many positional arguments. When using --calendar-id/--calendar-index/--calendar-name, only provide <eventId>",
        },
        { json: args.flags.json },
      );
      process.exitCode = EXIT_VALIDATION_ERROR;
      return;
    }
    calendarName = args.positional[0];
    eventId = args.positional[1];
  } else if (args.positional.length === 1) {
    if (calendarFromFlags) {
      // Calendar from flags, positional is eventId
      eventId = args.positional[0];
    } else if (defaultCalendarId) {
      // Use default calendar, positional is eventId
      resolvedCalendarId = defaultCalendarId;
      eventId = args.positional[0];
    } else {
      // No calendar specified anywhere - positional must be calendar name, eventId is missing
      calendarName = args.positional[0];
      eventId = undefined;
    }
  }
  // else: 0 positionals, eventId will be undefined

  // Apply default calendar if no calendar specified
  if (!calendarName && !resolvedCalendarId && !resolvedCalendarIndex) {
    if (defaultCalendarId) {
      resolvedCalendarId = defaultCalendarId;
    } else {
      output.outputError(
        {
          code: ERROR_CODES.MISSING_REQUIRED,
          message:
            "Calendar name, --calendar-name, --calendar-id, or --calendar-index is required (or set a default with `accli config set-default`)",
        },
        { json: args.flags.json },
      );
      process.exitCode = EXIT_VALIDATION_ERROR;
      return;
    }
  }

  if (!eventId) {
    output.outputError(
      { code: ERROR_CODES.MISSING_REQUIRED, message: "Event ID is required" },
      { json: args.flags.json },
    );
    process.exitCode = EXIT_VALIDATION_ERROR;
    return;
  }

  // Validate datetime formats if provided
  if (args.flags.start && !isValidDatetime(args.flags.start)) {
    output.outputError(
      {
        code: ERROR_CODES.INVALID_DATETIME,
        message: `Invalid --start datetime: ${args.flags.start}`,
      },
      { json: args.flags.json },
    );
    process.exitCode = EXIT_VALIDATION_ERROR;
    return;
  }

  if (args.flags.end && !isValidDatetime(args.flags.end)) {
    output.outputError(
      { code: ERROR_CODES.INVALID_DATETIME, message: `Invalid --end datetime: ${args.flags.end}` },
      { json: args.flags.json },
    );
    process.exitCode = EXIT_VALIDATION_ERROR;
    return;
  }

  const scriptArgs = {
    calendarName: calendarName || null,
    calendarId: resolvedCalendarId,
    calendarIndex: resolvedCalendarIndex,
    eventId,
    // Preserve empty strings to allow clearing fields (e.g., --location "")
    summary: args.flags.summary !== undefined ? args.flags.summary : null,
    start: args.flags.start || null,
    end: args.flags.end || null,
    location: args.flags.location !== undefined ? args.flags.location : null,
    description: args.flags.description !== undefined ? args.flags.description : null,
    allDay: args.flags["all-day"] || false,
    noAllDay: args.flags["no-all-day"] || false,
  };

  const result = await runScript("update", scriptArgs);

  if (result.success) {
    output.output(result.data, {
      json: args.flags.json,
      formatter: output.formatUpdate,
    });
  } else {
    output.outputError(result.error, { json: args.flags.json });
  }

  process.exitCode = result.exitCode;
  return;
}

async function handleDelete(args) {
  const calendarNameFlag = args.flags["calendar-name"];
  const calendarIds = args.arrays["calendar-id"] || [];
  const calendarIndexes = args.arrays["calendar-index"] || [];

  if (calendarIndexes.length > 1) {
    output.outputError(
      {
        code: ERROR_CODES.INVALID_ARGUMENT,
        message: "Only one --calendar-index is allowed for this command",
      },
      { json: args.flags.json },
    );
    process.exitCode = EXIT_VALIDATION_ERROR;
    return;
  }

  if (calendarIds.length > 1) {
    output.outputError(
      {
        code: ERROR_CODES.INVALID_ARGUMENT,
        message: "Only one --calendar-id is allowed for this command",
      },
      { json: args.flags.json },
    );
    process.exitCode = EXIT_VALIDATION_ERROR;
    return;
  }

  const calendarIndex = calendarIndexes.length === 1 ? calendarIndexes[0] : null;
  const calendarId = calendarIds.length === 1 ? calendarIds[0] : null;

  let resolvedCalendarId = calendarId || null;
  let resolvedCalendarIndex = calendarIndex;

  if (resolvedCalendarId && resolvedCalendarIndex) {
    output.outputError(
      {
        code: ERROR_CODES.INVALID_ARGUMENT,
        message: "Use either --calendar-id or --calendar-index, not both",
      },
      { json: args.flags.json },
    );
    process.exitCode = EXIT_VALIDATION_ERROR;
    return;
  }

  if (resolvedCalendarId && /^\d+$/.test(resolvedCalendarId) && !resolvedCalendarIndex) {
    if (!args.flags.json) {
      console.error(
        "Warning: numeric --calendar-id is deprecated; use --calendar-index or a persistent --calendar-id from `accli calendars`.",
      );
    }
    resolvedCalendarIndex = resolvedCalendarId;
    resolvedCalendarId = null;
  }

  // Determine if calendar is already specified via flags
  const calendarFromFlags = calendarNameFlag || resolvedCalendarId || resolvedCalendarIndex;
  const defaultCalendarId = config.getDefaultCalendarId();

  // Parse positionals based on count and whether calendar is specified via flags
  // Rules:
  //   - 2 positionals: <calendarName> <eventId> (always, even if default exists - allows override)
  //   - 1 positional + calendar from flags: <eventId>
  //   - 1 positional + default exists (no flags): <eventId> (use default)
  //   - 1 positional + no default (no flags): <calendarName> (eventId missing error)
  //   - 0 positionals: eventId missing error
  let calendarName = calendarNameFlag || null;
  let eventId;

  if (args.positional.length >= 2) {
    // Two or more positionals: first is calendar name, second is eventId
    if (calendarFromFlags) {
      output.outputError(
        {
          code: ERROR_CODES.INVALID_ARGUMENT,
          message:
            "Too many positional arguments. When using --calendar-id/--calendar-index/--calendar-name, only provide <eventId>",
        },
        { json: args.flags.json },
      );
      process.exitCode = EXIT_VALIDATION_ERROR;
      return;
    }
    calendarName = args.positional[0];
    eventId = args.positional[1];
  } else if (args.positional.length === 1) {
    if (calendarFromFlags) {
      // Calendar from flags, positional is eventId
      eventId = args.positional[0];
    } else if (defaultCalendarId) {
      // Use default calendar, positional is eventId
      resolvedCalendarId = defaultCalendarId;
      eventId = args.positional[0];
    } else {
      // No calendar specified anywhere - positional must be calendar name, eventId is missing
      calendarName = args.positional[0];
      eventId = undefined;
    }
  }
  // else: 0 positionals, eventId will be undefined

  // Apply default calendar if no calendar specified
  if (!calendarName && !resolvedCalendarId && !resolvedCalendarIndex) {
    if (defaultCalendarId) {
      resolvedCalendarId = defaultCalendarId;
    } else {
      output.outputError(
        {
          code: ERROR_CODES.MISSING_REQUIRED,
          message:
            "Calendar name, --calendar-name, --calendar-id, or --calendar-index is required (or set a default with `accli config set-default`)",
        },
        { json: args.flags.json },
      );
      process.exitCode = EXIT_VALIDATION_ERROR;
      return;
    }
  }

  if (!eventId) {
    output.outputError(
      { code: ERROR_CODES.MISSING_REQUIRED, message: "Event ID is required" },
      { json: args.flags.json },
    );
    process.exitCode = EXIT_VALIDATION_ERROR;
    return;
  }

  const scriptArgs = {
    calendarName: calendarName || null,
    calendarId: resolvedCalendarId,
    calendarIndex: resolvedCalendarIndex,
    eventId,
  };

  const result = await runScript("delete", scriptArgs);

  if (result.success) {
    output.output(result.data, {
      json: args.flags.json,
      formatter: output.formatDelete,
    });
  } else {
    output.outputError(result.error, { json: args.flags.json });
  }

  process.exitCode = result.exitCode;
  return;
}

async function handleFreeBusy(args) {
  const calendars = args.arrays["calendar"] || [];
  const calendarIds = args.arrays["calendar-id"] || [];
  const calendarIndexes = args.arrays["calendar-index"] || [];

  if (calendars.length === 0 && calendarIds.length === 0 && calendarIndexes.length === 0) {
    output.outputError(
      {
        code: ERROR_CODES.MISSING_REQUIRED,
        message: "At least one --calendar, --calendar-id, or --calendar-index is required",
      },
      { json: args.flags.json },
    );
    process.exitCode = EXIT_VALIDATION_ERROR;
    return;
  }

  if (!args.flags.from) {
    output.outputError(
      { code: ERROR_CODES.MISSING_REQUIRED, message: "--from is required" },
      { json: args.flags.json },
    );
    process.exitCode = EXIT_VALIDATION_ERROR;
    return;
  }

  if (!args.flags.to) {
    output.outputError(
      { code: ERROR_CODES.MISSING_REQUIRED, message: "--to is required" },
      { json: args.flags.json },
    );
    process.exitCode = EXIT_VALIDATION_ERROR;
    return;
  }

  // Validate datetime formats
  if (!isValidDatetime(args.flags.from)) {
    output.outputError(
      {
        code: ERROR_CODES.INVALID_DATETIME,
        message: `Invalid --from datetime: ${args.flags.from}`,
      },
      { json: args.flags.json },
    );
    process.exitCode = EXIT_VALIDATION_ERROR;
    return;
  }

  if (!isValidDatetime(args.flags.to)) {
    output.outputError(
      { code: ERROR_CODES.INVALID_DATETIME, message: `Invalid --to datetime: ${args.flags.to}` },
      { json: args.flags.json },
    );
    process.exitCode = EXIT_VALIDATION_ERROR;
    return;
  }

  const scriptArgs = {
    calendars,
    calendarIds,
    calendarIndexes,
    from: args.flags.from,
    to: args.flags.to,
  };

  const result = await runScript("freebusy", scriptArgs);

  if (result.success) {
    output.output(result.data, {
      json: args.flags.json,
      formatter: output.formatFreeBusy,
    });
  } else {
    output.outputError(result.error, { json: args.flags.json });
  }

  process.exitCode = result.exitCode;
  return;
}

function workflowCalendar(args) {
  const ids = args.arrays["calendar-id"] || [];
  const names = args.positional;
  if (ids.length > 1 || names.length > 1 || (ids.length && names.length)) {
    return { error: { code: ERROR_CODES.INVALID_ARGUMENT, message: "Specify one calendar by name or --calendar-id" } };
  }
  const calendarId = ids[0] || config.getDefaultCalendarId() || null;
  const calendarName = names[0] || null;
  if (!calendarId && !calendarName) {
    return { error: { code: ERROR_CODES.MISSING_REQUIRED, message: "Calendar name or --calendar-id is required (or set a default)" } };
  }
  return { calendarId, calendarName };
}

function workflowRange(args) {
  if (args.flags.from && !isValidDatetime(args.flags.from)) return { error: `Invalid --from datetime: ${args.flags.from}` };
  if (args.flags.to && !isValidDatetime(args.flags.to)) return { error: `Invalid --to datetime: ${args.flags.to}` };
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return { from: args.flags.from || "1900-01-01", to: args.flags.to || tomorrow.toISOString().slice(0, 10) };
}

function writeManifest(args, manifest) {
  const filename = args.flags.manifest || path.join(process.cwd(), `calendar-cleanup-${Date.now()}.json`);
  fs.writeFileSync(filename, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  return filename;
}

async function scanWorkflow(args) {
  const target = workflowCalendar(args);
  if (target.error) return { error: target.error };
  const range = workflowRange(args);
  if (range.error) return { error: { code: ERROR_CODES.INVALID_DATETIME, message: range.error } };
  const result = await runScript("scan", { ...target, ...range });
  return result.success ? { target, range, events: result.data.events || [] } : { error: result.error, exitCode: result.exitCode };
}

function workflowError(args, result) {
  output.outputError(result.error, { json: args.flags.json });
  process.exitCode = result.exitCode || EXIT_VALIDATION_ERROR;
}

async function handleAudit(args) {
  const scanned = await scanWorkflow(args);
  if (scanned.error) return workflowError(args, scanned);
  const report = cleanup.auditEvents(scanned.events);
  const removable = report.exactDuplicates.flatMap((group) => group.slice(1));
  if (!args.flags.apply) {
    output.output({ ...report, removableExactDuplicates: removable, preview: true }, { json: args.flags.json });
    return;
  }
  if (!args.flags.yes) return workflowError(args, { error: { code: ERROR_CODES.MISSING_REQUIRED, message: "--apply requires --yes" } });
  const mutation = await runScript("mutate", { ...scanned.target, changes: removable.map((event) => ({ action: "delete", id: event.id, uid: event.uid, expectedSummary: event.summary })) });
  if (!mutation.success) return workflowError(args, mutation);
  const manifestPath = writeManifest(args, { version: 1, kind: "audit", createdAt: new Date().toISOString(), calendar: scanned.target, changes: mutation.data.changes || [], deleted: removable });
  output.output({ ...report, applied: mutation.data.changes || [], manifestPath }, { json: args.flags.json });
}

async function handleNormalize(args) {
  const scanned = await scanWorkflow(args);
  if (scanned.error) return workflowError(args, scanned);
  let policy = {};
  if (args.flags.policy) {
    try { policy = JSON.parse(fs.readFileSync(args.flags.policy, "utf8")); } catch (error) { return workflowError(args, { error: { code: ERROR_CODES.INVALID_ARGUMENT, message: `Invalid policy file: ${error.message}` } }); }
  }
  let proposals = cleanup.normalizeEvents(scanned.events, policy);
  if (args.flags.ollama) {
    try { proposals = await cleanup.classifyWithOllama(proposals, args.flags["ollama-model"] || "qwen3.5:4b"); } catch (error) { return workflowError(args, { error: { code: "OLLAMA_UNAVAILABLE", message: error.message } }); }
  }
  const changes = proposals.filter((item) => item.changed && item.status === "proposed");
  const review = proposals.filter((item) => item.status === "review");
  if (!args.flags.apply) {
    output.output({ preview: true, changes, review, excluded: proposals.filter((item) => item.status === "excluded") }, { json: args.flags.json });
    return;
  }
  if (!args.flags.yes) return workflowError(args, { error: { code: ERROR_CODES.MISSING_REQUIRED, message: "--apply requires --yes" } });
  const mutation = await runScript("mutate", { ...scanned.target, changes: changes.map((item) => ({ action: "rename", id: item.id, uid: item.uid, expectedSummary: item.summary, summary: item.title, series: item.isRecurring })) });
  if (!mutation.success) return workflowError(args, mutation);
  const manifestPath = writeManifest(args, { version: 1, kind: "normalize", createdAt: new Date().toISOString(), calendar: scanned.target, changes: mutation.data.changes || [] });
  output.output({ applied: mutation.data.changes || [], review, manifestPath }, { json: args.flags.json });
}

async function handleRollback(args) {
  const manifestPath = args.positional[0];
  if (!manifestPath) return workflowError(args, { error: { code: ERROR_CODES.MISSING_REQUIRED, message: "Manifest path is required" } });
  if (!args.flags.yes) return workflowError(args, { error: { code: ERROR_CODES.MISSING_REQUIRED, message: "rollback requires --yes" } });
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")); } catch (error) { return workflowError(args, { error: { code: ERROR_CODES.INVALID_ARGUMENT, message: `Invalid manifest: ${error.message}` } }); }
  const changes = (manifest.changes || []).filter((change) => change.action === "rename").map((change) => ({ action: "rename", id: change.id, uid: change.uid, expectedSummary: change.summary, summary: change.previousSummary, series: change.series }));
  const mutation = await runScript("mutate", { ...manifest.calendar, changes });
  if (!mutation.success) return workflowError(args, mutation);
  output.output({ rolledBack: mutation.data.changes || [], skipped: mutation.data.skipped || [] }, { json: args.flags.json });
}

async function handleConfig(args) {
  const action = args.positional[0];

  if (!action) {
    output.outputError(
      {
        code: ERROR_CODES.MISSING_REQUIRED,
        message: "Config action required: set-default, show, or clear",
      },
      { json: args.flags.json },
    );
    process.exitCode = EXIT_VALIDATION_ERROR;
    return;
  }

  switch (action) {
    case "set-default": {
      const calendarName = args.arrays["calendar"]?.[0] || null;
      const calendarId = args.arrays["calendar-id"]?.[0] || null;

      // Non-interactive mode: calendar specified via flag
      if (calendarName || calendarId) {
        // Fetch calendars to validate and get info
        const result = await runScript("calendars", {});
        if (!result.success) {
          output.outputError(result.error, { json: args.flags.json });
          process.exitCode = result.exitCode;
          return;
        }

        const calendars = result.data.calendars;
        let selectedCalendar = null;

        if (calendarId) {
          selectedCalendar = calendars.find((c) => c.id === calendarId);
          if (!selectedCalendar) {
            output.outputError(
              {
                code: ERROR_CODES.CALENDAR_NOT_FOUND,
                message: `Calendar with ID "${calendarId}" not found`,
              },
              { json: args.flags.json },
            );
            process.exitCode = EXIT_VALIDATION_ERROR;
            return;
          }
        } else if (calendarName) {
          const matches = calendars.filter((c) => c.name === calendarName);
          if (matches.length === 0) {
            output.outputError(
              {
                code: ERROR_CODES.CALENDAR_NOT_FOUND,
                message: `Calendar "${calendarName}" not found`,
              },
              { json: args.flags.json },
            );
            process.exitCode = EXIT_VALIDATION_ERROR;
            return;
          }
          if (matches.length > 1) {
            const ids = matches.map((c) => c.id).join(", ");
            output.outputError(
              {
                code: ERROR_CODES.AMBIGUOUS_CALENDAR,
                message: `Multiple calendars named "${calendarName}". Use --calendar-id with one of: ${ids}`,
              },
              { json: args.flags.json },
            );
            process.exitCode = EXIT_VALIDATION_ERROR;
            return;
          }
          selectedCalendar = matches[0];
        }

        config.setDefaultCalendarId(selectedCalendar.id);

        if (args.flags.json) {
          output.output(
            { defaultCalendar: { id: selectedCalendar.id, name: selectedCalendar.name } },
            { json: true },
          );
        } else {
          console.log(`Default calendar set to "${selectedCalendar.name}"`);
        }
        process.exitCode = 0;
        return;
      }

      // Interactive mode: prompt user to select
      if (!process.stdin.isTTY) {
        output.outputError(
          {
            code: ERROR_CODES.MISSING_REQUIRED,
            message: "Non-interactive mode requires --calendar or --calendar-id",
          },
          { json: args.flags.json },
        );
        process.exitCode = EXIT_VALIDATION_ERROR;
        return;
      }

      const result = await runScript("calendars", {});
      if (!result.success) {
        output.outputError(result.error, { json: args.flags.json });
        process.exitCode = result.exitCode;
        return;
      }

      const calendars = result.data.calendars;
      if (calendars.length === 0) {
        output.outputError(
          { code: ERROR_CODES.CALENDAR_NOT_FOUND, message: "No calendars found" },
          { json: args.flags.json },
        );
        process.exitCode = EXIT_VALIDATION_ERROR;
        return;
      }

      console.log("Available calendars:");
      calendars.forEach((cal, i) => {
        console.log(`  ${i + 1}. ${cal.name} (${cal.source}) - ID: ${cal.id.substring(0, 8)}...`);
      });

      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const answer = await new Promise((resolve) => {
        rl.question(`Select default calendar [1-${calendars.length}]: `, resolve);
      });
      rl.close();

      const index = parseInt(answer, 10) - 1;
      if (isNaN(index) || index < 0 || index >= calendars.length) {
        output.outputError(
          { code: ERROR_CODES.INVALID_ARGUMENT, message: "Invalid selection" },
          { json: args.flags.json },
        );
        process.exitCode = EXIT_VALIDATION_ERROR;
        return;
      }

      const selectedCalendar = calendars[index];
      config.setDefaultCalendarId(selectedCalendar.id);
      console.log(`Default calendar set to "${selectedCalendar.name}"`);
      process.exitCode = 0;
      return;
    }

    case "show": {
      const defaultId = config.getDefaultCalendarId();

      if (!defaultId) {
        if (args.flags.json) {
          output.output({ defaultCalendar: null }, { json: true });
        } else {
          console.log("No default calendar set");
        }
        process.exitCode = 0;
        return;
      }

      // Fetch calendars to get the name
      const result = await runScript("calendars", {});
      if (!result.success) {
        output.outputError(result.error, { json: args.flags.json });
        process.exitCode = result.exitCode;
        return;
      }

      const calendar = result.data.calendars.find((c) => c.id === defaultId);

      if (args.flags.json) {
        output.output(
          {
            defaultCalendar: calendar
              ? { id: defaultId, name: calendar.name }
              : { id: defaultId, name: null },
          },
          { json: true },
        );
      } else {
        if (calendar) {
          console.log(`Default calendar: ${calendar.name} (${defaultId})`);
        } else {
          console.log(`Default calendar ID: ${defaultId} (calendar no longer exists)`);
        }
      }
      process.exitCode = 0;
      return;
    }

    case "clear": {
      config.clearDefaultCalendar();

      if (args.flags.json) {
        output.output({ cleared: true }, { json: true });
      } else {
        console.log("Default calendar cleared");
      }
      process.exitCode = 0;
      return;
    }

    default:
      output.outputError(
        {
          code: ERROR_CODES.INVALID_ARGUMENT,
          message: `Unknown config action: ${action}. Use set-default, show, or clear`,
        },
        { json: args.flags.json },
      );
      process.exitCode = EXIT_VALIDATION_ERROR;
      return;
  }
}

// Main entry point
async function main() {
  const parseResult = parseArgs(process.argv.slice(2));

  // Handle parse errors with JSON support
  if (!parseResult.ok) {
    // Check if --json was passed before the error occurred
    const hasJson = process.argv.includes("--json");
    output.outputError(parseResult.error, { json: hasJson });
    process.exitCode = EXIT_VALIDATION_ERROR;
    return;
  }

  const args = parseResult.result;

  // Handle global version
  if (args.flags.version) {
    const { version } = require("../package.json");
    console.log(version);
    process.exitCode = 0;
    return;
  }

  // Handle global help
  if (args.flags.help && !args.command) {
    showHelp();
    process.exitCode = 0;
    return;
  }

  // Handle command-specific help
  if (args.flags.help && args.command) {
    showHelp(args.command);
    process.exitCode = 0;
    return;
  }

  // No command provided
  if (!args.command) {
    showHelp();
    process.exitCode = EXIT_VALIDATION_ERROR;
    return;
  }

  // Route to command handler
  switch (args.command) {
    case "setup":
      await handleSetup(args);
      break;
    case "calendars":
      await handleCalendars(args);
      break;
    case "events":
      await handleEvents(args);
      break;
    case "event":
      await handleEvent(args);
      break;
    case "create":
      await handleCreate(args);
      break;
    case "update":
      await handleUpdate(args);
      break;
    case "delete":
      await handleDelete(args);
      break;
    case "freebusy":
      await handleFreeBusy(args);
      break;
    case "audit":
      await handleAudit(args);
      break;
    case "normalize":
      await handleNormalize(args);
      break;
    case "rollback":
      await handleRollback(args);
      break;
    case "config":
      await handleConfig(args);
      break;
    default:
      console.error(`Unknown command: ${args.command}`);
      showHelp();
      process.exitCode = EXIT_VALIDATION_ERROR;
      return;
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err.message);
  process.exitCode = 1;
  return;
});
