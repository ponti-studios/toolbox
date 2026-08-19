#!/usr/bin/env node
import { Command } from "commander";
import { readdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import { analyze } from "./commands/analyze.js";
import { generateCompletions, installCompletions } from "./commands/completions.js";
import { docxToMd } from "./commands/docx.js";
import { mergeMarkdown, findDuplicates, convert, moveFile, xlsxToCsv } from "./commands/files.js";
import {
  frontmatterAggregate,
  frontmatterWalk,
  getSchema,
  stage,
  removeField,
  setField,
  slugCommand,
  updateField,
  validateFiles,
} from "./commands/frontmatter.js";
import { filesFrom, readText, renderFile, rootOption, writeText } from "./lib/helpers.js";

const program = new Command()
  .name("filekit")
  .description("CLI utilities and tools")
  .version("1.0.0");

const frontmatter = program.command("frontmatter");
rootOption(frontmatter.command("walk").description("Walk and display frontmatter"))
  .option("-o, --output <output>")
  .option("--include-hidden", "include hidden files")
  .option("--extensions <extensions>", ".md,.markdown")
  .option("--max-files <count>", "0")
  .option("--exclude-globs <patterns...>")
  .action(frontmatterWalk);
rootOption(
  frontmatter.command("aggregate").argument("[target]", ".").option("-o, --output <output>"),
).action((target: string, options: { output?: string }) =>
  frontmatterAggregate(target, options.output),
);
rootOption(frontmatter.command("validate"))
  .option("-s, --schema <schema>", "path to a JSON schema definition")
  .option("-o, --output <output>", "text")
  .action((options: { root: string; schema?: string }) =>
    validateFiles(options.root, options.schema),
  );
rootOption(frontmatter.command("stage"))
  .requiredOption("-o, --output <output>")
  .option("--where <filters...>", "only stage files matching field=value filters")
  .option("--name-field <field>", "frontmatter field used for staged filenames")
  .action((options: { root: string; output: string; where?: string[]; nameField?: string }) =>
    stage(options.root, options.output, options.where, options.nameField),
  );
rootOption(frontmatter.command("publish").description("Deprecated alias for stage"))
  .requiredOption("-o, --output <output>")
  .option("--where <filters...>", "only stage files matching field=value filters")
  .option("--name-field <field>", "frontmatter field used for staged filenames")
  .action((options: { root: string; output: string; where?: string[]; nameField?: string }) =>
    stage(options.root, options.output, options.where, options.nameField),
  );
rootOption(frontmatter.command("update"))
  .requiredOption("--field <field>")
  .requiredOption("--value <value>")
  .option("--dry-run")
  .action((options: { root: string; field: string; value: string; dryRun?: boolean }) =>
    updateField(options.root, options.field, options.value, Boolean(options.dryRun)),
  );
frontmatter
  .command("set")
  .requiredOption("--file <file>")
  .requiredOption("--field <field>")
  .requiredOption("--value <value>")
  .option("--dry-run")
  .action((options: { file: string; field: string; value: string; dryRun?: boolean }) =>
    setField(options.file, options.field, options.value, Boolean(options.dryRun)),
  );
rootOption(frontmatter.command("remove"))
  .requiredOption("--field <field>")
  .option("--dry-run")
  .action((options: { root: string; field: string; dryRun?: boolean }) =>
    removeField(options.root, options.field, Boolean(options.dryRun)),
  );
rootOption(frontmatter.command("slug"))
  .option("--resolve")
  .option("--detect")
  .option("--scope <scope>", "directory")
  .option("--slug <slug>")
  .option("--policy <policy>", "increment")
  .option("--max-attempts <count>", "10")
  .option("--existing-slugs <slugs...>")
  .option("-o, --output <output>", "text")
  .action((options: Parameters<typeof slugCommand>[1] & { root: string }) =>
    slugCommand(options.root, options),
  );
rootOption(frontmatter.command("migrate"))
  .option("-s, --schema <schema>", "path to a JSON schema definition")
  .option("--write")
  .option("--dry-run")
  .option("--backup")
  .option("-o, --output <output>", "text")
  .option("--exclude-dir <dirs...>")
  .action(
    (options: {
      root: string;
      schema?: string;
      write?: boolean;
      dryRun?: boolean;
      backup?: boolean;
      output?: string;
      excludeDir?: string[];
    }) => {
      const schema = getSchema(options.schema);
      const targets = filesFrom(options.root).filter(
        (target) =>
          !options.excludeDir?.some((dir) => target.file.split("/").includes(dir)) &&
          !target.file.split("/").some((part) => part.startsWith("_")),
      );
      const results = targets.map((target) => {
        const changes: string[] = [];
        const data = { ...target.data };
        for (const [key, value] of Object.entries(schema.defaults))
          if (data[key] === undefined) {
            data[key] = value;
            changes.push(`${key}: ${String(value)}`);
          }
        if (options.write && !options.dryRun && changes.length) {
          if (options.backup) writeText(`${target.file}.bak`, readText(target.file));
          writeText(target.file, renderFile(data, target.body));
        }
        return { path: target.file, changed: changes.length > 0, changes };
      });
      if (options.output === "json")
        console.log(
          JSON.stringify(
            {
              files: results,
              summary: {
                processed_files: results.length,
                changed_files: results.filter((result) => result.changed).length,
              },
            },
            null,
            2,
          ),
        );
      else {
        for (const result of results.filter((item) => item.changed))
          console.log(
            `${options.write && !options.dryRun ? "Migrated" : "Would migrate"}: ${result.path}`,
          );
        console.log(
          `Processed: ${results.length}, Changed: ${results.filter((result) => result.changed).length}, Error files: 0`,
        );
      }
    },
  );

const docx = program.command("docx");
docx
  .command("to-md")
  .argument("[paths...]")
  .option("--overwrite")
  .option("--no-media")
  .action((paths: string[], options: { overwrite?: boolean; media?: boolean }) =>
    docxToMd(paths, Boolean(options.overwrite), options.media === false),
  );

const files = program.command("files");
files
  .command("move")
  .argument("<source>")
  .argument("<destination>")
  .option("--dry-run")
  .action((source: string, destination: string, options: { dryRun?: boolean }) =>
    moveFile(source, destination, Boolean(options.dryRun)),
  );
files
  .command("merge-markdown")
  .argument("<output>")
  .argument("<inputFiles...>")
  .option("--toc")
  .option("--with-filenames")
  .action((output: string, inputs: string[], options: { toc?: boolean; withFilenames?: boolean }) =>
    mergeMarkdown(output, inputs, Boolean(options.toc), Boolean(options.withFilenames)),
  );
files
  .command("find-duplicates")
  .argument("<directory>")
  .option("--algorithm <algorithm>", "md5")
  .option("--min-size <bytes>", "0")
  .option("--extensions <extensions...>")
  .option("--show-hashes")
  .action(
    (
      directory: string,
      options: {
        algorithm: "md5" | "sha1" | "sha256";
        minSize: string;
        extensions?: string[];
        showHashes?: boolean;
      },
    ) =>
      findDuplicates(
        directory,
        options.algorithm,
        Number(options.minSize),
        options.extensions ?? [],
        Boolean(options.showHashes),
      ),
  );
files
  .command("bulk-rename")
  .argument("<directory>")
  .requiredOption("--pattern <pattern>")
  .requiredOption("--replacement <replacement>")
  .option("--apply")
  .action(
    (directory: string, options: { pattern: string; replacement: string; apply?: boolean }) => {
      const re = new RegExp(options.pattern);
      for (const entry of readdirSync(directory)) {
        const next = entry.replace(re, options.replacement);
        if (next === entry) continue;
        console.log(`${entry} -> ${next}`);
        if (options.apply) renameSync(join(directory, entry), join(directory, next));
      }
    },
  );
files
  .command("convert")
  .argument("<input>")
  .argument("<output>")
  .option("--csv-to-json")
  .option("--no-flatten")
  .option("--separator <separator>", ".")
  .action(
    (
      input: string,
      output: string,
      options: { csvToJson?: boolean; flatten?: boolean; separator: string },
    ) =>
      convert(
        input,
        output,
        Boolean(options.csvToJson),
        options.flatten !== false,
        options.separator,
      ),
  );
files
  .command("xlsx-to-csv")
  .option("-f, --file <file>")
  .option("-d, --directory <directory>")
  .option("-a, --all-sheets")
  .action(async (options: { file?: string; directory?: string; allSheets?: boolean }) => {
    if (!options.file && !options.directory) throw new Error("--file or --directory is required");
    await xlsxToCsv(options.file ?? "", options.directory, Boolean(options.allSheets));
  });

program
  .command("analyze")
  .option("-r, --root <root>", ".")
  .option("-o, --output <output>", "text")
  .option("--files")
  .option("--extensions <extensions>")
  .option("--include-hidden")
  .option("--ignore-file <files...>")
  .option("--no-gitignore")
  .action(
    (options: {
      root: string;
      output?: string;
      files?: boolean;
      extensions?: string;
      includeHidden?: boolean;
      ignoreFile?: string[];
      noGitignore?: boolean;
    }) => analyze(options.root, options),
  );

const completions = program.command("completions");
completions
  .command("generate")
  .argument("<shell>")
  .action((shell: string) => generateCompletions(shell));
completions
  .command("install")
  .argument("<shell>")
  .option("--dry-run")
  .option("--force")
  .action((shell: string, options: { dryRun?: boolean; force?: boolean }) =>
    installCompletions(shell, options),
  );

try {
  await program.parseAsync(process.argv);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
