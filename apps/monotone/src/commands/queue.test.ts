import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parsePostContent } from "./queue";

describe("parsePostContent", () => {
  it("parses JSON posts and ignores TikTok clip metadata", () => {
    const posts = parsePostContent(
      JSON.stringify({
        posts: [{ id: 1, type: "long_post", text: "A queueable X post." }],
        tiktok_clips: [
          {
            hook: "Hook",
            timestamp: "00:10-00:20",
            visual: "A visual",
            caption: "A caption",
          },
        ],
      }),
      "essay.posts.json",
    );

    assert.deepEqual(posts, [{ type: "long_post", text: "A queueable X post." }]);
  });

  it("parses legacy Markdown posts", () => {
    const posts = parsePostContent(
      `---
title: Example
---

## 1. [long_post]

Legacy post body.

## TikTok Clip Ideas

- This should not be queued.
`,
      "essay.posts.md",
    );

    assert.deepEqual(posts, [{ type: "long_post", text: "Legacy post body." }]);
  });

  it("throws a clear error for invalid JSON", () => {
    assert.throws(() => parsePostContent("{ nope", "essay.posts.json"), /Invalid JSON posts file/);
  });

  it("throws a clear error when JSON has no posts array", () => {
    assert.throws(
      () => parsePostContent("{}", "essay.posts.json"),
      /Invalid JSON posts file: expected an object with a posts array/,
    );
  });
});
