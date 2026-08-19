"use strict";

const cleanup = require("../dist/lib/cleanup.js");

describe("calendar cleanup rules", () => {
  test("normalizes deterministic aliases into canonical title prefixes", () => {
    expect(cleanup.proposalForTitle("walk")).toMatchObject({
      title: "Exercise: Walk",
      source: "deterministic",
    });
    expect(cleanup.proposalForTitle("Trip Japan")).toMatchObject({ title: "Travel: Japan" });
  });

  test("supports exact policy overrides and exclusions", () => {
    expect(
      cleanup.proposalForTitle("studio", {
        overrides: { studio: { category: "Work", detail: "Studio" } },
      }),
    ).toMatchObject({ title: "Work: Studio", source: "policy" });
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
      cleanup.ollamaProposal({ category: "Travel", detail: "Japan", confidence: 0.95 }),
    ).toMatchObject({
      title: "Travel: Japan",
      source: "ollama",
    });
    expect(
      cleanup.ollamaProposal({ category: "Unknown", detail: "Japan", confidence: 1 }),
    ).toBeNull();
    expect(
      cleanup.ollamaProposal({ category: "Travel", detail: "Japan", confidence: 0.89 }),
    ).toBeNull();
  });
});
