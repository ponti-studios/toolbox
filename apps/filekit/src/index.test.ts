import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const packageRoot = new URL("..", import.meta.url).pathname;
const cli = join(packageRoot, "dist", "index.js");

test("frontmatter remove removes one field and preserves the body", () => {
  const root = mkdtempSync(join(tmpdir(), "filekit-"));
  const file = join(root, "essay.md");
  writeFileSync(file, "---\ntitle: Example\ndraft: true\nstatus: draft\n---\n\n# Body\n");
  execFileSync(process.execPath, [
    cli,
    "frontmatter",
    "remove",
    "--root",
    root,
    "--field",
    "draft",
  ]);
  const content = readFileSync(file, "utf8");
  assert.equal(content.includes("draft:"), false);
  assert.equal(content.includes("status: draft"), true);
  assert.equal(content.endsWith("# Body\n"), true);
});

test("frontmatter remove edits surgically by default: only the key's block, byte-identical elsewhere", () => {
  const root = mkdtempSync(join(tmpdir(), "filekit-"));
  const file = join(root, "essay.md");
  const before =
    "---\ntitle: Example\nstatus: draft\npublish: false\nvisibility: private\npubDate: 2026-05-28\nupdated: 2026-08-19T02:56:14.263376+00:00\ntags:\n- language\n---\n\n# Body\n";
  writeFileSync(file, before);
  execFileSync(process.execPath, [cli, "frontmatter", "remove", "--root", root, "--field", "publish"]);
  const content = readFileSync(file, "utf8");
  assert.equal(content.includes("publish:"), false);
  // dates and formatting of untouched keys survive the edit untouched
  assert.equal(content.includes("pubDate: 2026-05-28"), true);
  assert.equal(content.includes("updated: 2026-08-19T02:56:14.263376+00:00"), true);
  assert.equal(content.includes("tags:\n- language"), true);
  assert.equal(content.endsWith("# Body\n"), true);
});

test("frontmatter update changes only the target key's value by default", () => {
  const root = mkdtempSync(join(tmpdir(), "filekit-"));
  const file = join(root, "essay.md");
  writeFileSync(
    file,
    "---\ntitle: Example\nstatus: draft\nupdated: 2026-08-19T02:56:14.263376+00:00\nvisibility: private\n---\n\n# Body\n",
  );
  execFileSync(process.execPath, [
    cli,
    "frontmatter",
    "update",
    "--root",
    root,
    "--field",
    "updated",
    "--value",
    "2026-08-26T18:30:00.000000+00:00",
  ]);
  const content = readFileSync(file, "utf8");
  assert.equal(content.includes("updated: 2026-08-26T18:30:00.000000+00:00"), true);
  assert.equal(content.startsWith("---\ntitle: Example\nstatus: draft\nupdated: 2026-08-26T18:30:00.000000+00:00\nvisibility: private\n"), true);
});

test("frontmatter remove deletes multi-line frontmatter blocks as a whole", () => {
  const root = mkdtempSync(join(tmpdir(), "filekit-"));
  const file = join(root, "essay.md");
  writeFileSync(
    file,
    "---\ntitle: Example\ntags:\n- language\n- culture\npublish: false\n---\n\n# Body\n",
  );
  execFileSync(process.execPath, [cli, "frontmatter", "remove", "--root", root, "--field", "tags"]);
  const content = readFileSync(file, "utf8");
  assert.equal(content.includes("language"), false);
  assert.equal(content.includes("culture"), false);
  assert.equal(content.includes("publish: false"), true);
  assert.equal(content.endsWith("# Body\n"), true);
});

test("frontmatter remove --render re-renders the whole block (normalizes date scalars)", () => {
  const root = mkdtempSync(join(tmpdir(), "filekit-"));
  const file = join(root, "essay.md");
  writeFileSync(
    file,
    "---\ntitle: Example\npublish: false\npubDate: 2026-05-28\n---\n",
  );
  execFileSync(process.execPath, [
    cli,
    "frontmatter",
    "remove",
    "--root",
    root,
    "--field",
    "publish",
    "--render",
  ]);
  const content = readFileSync(file, "utf8");
  assert.equal(content.includes("publish:"), false);
  // render mode intentionally normalizes the date scalar into full ISO
  assert.equal(content.includes("pubDate: 2026-05-28T00:00:00.000Z"), true);
});

test("frontmatter stage stages files matching generic frontmatter filters", () => {
  const root = mkdtempSync(join(tmpdir(), "filekit-"));
  const output = join(root, "out");
  writeFileSync(
    join(root, "public.md"),
    "---\ntitle: Public\nslug: public\ntype: essay\ndescription: Public\nstatus: published\nvisibility: public\n---\n\nPublic body\n",
  );
  writeFileSync(
    join(root, "private.md"),
    "---\ntitle: Private\nslug: private\ntype: essay\ndescription: Private\nstatus: draft\nvisibility: private\n---\n\nPrivate body\n",
  );
  execFileSync(process.execPath, [
    cli,
    "frontmatter",
    "stage",
    "--root",
    root,
    "--output",
    output,
    "--where",
    "status=published",
    "visibility=public",
  ]);
  assert.equal(readFileSync(join(output, "public.md"), "utf8").includes("Public body"), true);
  assert.throws(() => readFileSync(join(output, "private.md"), "utf8"));
});

test("frontmatter stage removes a file when it no longer matches filters", () => {
  const root = mkdtempSync(join(tmpdir(), "filekit-"));
  const output = join(root, "out");
  const file = join(root, "essay.md");
  writeFileSync(
    file,
    "---\ntitle: Example\nslug: example\ndescription: Example\ntype: essay\nstatus: published\nvisibility: public\n---\n\nBody\n",
  );
  execFileSync(process.execPath, [
    cli,
    "frontmatter",
    "stage",
    "--root",
    root,
    "--output",
    output,
    "--where",
    "status=published",
    "visibility=public",
    "--name-field",
    "slug",
  ]);
  assert.equal(existsSync(join(output, "example.md")), true);
  writeFileSync(
    file,
    "---\ntitle: Example\nslug: example\ndescription: Example\ntype: essay\nstatus: draft\nvisibility: private\n---\n\nBody\n",
  );
  execFileSync(process.execPath, [
    cli,
    "frontmatter",
    "stage",
    "--root",
    root,
    "--output",
    output,
    "--where",
    "status=published",
    "visibility=public",
    "--name-field",
    "slug",
  ]);
  assert.equal(existsSync(join(output, "example.md")), false);
});

test("frontmatter stage removes stale generated files from its manifest", () => {
  const root = mkdtempSync(join(tmpdir(), "filekit-"));
  const output = join(root, "out");
  writeFileSync(
    join(root, "public.md"),
    "---\ntitle: Public\nslug: public\ntype: essay\ndescription: Public\nstatus: published\nvisibility: public\n---\n\nBody\n",
  );
  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, "legacy-slug.md"), "legacy\n");
  writeFileSync(join(output, ".filekit-stage-manifest"), `${join(output, "legacy-slug.md")}\n`);
  execFileSync(process.execPath, [cli, "frontmatter", "stage", "--root", root, "--output", output]);
  assert.equal(existsSync(join(output, "legacy-slug.md")), false);
  assert.equal(existsSync(join(output, "public.md")), true);
});
