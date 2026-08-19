"use strict";

const cleanup = require("../dist/lib/cleanup.js");

describe("calendar cleanup rules", () => {
  const policy = {
    taxonomy: ["Travel", "Exercise", "Food", "People", "Errands"],
    aliases: { walk: "Exercise" },
    patterns: [{ id: "drinks", match: "^drinks\\s+(.+)$", category: "Food", detail: "$1" }],
  };

  test("normalizes deterministic aliases into canonical title prefixes", () => {
    expect(cleanup.proposalForTitle("walk", policy)).toMatchObject({
      title: "Exercise: Walk",
      source: "alias",
    });
    expect(cleanup.proposalForTitle("Drinks w/ Abigail", policy)).toMatchObject({ title: "Food: w/ Abigail", source: "drinks" });
    expect(cleanup.proposalForTitle("Exercise: Walk", policy)).toMatchObject({ status: "unchanged", source: "canonical" });
    expect(cleanup.proposalForTitle("Trip Japan", policy)).toMatchObject({ status: "review" });
  });

  test("supports exact policy overrides and exclusions", () => {
    expect(
        cleanup.proposalForTitle("studio", {
          taxonomy: ["Work"],
          overrides: { studio: { category: "Work", detail: "Studio" } },
      }),
    ).toMatchObject({ title: "Work: Studio", source: "override" });
    expect(cleanup.proposalForTitle("private", { exclusions: ["private"] })).toMatchObject({
      status: "excluded",
    });
  });

  test("deduplicates recurring series before title normalization", () => {
    const values = cleanup.normalizeEvents([
      { id: "E1", uid: "U1", isRecurring: true, summary: "walk" },
      { id: "E2", uid: "U1", isRecurring: true, summary: "walk" },
    ]);
    expect(values).toHaveLength(1);
  });

  test("reports exact independent duplicates but excludes recurring occurrences", () => {
    const report = cleanup.auditEvents([
      {
        id: "E1",
        uid: "U1",
        isRecurring: false,
        calendarId: "C",
        summary: "Dinner",
        start: "2025-01-01T19:00",
        end: "2025-01-01T20:00",
        allDay: false,
      },
      {
        id: "E2",
        uid: "U2",
        isRecurring: false,
        calendarId: "C",
        summary: "dinner",
        start: "2025-01-01T19:00",
        end: "2025-01-01T20:00",
        allDay: false,
      },
      {
        id: "E3",
        uid: "R1",
        isRecurring: true,
        calendarId: "C",
        summary: "walk",
        start: "2025-01-02T09:00",
        end: "2025-01-02T10:00",
        allDay: false,
      },
      {
        id: "E4",
        uid: "R1",
        isRecurring: true,
        calendarId: "C",
        summary: "walk",
        start: "2025-01-09T09:00",
        end: "2025-01-09T10:00",
        allDay: false,
      },
    ]);
    expect(report.exactDuplicates).toHaveLength(1);
    expect(report.nearDuplicates).toHaveLength(0);
  });

  test("accepts only valid high-confidence Ollama classifications", () => {
    expect(
      cleanup.ollamaProposal({ category: "Travel", detail: "Japan", confidence: 0.95 }, ["Travel"]),
    ).toMatchObject({
      title: "Travel: Japan",
      source: "ollama",
    });
    expect(
      cleanup.ollamaProposal({ category: "Unknown", detail: "Japan", confidence: 1 }, ["Travel"]),
    ).toBeNull();
    expect(
      cleanup.ollamaProposal({ category: "Travel", detail: "Japan", confidence: 0.89 }, ["Travel"]),
    ).toBeNull();
  });

  test("separates close duplicate candidates from distant same-day repeats", () => {
    const report = cleanup.auditEvents([
      { id: "E1", uid: "U1", isRecurring: false, calendarId: "C", summary: "Walk", start: "2025-01-01T09:00", end: "2025-01-01T10:00", allDay: false },
      { id: "E2", uid: "U2", isRecurring: false, calendarId: "C", summary: "walk", start: "2025-01-01T09:15", end: "2025-01-01T10:15", allDay: false },
      { id: "E3", uid: "U3", isRecurring: false, calendarId: "C", summary: "Walk", start: "2025-01-01T19:00", end: "2025-01-01T20:00", allDay: false },
    ]);
    expect(report.likelyDuplicates).toHaveLength(1);
    expect(report.likelyDuplicates[0].classification).toBe("likely-duplicate");
    expect(report.sameDayRepeats).toHaveLength(2);
  });

  test("classifies one-hour DST recurrence changes separately", () => {
    const report = cleanup.auditEvents([
      { id: "R1", uid: "DST", isRecurring: true, calendarId: "C", summary: "Walk", start: "2025-10-26T10:00", end: "2025-10-26T11:00", allDay: false },
      { id: "R2", uid: "DST", isRecurring: true, calendarId: "C", summary: "Walk", start: "2025-11-02T09:00", end: "2025-11-02T10:00", allDay: false },
    ]);
    expect(report.suspiciousRecurrences).toHaveLength(0);
    expect(report.timezoneShifts).toHaveLength(1);
  });

  test("handles DST shifts that cross midnight", () => {
    const report = cleanup.auditEvents([
      { id: "R1", uid: "MIDNIGHT", isRecurring: true, calendarId: "C", summary: "Hike", start: "2022-10-30T00:15", end: "2022-10-30T01:15", allDay: false },
      { id: "R2", uid: "MIDNIGHT", isRecurring: true, calendarId: "C", summary: "Hike", start: "2022-11-06T23:15", end: "2022-11-07T00:15", allDay: false },
    ]);
    expect(report.suspiciousRecurrences).toHaveLength(0);
    expect(report.timezoneShifts).toHaveLength(1);
  });
});
