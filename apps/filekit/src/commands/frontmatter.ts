import { existsSync, mkdirSync, statSync, unlinkSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import type { Frontmatter, FrontmatterEdit } from "../lib/helpers.js";
import {
  applyFrontmatterEdits,
  asString,
  filesFrom,
  markdownFiles,
  parseFile,
  readText,
  renderFile,
  requireString,
  writeText,
} from "../lib/helpers.js";

export function frontmatterWalk(options: {
  root: string;
  output?: string;
  includeHidden?: boolean;
}): void {
  const rows = filesFrom(options.root, options.includeHidden).map(({ file, data }) => ({
    path: relative(resolve(options.root), file),
    fields: Object.keys(data).sort(),
  }));
  const value =
    options.output === "json"
      ? JSON.stringify(rows, null, 2)
      : rows.map((row) => `${row.path}: ${row.fields.join(", ")}`).join("\n");
  if (options.output && options.output !== "json") writeText(options.output, value + "\n");
  else console.log(value);
}

export function frontmatterAggregate(target: string, output?: string): void {
  const files = statSync(target).isFile() ? [target] : markdownFiles(resolve(target));
  const values = new Map<string, Set<string>>();
  for (const file of files) {
    const parsed = parseFile(file);
    if (!parsed) continue;
    for (const [key, value] of Object.entries(parsed.data)) {
      const set = values.get(key) ?? new Set<string>();
      const items = Array.isArray(value) ? value : [value];
      for (const item of items)
        if (typeof item === "string" || typeof item === "number" || typeof item === "boolean")
          set.add(String(item));
      values.set(key, set);
    }
  }
  const result = [...values.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, set]) => ({ name, values: [...set].sort() }));
  const text = JSON.stringify(result, null, 2);
  if (output) writeText(output, text + "\n");
  else console.log(text);
}

export type SchemaDefinition = {
  required: string[];
  defaults: Frontmatter;
  allowed: Record<string, string[]>;
};

export function getSchema(schemaPath?: string): SchemaDefinition {
  if (!schemaPath) return { required: [], defaults: {}, allowed: {} };
  const parsed = JSON.parse(readText(resolve(schemaPath))) as Partial<SchemaDefinition>;
  return {
    required: parsed.required ?? [],
    defaults: parsed.defaults ?? {},
    allowed: parsed.allowed ?? {},
  };
}
export function validationErrors(
  data: Frontmatter,
  schema: SchemaDefinition = getSchema(),
): string[] {
  return schema.required
    .flatMap((key) =>
      data[key] === undefined || (typeof data[key] === "string" && !data[key].trim())
        ? [`missing or invalid ${key}`]
        : [],
    )
    .concat(
      Object.entries(schema.allowed).flatMap(([key, values]) =>
        data[key] !== undefined && (typeof data[key] !== "string" || !values.includes(data[key]))
          ? [`invalid ${key}`]
          : [],
      ),
    );
}

export function validateFiles(root: string, schemaPath?: string): void {
  const schema = getSchema(schemaPath);
  const errors: string[] = [];
  for (const target of filesFrom(root)) {
    for (const error of validationErrors(target.data, schema))
      errors.push(`${target.file}: ${error}`);
  }
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(`Validated ${filesFrom(root).length} files`);
}

function matchesFilters(data: Frontmatter, filters: string[]): boolean {
  return filters.every((filter) => {
    const separator = filter.indexOf("=");
    if (separator <= 0)
      throw new Error(`Invalid filter ${JSON.stringify(filter)}; expected field=value`);
    const field = filter.slice(0, separator);
    const expected = filter.slice(separator + 1);
    return String(data[field] ?? "") === expected;
  });
}

export function stage(
  root: string,
  output: string,
  filters: string[] = [],
  nameField?: string,
): void {
  validateFiles(root);
  mkdirSync(output, { recursive: true });
  const manifest = join(output, ".filekit-stage-manifest");
  const previous = existsSync(manifest) ? readText(manifest).split("\n").filter(Boolean) : [];
  for (const file of previous) if (existsSync(file)) unlinkSync(file);
  const staged: string[] = [];
  for (const target of filesFrom(root)) {
    if (!matchesFilters(target.data, filters)) continue;
    const filename = nameField
      ? `${requireString(target.data, nameField)}.md`
      : target.file.split(/[\\/]/).pop()!;
    const destination = join(resolve(output), filename);
    writeText(destination, renderFile(target.data, target.body));
    staged.push(destination);
  }
  writeText(manifest, staged.join("\n") + "\n");
  console.log(`Staged ${staged.length} files`);
}

