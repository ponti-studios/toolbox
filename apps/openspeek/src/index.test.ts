import { describe, expect, test } from "bun:test";
import { chunkText, expandPath, toNarration } from "./lib";

describe("toNarration", () => {
  test("strips frontmatter, headings, links, emphasis, and list markers", () => {
    const md = `---
status: draft
tags: [audio]
---

# Chapter One

Some **bold** and *italic* and ~struck~ text with a [link](https://example.com)
and an image ![alt here](img.png).

- item one
- item two

1. first
2. second

> A blockquote.

\`\`\`ts
const x = 1;
\`\`\`
`;
    const out = toNarration(md);
    expect(out).not.toMatch(/^---/);
    expect(out).toContain("Chapter One");
    expect(out).not.toMatch(/\*\*|__|\*/);
    expect(out).not.toMatch(/example\.com|img\.png/);
    expect(out).not.toMatch(/^\s*[-*+] |^\s*\d+[.)]/m);
    expect(out).not.toMatch(/^>/m);
    expect(out).toContain("A blockquote.");
    expect(out).not.toMatch(/const x = 1/);
    expect(out).toContain("alt here");
    expect(out).toContain("link");
  });

  test("collapses blank runs and collapses whitespace on lines", () => {
    const out = toNarration("one\n\n\n\ntwo");
    expect(out).toBe("one\n\ntwo");
  });
});

describe("chunkText", () => {
  test("splits long text into bounded chunks", () => {
    const text = Array.from({ length: 40 }, (_, i) => `line ${i} with some padding`).join("\n");
    const chunks = chunkText(text, 60);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(61);
    expect(chunks.join("").replace(/\n/g, "")).toBe(text.replace(/\n/g, ""));
  });

  test("keeps short text as a single chunk", () => {
    expect(chunkText("just a short sentence", 1500).length).toBe(1);
  });

  test("drops trailing blank chunks", () => {
    expect(chunkText("", 1500)).toEqual([]);
  });
});

describe("expandPath", () => {
  test("expands $VAR and ${VAR} from the environment", () => {
    process.env.OPENSPEEK_TEST = "/tmp/x";
    expect(expandPath("$OPENSPEEK_TEST/a.md")).toBe("/tmp/x/a.md");
    expect(expandPath("${OPENSPEEK_TEST}/a.md")).toBe("/tmp/x/a.md");
  });

  test("expands ~ and ~/ prefix", () => {
    const home = process.env.HOME ?? "";
    expect(expandPath("~/Desktop/a.md")).toBe(`${home}/Desktop/a.md`);
    expect(expandPath("~")).toBe(home);
  });

  test("leaves unknown variables and plain paths untouched", () => {
    expect(expandPath("$DOES_NOT_EXIST_OPENSPEEK/keep")).toBe("$DOES_NOT_EXIST_OPENSPEEK/keep");
    expect(expandPath("relative/path.md")).toBe("relative/path.md");
  });
});
