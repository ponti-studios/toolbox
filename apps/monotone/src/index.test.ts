import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createProgram } from "./index";
import type { QueueOptions } from "./commands/queue";

describe("createProgram", () => {
  it("passes --social-set through to queue", async () => {
    let captured: QueueOptions | undefined;
    const program = createProgram({
      run: () => undefined,
      queue: (options) => {
        captured = options;
      },
      logs: () => undefined,
    });

    await program.parseAsync(["queue", "essay.posts.json", "--dry-run", "--social-set", "set-123"], {
      from: "user",
    });

    assert.deepEqual(captured, {
      source: "essay.posts.json",
      dryRun: true,
      socialSet: "set-123",
    });
  });
});