export function updateField(
  root: string,
  field: string,
  value: string,
  dryRun: boolean,
  render = false,
): void {
  for (const target of filesFrom(root)) {
    if (!render) {
      const updated = applyFrontmatterEdits(readText(target.file), [
        { key: field, action: "set", value },
      ]);
      if (dryRun) console.log(`Would update ${field}: ${target.file}`);
      else if (updated !== readText(target.file)) {
        writeText(target.file, updated);
        console.log(`Updated ${target.file}`);
      }
      continue;
    }
    target.data[field] = value;
    if (dryRun) console.log(`Would update ${field}: ${target.file}`);
    else {
      writeText(target.file, renderFile(target.data, target.body));
      console.log(`Updated ${target.file}`);
    }
  }
}

export function setField(
  file: string,
  field: string,
  value: string,
  dryRun: boolean,
  render = false,
): void {
  const target = parseFile(resolve(file));
  if (!target) throw new Error(`No frontmatter found in ${file}`);
  if (!render) {
    const updated = applyFrontmatterEdits(readText(target.file), [
      { key: field, action: "set", value },
    ]);
    if (dryRun) console.log(`Would set ${field}: ${file}`);
    else {
      writeText(target.file, updated);
      console.log(`Set ${field}: ${target.file}`);
    }
    return;
  }
  const data = { ...target.data, [field]: value };
  if (dryRun) console.log(`Would set ${field}: ${file}`);
  else {
    writeText(target.file, renderFile(data, target.body));
    console.log(`Set ${field}: ${target.file}`);
  }
}

export function removeField(
  root: string,
  field: string,
  dryRun: boolean,
  render = false,
): void {
  for (const target of filesFrom(root)) {
    if (!(field in target.data)) continue;
    if (!render) {
      const updated = applyFrontmatterEdits(readText(target.file), [
        { key: field, action: "remove" },
      ]);
      if (dryRun) console.log(`Would remove ${field}: ${target.file}`);
      else {
        writeText(target.file, updated);
        console.log(`Removed ${field}: ${target.file}`);
      }
      continue;
    }
    if (dryRun) console.log(`Would remove ${field}: ${target.file}`);
    else {
      const data = { ...target.data };
      delete data[field];
      writeText(target.file, renderFile(data, target.body));
      console.log(`Removed ${field}: ${target.file}`);
    }
  }
}

export function slugCommand(
  root: string,
  options: {
    resolve?: boolean;
    detect?: boolean;
    scope?: string;
    slug?: string;
    policy?: string;
    maxAttempts?: string;
    existingSlugs?: string[];
    output?: string;
  },
): void {
  if (options.resolve) {
    if (!options.slug?.trim()) throw new Error("--slug is required when using --resolve");
    const existing = new Set(
      (options.existingSlugs ?? []).map((value) => value.trim()).filter(Boolean),
    );
    let resolved = options.slug;
    if (existing.has(resolved)) {
      if (options.policy === "fail")
        throw new Error(`slug ${JSON.stringify(resolved)} collides with: (existing)`);
      if (options.policy === "append-uid")
        resolved = `${resolved}-${Math.random().toString(36).slice(2, 6)}`;
      else {
        for (let i = 2; i <= Number(options.maxAttempts ?? 10) + 1; i++)
          if (!existing.has(`${resolved}-${i}`)) {
            resolved = `${resolved}-${i}`;
            break;
          }
      }
    }
    const result = { slug: options.slug, resolved };
    console.log(
      options.output === "json"
        ? JSON.stringify(result, null, 2)
        : `${options.slug} -> ${resolved}`,
    );
    return;
  }
  const seen = new Map<string, string[]>();
  for (const target of filesFrom(root)) {
    const slug = asString(target.data.slug);
    if (slug) (seen.get(slug) ?? (seen.set(slug, []), seen.get(slug)!)).push(target.file);
  }
  const collisions = [...seen.entries()].flatMap(([slug, paths]) =>
    paths.length < 2
      ? []
      : paths.map((path) => ({ slug, path, collisions: paths.filter((other) => other !== path) })),
  );
  if (options.output === "json") console.log(JSON.stringify(collisions, null, 2));
  else if (!collisions.length) console.log("No slug collisions found");
  else
    for (const collision of collisions)
      console.log(
        `${collision.path}\n  slug: ${collision.slug}\n  collides with: ${collision.collisions.join(", ")}\n`,
      );
  if (collisions.length && !options.resolve && options.detect)
    throw new Error("slug collisions found");
}
