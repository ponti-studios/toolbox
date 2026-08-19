"use strict";

const { EventEmitter } = require("events");
const childProcess = require("child_process");

function makeFakeProcess({ stdout = "", stderr = "", closeCode = 0, emitError = null }) {
  const proc = new EventEmitter();
  proc.stdin = { write: vi.fn(), end: vi.fn() };
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();

  process.nextTick(() => {
    if (emitError) {
      proc.emit("error", emitError);
      return;
    }
    if (stdout) proc.stdout.emit("data", Buffer.from(stdout));
    if (stderr) proc.stderr.emit("data", Buffer.from(stderr));
    proc.emit("close", closeCode);
  });

  return proc;
}

describe("lib/calendar-helper-runner", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  test("returns the runtime error code for an unknown operation", async () => {
    const { runScript, ERROR_CODES, EXIT_RUNTIME_ERROR } =
      await import("../dist/lib/calendar-helper-runner.js");

    const result = await runScript("__definitely_missing__", {});
    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(EXIT_RUNTIME_ERROR);
    expect(result.error.code).toBe(ERROR_CODES.JXA_ERROR);
    expect(result.error.message).toMatch(/Unknown calendar operation/);
  });

  test("sends operation args and parses JSON stdout", async () => {
    const spawnMock = vi.fn((cmd, args) => {
      expect(cmd).toMatch(/calendar-helper$/);
      expect(args).toEqual([]);
      return makeFakeProcess({
        stdout: JSON.stringify({ ok: true, calendars: [] }),
        closeCode: 0,
      });
    });
    vi.spyOn(childProcess, "spawn").mockImplementation(spawnMock);

    const { runScript, EXIT_SUCCESS } = await import("../dist/lib/calendar-helper-runner.js");
    const result = await runScript("calendars", { foo: "bar" });

    expect(result).toEqual({
      success: true,
      data: { ok: true, calendars: [] },
      exitCode: EXIT_SUCCESS,
    });
    expect(spawnMock).toHaveBeenCalledTimes(1);
    const process = spawnMock.mock.results[0].value;
    expect(process.stdin.write).toHaveBeenCalledWith(
      JSON.stringify({ script: "calendars", args: { foo: "bar" } }),
    );
    expect(process.stdin.end).toHaveBeenCalledTimes(1);
  });

  test("maps script error codes to validation exit code", async () => {
    const spawnMock = vi.fn(() =>
      makeFakeProcess({
        stdout: JSON.stringify({ ok: false, error: { code: "INVALID_ARGUMENT", message: "nope" } }),
        closeCode: 0,
      }),
    );
    vi.spyOn(childProcess, "spawn").mockImplementation(spawnMock);

    const { runScript, EXIT_VALIDATION_ERROR } =
      await import("../dist/lib/calendar-helper-runner.js");
    const result = await runScript("calendars", {});

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(EXIT_VALIDATION_ERROR);
    expect(result.error).toEqual({ code: "INVALID_ARGUMENT", message: "nope" });
  });

  test("returns NOT_AUTHORIZED from the helper response", async () => {
    const spawnMock = vi.fn(() =>
      makeFakeProcess({
        stdout: JSON.stringify({
          ok: false,
          error: { code: "NOT_AUTHORIZED", message: "Calendar access not granted" },
        }),
      }),
    );
    vi.spyOn(childProcess, "spawn").mockImplementation(spawnMock);

    const { runScript, ERROR_CODES, EXIT_NOT_AUTHORIZED } =
      await import("../dist/lib/calendar-helper-runner.js");
    const result = await runScript("calendars", {});

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(EXIT_NOT_AUTHORIZED);
    expect(result.error.code).toBe(ERROR_CODES.NOT_AUTHORIZED);
    expect(result.error.message).toMatch(/Calendar access not granted/);
  });

  test("returns PARSE_ERROR when stdout is not JSON", async () => {
    const spawnMock = vi.fn(() =>
      makeFakeProcess({
        stdout: "this is not json",
        stderr: "",
        closeCode: 0,
      }),
    );
    vi.spyOn(childProcess, "spawn").mockImplementation(spawnMock);

    const { runScript, ERROR_CODES, EXIT_RUNTIME_ERROR } =
      await import("../dist/lib/calendar-helper-runner.js");
    const result = await runScript("calendars", {});

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(EXIT_RUNTIME_ERROR);
    expect(result.error.code).toBe(ERROR_CODES.PARSE_ERROR);
  });

  test("returns the runtime error code when the helper cannot be executed", async () => {
    const spawnMock = vi.fn(() =>
      makeFakeProcess({
        emitError: new Error("spawn EPERM"),
      }),
    );
    vi.spyOn(childProcess, "spawn").mockImplementation(spawnMock);

    const { runScript, ERROR_CODES, EXIT_RUNTIME_ERROR } =
      await import("../dist/lib/calendar-helper-runner.js");
    const result = await runScript("calendars", {});

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(EXIT_RUNTIME_ERROR);
    expect(result.error.code).toBe(ERROR_CODES.JXA_ERROR);
    expect(result.error.message).toMatch(/Failed to execute calendar helper/);
  });
});
