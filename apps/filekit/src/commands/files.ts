import fg from "fast-glob";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, statSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { parse as parseCsv } from "csv-parse/sync";
import { stringify as stringifyCsv } from "csv-stringify/sync";
import ExcelJS from "exceljs";
import { readText, writeText } from "../lib/helpers.js";

export function mergeMarkdown(
  output: string,
  inputs: string[],
  toc: boolean,
  filenames: boolean,
): void {
  const sections = inputs
    .flatMap((pattern) => fg.sync(pattern, { onlyFiles: true }).sort())
    .map((file) => ({ file, body: readText(file) }));
  const text = `${
    toc
      ? `${sections
          .map(
            ({ file }, index) =>
              `${index + 1}. [${basename(file)}](#${basename(file, extname(file))
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")})`,
          )
          .join("\n")}\n\n`
      : ""
  }${sections.map(({ file, body }) => `${filenames ? `## ${basename(file)}\n\n` : ""}${body.trim()}`).join("\n\n")}\n`;
  writeText(output, text);
}

export function moveFile(source: string, destination: string, dryRun: boolean): void {
  const from = resolve(source);
  const to = resolve(destination);
  if (!existsSync(from)) throw new Error(`Source does not exist: ${from}`);
  if (existsSync(to)) throw new Error(`Destination already exists: ${to}`);
  if (dryRun) {
    console.log(`Would move ${from} -> ${to}`);
    return;
  }
  mkdirSync(dirname(to), { recursive: true });
  renameSync(from, to);
  console.log(`Moved ${from} -> ${to}`);
}
export function findDuplicates(
  directory: string,
  algorithm: "md5" | "sha1" | "sha256",
  minSize: number,
  extensions: string[],
  showHashes: boolean,
): void {
  const files = fg
    .sync("**/*", { cwd: resolve(directory), absolute: true, onlyFiles: true, dot: false })
    .filter(
      (file) =>
        statSync(file).size >= minSize &&
        (!extensions.length || extensions.includes(extname(file))),
    );
  const groups = new Map<string, string[]>();
  for (const file of files) {
    const hash = createHash(algorithm).update(readFileSync(file)).digest("hex");
    const group = groups.get(hash) ?? [];
    group.push(file);
    groups.set(hash, group);
  }
  for (const [hash, group] of groups)
    if (group.length > 1)
      console.log(JSON.stringify({ hash: showHashes ? hash : undefined, files: group }, null, 2));
}
export function convert(
  input: string,
  output: string,
  csvToJson: boolean,
  flatten: boolean,
  separator: string,
): void {
  if (csvToJson || extname(input).toLowerCase() === ".csv") {
    const records = parseCsv(readText(input), { columns: true, skip_empty_lines: true });
    writeText(output, JSON.stringify(records, null, 2) + "\n");
    return;
  }
  const value = JSON.parse(readText(input)) as unknown;
  const rows = Array.isArray(value) ? value : [value];
  writeText(output, stringifyCsv(rows, { header: true, delimiter: separator }));
}
export async function xlsxToCsv(
  file: string,
  directory: string | undefined,
  allSheets: boolean,
): Promise<void> {
  const files = file
    ? [file]
    : fg.sync("**/*.xlsx", { cwd: resolve(directory ?? "."), absolute: true });
  for (const source of files) {
    const book = new ExcelJS.Workbook();
    await book.xlsx.readFile(source);
    const sheets = allSheets ? book.worksheets : book.worksheets.slice(0, 1);
    for (const sheet of sheets) {
      const rows: unknown[][] = [];
      sheet.eachRow({ includeEmpty: true }, (row) => {
        const values = row.values as unknown[];
        rows.push(values.slice(1));
      });
      writeText(
        join(dirname(source), `${basename(source, extname(source))}-${sheet.name}.csv`),
        stringifyCsv(rows),
      );
    }
  }
}
