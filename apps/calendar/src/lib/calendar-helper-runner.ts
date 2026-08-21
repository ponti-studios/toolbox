// @ts-nocheck
"use strict";

const childProcess = require("child_process");
const path = require("path");

const HELPER_PATH =
  process.env.CALENDAR_HELPER_PATH || path.join(__dirname, "..", "calendar-helper");

// Exit codes
const EXIT_SUCCESS = 0;
const EXIT_RUNTIME_ERROR = 1;
const EXIT_VALIDATION_ERROR = 2;
const EXIT_NOT_AUTHORIZED = 10;

// Error codes
const ERROR_CODES = {
  NOT_AUTHORIZED: "NOT_AUTHORIZED",
  CALENDAR_NOT_FOUND: "CALENDAR_NOT_FOUND",
  AMBIGUOUS_CALENDAR: "AMBIGUOUS_CALENDAR",
  EVENT_NOT_FOUND: "EVENT_NOT_FOUND",
  INVALID_DATETIME: "INVALID_DATETIME",
  INVALID_RANGE: "INVALID_RANGE",
  INVALID_ARGUMENT: "INVALID_ARGUMENT",
  MISSING_REQUIRED: "MISSING_REQUIRED",
  JXA_ERROR: "JXA_ERROR",
  PARSE_ERROR: "PARSE_ERROR",
};

/**
 * Run a calendar operation through the native EventKit helper.
 * @param {string} scriptName - Calendar operation name
 * @param {object} args - Arguments to pass to the script as JSON
 * @returns {Promise<{success: boolean, data?: any, error?: {code: string, message: string}, exitCode: number}>}
 */
function runScript(scriptName, args = {}) {
  return new Promise((resolve) => {
    const operations = new Set([
      "setup",
      "calendars",
      "events",
      "event",
      "create",
      "update",
      "delete",
      "freebusy",
      "scan",
      "mutate",
    ]);
    if (!operations.has(scriptName)) {
      resolve({
        success: false,
        error: {
          code: ERROR_CODES.JXA_ERROR,
          message: `Unknown calendar operation: ${scriptName}`,
        },
        exitCode: EXIT_RUNTIME_ERROR,
      });
      return;
    }

    const proc = childProcess.spawn(HELPER_PATH, [], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    proc.stdin.write(JSON.stringify({ script: scriptName, args }));
    proc.stdin.end();

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      // Try to parse stdout as JSON
      const trimmedOutput = stdout.trim();

      if (!trimmedOutput) {
        // No output - check if there was an error
        if (stderr.trim()) {
          resolve({
            success: false,
            error: {
              code: ERROR_CODES.JXA_ERROR,
              message: stderr.trim(),
            },
            exitCode: EXIT_RUNTIME_ERROR,
          });
        } else if (code !== 0) {
          resolve({
            success: false,
            error: {
              code: ERROR_CODES.JXA_ERROR,
              message: `Calendar helper exited with code ${code}`,
            },
            exitCode: EXIT_RUNTIME_ERROR,
          });
        } else {
          // Success with no output
          resolve({
            success: true,
            data: null,
            exitCode: EXIT_SUCCESS,
          });
        }
        return;
      }

      try {
        const data = JSON.parse(trimmedOutput);

        // Check if the script returned an error
        if (data.ok === false && data.error) {
          const exitCode = getExitCodeForError(data.error.code);
          resolve({
            success: false,
            error: data.error,
            exitCode,
          });
        } else {
          resolve({
            success: true,
            data,
            exitCode: EXIT_SUCCESS,
          });
        }
      } catch {
        resolve({
          success: false,
          error: {
            code: ERROR_CODES.PARSE_ERROR,
            message: `Failed to parse EventKit helper output: ${trimmedOutput.substring(0, 200)}`,
          },
          exitCode: EXIT_RUNTIME_ERROR,
        });
      }
    });

    proc.on("error", (err) => {
      resolve({
        success: false,
        error: {
          code: ERROR_CODES.JXA_ERROR,
          message: `Failed to execute calendar helper: ${err.message}`,
        },
        exitCode: EXIT_RUNTIME_ERROR,
      });
    });
  });
}

/**
 * Get the appropriate exit code for an error code
 */
function getExitCodeForError(errorCode) {
  switch (errorCode) {
    case ERROR_CODES.NOT_AUTHORIZED:
      return EXIT_NOT_AUTHORIZED;
    case ERROR_CODES.INVALID_DATETIME:
    case ERROR_CODES.INVALID_RANGE:
    case ERROR_CODES.INVALID_ARGUMENT:
    case ERROR_CODES.MISSING_REQUIRED:
    case ERROR_CODES.AMBIGUOUS_CALENDAR:
      return EXIT_VALIDATION_ERROR;
    default:
      return EXIT_RUNTIME_ERROR;
  }
}

module.exports = {
  runScript,
  ERROR_CODES,
  EXIT_SUCCESS,
  EXIT_RUNTIME_ERROR,
  EXIT_VALIDATION_ERROR,
  EXIT_NOT_AUTHORIZED,
};
