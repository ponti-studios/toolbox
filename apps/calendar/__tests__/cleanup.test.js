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
    expect(cleanup.proposalForTitle("Drinks w/ Abigail", policy)).toMatchObject({
      title: "Food: w/ Abigail",
      source: "drinks",
    });
    expect(cleanup.proposalForTitle("Exercise: Walk", policy)).toMatchObject({
      status: "unchanged",
      source: "canonical",
    });
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

  test("rejects malformed model patterns and keeps only patterns that match an example", () => {
    const taxonomy = ["Travel", "Food"];
    const parsed = {
      patterns: [
        {
          id: "P001",
          match: "Food Shopping & Delivery",
          category: "Food",
          detail: "Titles related to purchasing food.",
          confidence: 0.95,
          examples: ["Grocery shopping"],
        },
        {
          id: "P002",
          match: "^grocery\\s+(.+)$",
          category: "Food",
          detail: "$1",
          confidence: 0.95,
          examples: ["Grocery run", "Pickup at store"],
        },
        {
          id: "P003",
          match: "^trips?\\s+(.+)$",
          category: "Travel",
          detail: "$1",
          confidence: 0.9,
          examples: ["Dentist", "Call Mom"],
        },
        {
          id: 42,
          match: "^walk$",
          category: "Exercise",
          confidence: 1,
          examples: ["Walk"],
        },
        {
          id: "P005",
          match: "^fly\\s+(.+)$",
          category: "Travel",
          confidence: 0.8,
          examples: ["Fly to NYC"],
        },
        {
          id: "P006",
          match: "[",
          category: "Travel",
          confidence: 0.95,
          examples: ["anything"],
        },
      ],
    };
    const kept = cleanup.patternProposals(parsed, taxonomy);
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({ id: "P002", category: "Food", confidence: 0.95 });
  });

  test("malformed model output without valid JSON shapes yields no patterns", () => {
    const taxonomy = ["Travel"];
    expect(cleanup.patternProposals({ patterns: [] }, taxonomy)).toEqual([]);
    expect(cleanup.patternProposals({ patterns: null }, taxonomy)).toEqual([]);
    expect(cleanup.patternProposals({}, taxonomy)).toEqual([]);
    expect(cleanup.patternProposals(null, taxonomy)).toEqual([]);
  });

  test("separates close duplicate candidates from distant same-day repeats", () => {
    const report = cleanup.auditEvents([
      {
        id: "E1",
        uid: "U1",
        isRecurring: false,
        calendarId: "C",
        summary: "Walk",
        start: "2025-01-01T09:00",
        end: "2025-01-01T10:00",
        allDay: false,
      },
      {
        id: "E2",
        uid: "U2",
        isRecurring: false,
        calendarId: "C",
        summary: "walk",
        start: "2025-01-01T09:15",
        end: "2025-01-01T10:15",
        allDay: false,
      },
      {
        id: "E3",
        uid: "U3",
        isRecurring: false,
        calendarId: "C",
        summary: "Walk",
        start: "2025-01-01T19:00",
        end: "2025-01-01T20:00",
        allDay: false,
      },
    ]);
    expect(report.likelyDuplicates).toHaveLength(1);
    expect(report.likelyDuplicates[0].classification).toBe("likely-duplicate");
    expect(report.sameDayRepeats).toHaveLength(2);
  });

  test("classifies one-hour DST recurrence changes separately", () => {
    const report = cleanup.auditEvents([
      {
        id: "R1",
        uid: "DST",
        isRecurring: true,
        calendarId: "C",
        summary: "Walk",
        start: "2025-10-26T10:00",
        end: "2025-10-26T11:00",
        allDay: false,
      },
      {
        id: "R2",
        uid: "DST",
        isRecurring: true,
        calendarId: "C",
        summary: "Walk",
        start: "2025-11-02T09:00",
        end: "2025-11-02T10:00",
        allDay: false,
      },
    ]);
    expect(report.suspiciousRecurrences).toHaveLength(0);
    expect(report.timezoneShifts).toHaveLength(1);
  });

  test("handles DST shifts that cross midnight", () => {
    const report = cleanup.auditEvents([
      {
        id: "R1",
        uid: "MIDNIGHT",
        isRecurring: true,
        calendarId: "C",
        summary: "Hike",
        start: "2022-10-30T00:15",
        end: "2022-10-30T01:15",
        allDay: false,
      },
      {
        id: "R2",
        uid: "MIDNIGHT",
        isRecurring: true,
        calendarId: "C",
        summary: "Hike",
        start: "2022-11-06T23:15",
        end: "2022-11-07T00:15",
        allDay: false,
      },
    ]);
    expect(report.suspiciousRecurrences).toHaveLength(0);
    expect(report.timezoneShifts).toHaveLength(1);
  });
});
