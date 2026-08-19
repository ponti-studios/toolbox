import { readFile } from "node:fs/promises";

export type IcalPreflightReport = {
  file: string;
  valid: boolean;
  eventCount: number;
  uniqueUidCount: number;
  duplicateUids: string[];
  recurrenceCount: number;
  allDayCount: number;
  timedCount: number;
  descriptionCount: number;
  locationCount: number;
  attendeeCount: number;
  errors: string[];
  warnings: string[];
  expectedEventCount?: number;
  expectedRecurrenceCount?: number;
};

function unfold(input: string): string[] {
  const lines = input.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const result: string[] = [];
  for (const line of lines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && result.length > 0) {
      result[result.length - 1] += line.slice(1);
    } else {
      result.push(line);
    }
  }
  return result;
}

function propertyName(line: string): string {
  return line.slice(0, line.indexOf(":")).split(";", 1)[0].toUpperCase();
}

function propertyValue(line: string): string {
  const separator = line.indexOf(":");
  return separator === -1 ? "" : line.slice(separator + 1);
}

function validDateValue(line: string): boolean {
  const value = propertyValue(line);
  const isRealDate = (year: number, month: number, day: number): boolean => {
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  };
  if (/^\d{8}$/.test(value)) return isRealDate(Number(value.slice(0, 4)), Number(value.slice(4, 6)), Number(value.slice(6)));
  if (/^\d{8}T\d{6}Z?$/.test(value)) {
    const digits = value.replace(/Z$/, "");
    const validClock = Number(digits.slice(9, 11)) < 24 && Number(digits.slice(11, 13)) < 60 && Number(digits.slice(13, 15)) < 60;
    return validClock && isRealDate(Number(digits.slice(0, 4)), Number(digits.slice(4, 6)), Number(digits.slice(6, 8)));
  }
  return false;
}

function validRecurrence(line: string): boolean {
  const value = propertyValue(line);
  const frequency = value.match(/(?:^|;)FREQ=(YEARLY|MONTHLY|WEEKLY|DAILY|HOURLY|MINUTELY|SECONDLY)(?:;|$)/i);
  return Boolean(frequency);
}

export function preflightIcal(input: string, file = "calendar.ics", expected?: { eventCount?: number; recurrenceCount?: number }): IcalPreflightReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const lines = unfold(input).filter((line) => line.length > 0);
  if (lines[0] !== "BEGIN:VCALENDAR" || lines[lines.length - 1] !== "END:VCALENDAR") {
    errors.push("File must begin with BEGIN:VCALENDAR and end with END:VCALENDAR.");
  }

  const events: string[][] = [];
  let current: string[] | null = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      if (current) errors.push("Nested VEVENT block detected.");
      current = [];
    } else if (line === "END:VEVENT") {
      if (!current) errors.push("END:VEVENT without BEGIN:VEVENT.");
      else events.push(current);
      current = null;
    } else if (current) {
      current.push(line);
    }
  }
  if (current) errors.push("VEVENT block is not closed.");

  const uids = events.map((event) => propertyValue(event.find((line) => propertyName(line) === "UID") ?? ""));
  const counts = new Map<string, number>();
  for (const uid of uids) counts.set(uid, (counts.get(uid) ?? 0) + 1);
  const duplicateUids = [...counts.entries()].filter(([, count]) => count > 1).map(([uid]) => uid || "<missing>");
  if (duplicateUids.length > 0) errors.push(`Duplicate UID values: ${duplicateUids.join(", ")}`);

  let recurrenceCount = 0;
  let allDayCount = 0;
  let timedCount = 0;
  let descriptionCount = 0;
  let locationCount = 0;
  let attendeeCount = 0;
  for (const [index, event] of events.entries()) {
    const uid = uids[index];
    if (!uid) errors.push(`VEVENT ${index + 1} is missing UID.`);
    const start = event.find((line) => propertyName(line) === "DTSTART");
    if (!start || !validDateValue(start)) errors.push(`VEVENT ${index + 1} has an invalid or missing DTSTART.`);
    const end = event.find((line) => propertyName(line) === "DTEND");
    if (end && !validDateValue(end)) errors.push(`VEVENT ${index + 1} has an invalid DTEND.`);
    const recurrence = event.find((line) => propertyName(line) === "RRULE");
    if (recurrence) {
      recurrenceCount += 1;
      if (!validRecurrence(recurrence)) errors.push(`VEVENT ${index + 1} has an invalid RRULE.`);
    }
    if (start?.includes("VALUE=DATE")) allDayCount += 1;
    else timedCount += 1;
    if (event.some((line) => propertyName(line) === "DESCRIPTION")) descriptionCount += 1;
    if (event.some((line) => propertyName(line) === "LOCATION")) locationCount += 1;
    attendeeCount += event.filter((line) => propertyName(line) === "ATTENDEE").length;
  }
  if (events.length === 0) warnings.push("The file contains no VEVENT records.");
  if (expected?.eventCount !== undefined && events.length !== expected.eventCount) {
    errors.push(`Expected ${expected.eventCount} VEVENT records but found ${events.length}.`);
  }
  if (expected?.recurrenceCount !== undefined && recurrenceCount !== expected.recurrenceCount) {
    errors.push(`Expected ${expected.recurrenceCount} recurring events but found ${recurrenceCount}.`);
  }

  return {
    file,
    valid: errors.length === 0,
    eventCount: events.length,
    uniqueUidCount: new Set(uids.filter(Boolean)).size,
    duplicateUids,
    recurrenceCount,
    allDayCount,
    timedCount,
    descriptionCount,
    locationCount,
    attendeeCount,
    errors,
    warnings,
    ...(expected?.eventCount === undefined ? {} : { expectedEventCount: expected.eventCount }),
    ...(expected?.recurrenceCount === undefined ? {} : { expectedRecurrenceCount: expected.recurrenceCount }),
  };
}

export async function preflightIcalFile(file: string, expected?: { eventCount?: number; recurrenceCount?: number }): Promise<IcalPreflightReport> {
  return preflightIcal(await readFile(file, "utf8"), file, expected);
}
