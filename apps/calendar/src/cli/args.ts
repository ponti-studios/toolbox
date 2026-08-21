const { ERROR_CODES } = require("../lib/calendar-helper-runner");
import type { CliArgs, ParseResult } from "./types.js";

export function parseArgs(args: string[]): ParseResult {
  const result: CliArgs = {
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

      if (key === "calendar" || key === "calendar-id" || key === "calendar-index") {
        const value = args[i + 1];
        if (value === undefined || value.startsWith("--")) {
          return {
            ok: false,
            error: { code: ERROR_CODES.MISSING_REQUIRED, message: `--${key} requires a value` },
          };
        }
        if (!result.arrays[key]) result.arrays[key] = [];
        result.arrays[key].push(value);
        i += 2;
        continue;
      }

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

export function isValidDatetime(value: string): boolean {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T00:00:00`);
    return !Number.isNaN(date.getTime());
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) {
    const date = new Date(value);
    return !Number.isNaN(date.getTime());
  }
  return false;
}

export function isDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
