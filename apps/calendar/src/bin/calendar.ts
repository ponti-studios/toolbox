#!/usr/bin/env node
import { run } from "@oclif/core";
import { runLegacy } from "../legacy/dispatcher.js";

const argv = process.argv.slice(2);
const commands = new Set([
  "setup",
  "calendars",
  "events",
  "event",
  "create",
  "update",
  "delete",
  "freebusy",
  "config",
  "audit",
  "normalize",
  "patterns",
  "rollback",
  "preflight",
  "verify-import",
]);
const useLegacyGlobalBehavior =
  argv.length === 0 || argv[0] === "--version" || argv[0] === "--help" || !commands.has(argv[0]);
const execution = useLegacyGlobalBehavior ? runLegacy(argv) : run(argv);

execution.catch((error: unknown) => {
  console.error("Unexpected error:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
