const { preflightIcal } = require("../dist/lib/ical-preflight.js");

describe("ICS preflight", () => {
  test("counts events and preserved metadata", () => {
    const report = preflightIcal([
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "UID:a@example.com",
      "DTSTART;VALUE=DATE:20260819",
      "DTEND;VALUE=DATE:20260820",
      "SUMMARY:Travel: Trip",
      "DESCRIPTION:Details",
      "LOCATION:Paris",
      "ATTENDEE:mailto:a@example.com",
      "RRULE:FREQ=WEEKLY;COUNT=2",
      "END:VEVENT",
      "END:VCALENDAR",
      "",
    ].join("\r\n"));
    expect(report.valid).toBe(true);
    expect(report.eventCount).toBe(1);
    expect(report.uniqueUidCount).toBe(1);
    expect(report.recurrenceCount).toBe(1);
    expect(report.allDayCount).toBe(1);
    expect(report.descriptionCount).toBe(1);
    expect(report.locationCount).toBe(1);
    expect(report.attendeeCount).toBe(1);
  });

  test("rejects duplicate UIDs and malformed recurrence", () => {
    const report = preflightIcal(`BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:same\nDTSTART:20260819T090000Z\nRRULE:FREQ=NOPE\nEND:VEVENT\nBEGIN:VEVENT\nUID:same\nDTSTART:20260820T090000Z\nEND:VEVENT\nEND:VCALENDAR\n`);
    expect(report.valid).toBe(false);
    expect(report.duplicateUids).toEqual(["same"]);
    expect(report.errors.join(" ")).toMatch(/RRULE/);
  });

  test("rejects mismatched expected counts", () => {
    const report = preflightIcal("BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:one\nDTSTART:20260819T090000Z\nEND:VEVENT\nEND:VCALENDAR\n", "test.ics", { eventCount: 2, recurrenceCount: 1 });
    expect(report.valid).toBe(false);
    expect(report.errors.join(" ")).toMatch(/Expected 2|Expected 1/);
  });
});
