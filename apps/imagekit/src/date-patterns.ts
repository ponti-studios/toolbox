export interface DateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export interface DatePattern {
  name: string;
  regex: string;
  description: string;
}

export const BUILTIN_PATTERNS: DatePattern[] = [
  {
    name: "standard",
    regex: String.raw`(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})-(?<hour>\d{2})-(?<minute>\d{2})-(?<second>\d{2})`,
    description: "2024-03-12-11-32-03",
  },
  {
    name: "underscore",
    regex: String.raw`(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})_(?<hour>\d{2})-(?<minute>\d{2})-(?<second>\d{2})`,
    description: "2024-03-12_11-32-03",
  },
  {
    name: "compact",
    regex: String.raw`(?<year>\d{4})(?<month>\d{2})(?<day>\d{2})_(?<hour>\d{2})(?<minute>\d{2})(?<second>\d{2})`,
    description: "20240312_113203",
  },
  {
    name: "compact_time",
    regex: String.raw`(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})-(?<hour>\d{2})(?<minute>\d{2})`,
    description: "2024-07-23-0931",
  },
  {
    name: "date_only",
    regex: String.raw`(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})`,
    description: "2024-06-21",
  },
  {
    name: "doy_time",
    regex: String.raw`(?<year>\d{4})-(?<doy>\d{3})-at-(?<hour>\d{2})-(?<minute>\d{2})-(?<second>\d{2})`,
    description: "2024-019-at-11-05-42",
  },
  {
    name: "doy_compact",
    regex: String.raw`(?<year>\d{4})-(?<doy>\d{3})-(?<hour>\d{2})(?<minute>\d{2})`,
    description: "2024-022-0843",
  },
  {
    name: "doy_only",
    regex: String.raw`(?<year>\d{4})-(?<doy>\d{3})`,
    description: "2024-022",
  },
];

function doyToMonthDay(year: number, doy: number): [number, number] {
  const d = new Date(Date.UTC(year, 0, 1));
  d.setUTCDate(d.getUTCDate() + doy - 1);
  return [d.getUTCMonth() + 1, d.getUTCDate()];
}

function parseMatch(m: RegExpMatchArray): DateParts | null {
  const groups = (m.groups ?? {}) as Record<string, string | undefined>;

  if (groups.doy) {
    const year = parseInt(groups.year!, 10);
    const doy = parseInt(groups.doy, 10);
    if (Number.isNaN(year) || Number.isNaN(doy) || doy < 1 || doy > 366) return null;
    // Validate doy within year (leap year handling via Date)
    // If doy 366 on non-leap, Date will roll to next year; detect invalid
    const test = new Date(Date.UTC(year, 0, 1));
    test.setUTCDate(test.getUTCDate() + doy - 1);
    if (test.getUTCFullYear() !== year) return null;
    const [month, day] = doyToMonthDay(year, doy);
    return {
      year,
      month,
      day,
      hour: parseInt(groups.hour ?? "12", 10),
      minute: parseInt(groups.minute ?? "0", 10),
      second: parseInt(groups.second ?? "0", 10),
    };
  }

  if (!groups.year || !groups.month || !groups.day) return null;
  const year = parseInt(groups.year, 10);
  const month = parseInt(groups.month, 10);
  const day = parseInt(groups.day, 10);
  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) return null;
  // Validate real date (e.g. reject month 13, day 32, Feb 30)
  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() + 1 !== month ||
    d.getUTCDate() !== day
  ) {
    return null;
  }
  const hour = parseInt(groups.hour ?? "12", 10);
  const minute = parseInt(groups.minute ?? "0", 10);
  const second = parseInt(groups.second ?? "0", 10);
  return { year, month, day, hour, minute, second };
}

export function autoDetect(filename: string): DateParts | null {
  for (const pat of BUILTIN_PATTERNS) {
    const re = new RegExp(pat.regex);
    const m = filename.match(re);
    if (m) {
      const result = parseMatch(m as RegExpMatchArray);
      if (result) return result;
    }
  }
  return null;
}

export function matchFromPattern(patternRegex: string, filename: string): DateParts | null {
  let compiled: RegExp;
  try {
    compiled = new RegExp(patternRegex);
  } catch (exc) {
    throw new Error(`Invalid regex: ${exc instanceof Error ? exc.message : String(exc)}`);
  }
  const m = filename.match(compiled);
  if (!m) return null;
  return parseMatch(m as RegExpMatchArray);
}

export const DATE_PATTERN_HELP = `\
Auto-detect tries these built-in patterns (in order):
  1) YYYY-MM-DD-HH-MM-SS       (e.g. 2024-03-12-11-32-03)
  2) YYYY-MM-DD_HH-MM-SS       (e.g. 2024-03-12_11-32-03)
  3) YYYYMMDD_HHMMSS           (e.g. 20240312_113203)
  4) YYYY-MM-DD-HHMM           (e.g. 2024-07-23-0931)
  5) YYYY-MM-DD                (e.g. 2024-06-21)
  6) YYYY-DDD-at-HH-MM-SS      (e.g. 2024-019-at-11-05-42)
  7) YYYY-DDD-HHMM             (e.g. 2024-022-0843)
  8) YYYY-DDD                  (e.g. 2024-022)

Use --pattern to supply a custom regex with named groups
year, month, day (or year, doy) and optionally hour, minute, second.`;
