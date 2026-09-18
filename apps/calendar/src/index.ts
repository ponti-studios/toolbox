#!/usr/bin/env node
import { run } from "@oclif/core";

const execution = run();

execution.catch((error: unknown) => {
  const oclifExit =
    typeof error === "object" && error !== null && "oclif" in error
      ? (error as { oclif?: { exit?: unknown } }).oclif?.exit
      : undefined;
  if (typeof oclifExit === "number") {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = oclifExit;
    return;
  }
  console.error("Unexpected error:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
