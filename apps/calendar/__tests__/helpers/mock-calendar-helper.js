"use strict";

const childProcess = require("child_process");
const { EventEmitter } = require("events");

const realSpawn = childProcess.spawn;

function respondForRequest(request) {
  if (request.script === "calendars") {
    return {
      ok: true,
      calendars: [{ name: "Work", source: "iCloud", id: "CAL1", index: 0, writable: true }],
    };
  }
  if (request.script === "setup") {
    return { ok: true, message: "ok", calendars: ["Work"] };
  }
  if (request.script === "events") {
    return { ok: true, count: 0, truncated: false, events: [] };
  }
  if (request.script === "scan") {
    return {
      ok: true,
      events: [
        {
          id: "E1",
          uid: "U1",
          calendarId: "CAL1",
          summary: "walk",
          start: "2025-01-01T09:00:00",
          end: "2025-01-01T10:00:00",
          allDay: false,
          isRecurring: true,
        },
        {
          id: "E2",
          uid: "U1",
          calendarId: "CAL1",
          summary: "walk",
          start: "2025-01-08T09:00:00",
          end: "2025-01-08T10:00:00",
          allDay: false,
          isRecurring: true,
        },
        {
          id: "E3",
          uid: "U3",
          calendarId: "CAL1",
          summary: "Dinner",
          start: "2025-01-02T19:00:00",
          end: "2025-01-02T20:00:00",
          allDay: false,
          isRecurring: false,
        },
        {
          id: "E4",
          uid: "U4",
          calendarId: "CAL1",
          summary: "Dinner",
          start: "2025-01-02T19:00:00",
          end: "2025-01-02T20:00:00",
          allDay: false,
          isRecurring: false,
        },
      ],
    };
  }
  if (request.script === "mutate") {
    return {
      ok: true,
      changes: (request.args.changes || []).map((change) => ({
        ...change,
        previousSummary: change.expectedSummary,
      })),
      skipped: [],
    };
  }
  if (request.script === "event") {
    return { ok: false, error: { code: "EVENT_NOT_FOUND", message: "missing" } };
  }
  if (request.script === "freebusy") {
    return { ok: true, busy: [] };
  }
  return { ok: true };
}

childProcess.spawn = function patchedSpawn(command, args, options) {
  if (!String(command).endsWith("calendar-helper")) return realSpawn(command, args, options);

  const proc = new EventEmitter();
  let input = "";
  proc.stdin = {
    write(value) {
      input += String(value);
    },
    end() {
      const request = JSON.parse(input);
      const payload = respondForRequest(request);
      process.nextTick(() => {
        proc.stdout.emit("data", Buffer.from(JSON.stringify(payload)));
        proc.emit("close", 0);
      });
    },
  };
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();

  return proc;
};
