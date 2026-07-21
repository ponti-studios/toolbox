import { mkdtempSync, writeFileSync } from "fs";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { tmpdir } from "os";
import { join } from "path";
import { nextVersionPath } from "./run";

describe("nextVersionPath", () => {
  it("uses the requested output extension for versioned paths", () => {
    const dir = mkdtempSync(join(tmpdir(), "monotone-run-"));
    const source = join(dir, "essay.md");
    writeFileSync(source, "source");
    writeFileSync(join(dir, "essay.v1.posts.json"), "{}");

    assert.equal(nextVersionPath(source, ".posts", ".json"), join(dir, "essay.v2.posts.json"));
  });
});
