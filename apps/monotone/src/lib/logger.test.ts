import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatDurationSeconds } from "./logger";

describe("formatDurationSeconds", () => {
  it("formats millisecond durations as seconds", () => {
    assert.equal(formatDurationSeconds(1234), "1.2");
  });

  it("uses a placeholder when duration is unavailable", () => {
    assert.equal(formatDurationSeconds(undefined), "?");
  });
});
