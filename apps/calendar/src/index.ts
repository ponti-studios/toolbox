#!/usr/bin/env node
import { run } from "@oclif/core";

const execution = run();

execution.catch((error: unknown) => {
  console.error("Unexpected error:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
