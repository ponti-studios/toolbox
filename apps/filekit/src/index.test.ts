import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const packageRoot = new URL("..", import.meta.url).pathname;
const cli = join(packageRoot, "dist", "index.js");

test("frontmatter remove removes one field and preserves the body", () => {
  const root = mkdtempSync(join(tmpdir(), "filekit-"));
  const file = join(root, "essay.md");
  writeFileSync(file, "---\ntitle: Example\ndraft: true\nstatus: draft\n---\n\n# Body\n");
  execFileSync(process.execPath, [cli, "frontmatter", "remove", "--root", root, "--field", "draft"]);
  const content = readFileSync(file, "utf8");
  assert.equal(content.includes("draft:"), false);
  assert.equal(content.includes("status: draft"), true);
  assert.equal(content.endsWith("# Body\n"), true);
});

test("frontmatter publish stages only public published essays", () => {
  const root = mkdtempSync(join(tmpdir(), "filekit-"));
  const output = join(root, "out");
  writeFileSync(join(root, "public.md"), "---\ntitle: Public\nslug: public\ntype: essay\ndescription: Public\nstatus: published\nvisibility: public\n---\n\nPublic body\n");
  writeFileSync(join(root, "private.md"), "---\ntitle: Private\nslug: private\ntype: essay\ndescription: Private\nstatus: draft\nvisibility: private\n---\n\nPrivate body\n");
  execFileSync(process.execPath, [cli, "frontmatter", "publish", "--root", root, "--output", output]);
  assert.equal(readFileSync(join(output, "public.md"), "utf8").includes("Public body"), true);
  assert.throws(() => readFileSync(join(output, "private.md"), "utf8"));
});

test("frontmatter publish removes an essay when it is no longer public and published", () => {
  const root = mkdtempSync(join(tmpdir(), "filekit-"));
  const output = join(root, "out");
  const file = join(root, "essay.md");
  writeFileSync(file, "---\ntitle: Example\nslug: example\ndescription: Example\ntype: essay\nstatus: published\nvisibility: public\n---\n\nBody\n");
  execFileSync(process.execPath, [cli, "frontmatter", "publish", "--root", root, "--output", output]);
  assert.equal(existsSync(join(output, "example.md")), true);
  writeFileSync(file, "---\ntitle: Example\nslug: example\ndescription: Example\ntype: essay\nstatus: draft\nvisibility: private\n---\n\nBody\n");
  execFileSync(process.execPath, [cli, "frontmatter", "publish", "--root", root, "--output", output]);
  assert.equal(existsSync(join(output, "example.md")), false);
});
