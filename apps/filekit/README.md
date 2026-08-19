# Filekit

Node 24 CLI utilities for files and frontmatter.

## Install

```bash
npm install --global @ponti-studios/filekit
```

Or run without a global install:

```bash
npx @ponti-studios/filekit frontmatter stage --root input --output output --where status=published --name-field slug
```

## Commands

```text
filekit frontmatter walk|aggregate|validate|migrate|stage|publish|slug|update|set|remove
filekit files move|merge-markdown|find-duplicates|bulk-rename|convert|xlsx-to-csv
filekit docx to-md
filekit files merge-markdown|find-duplicates|bulk-rename|convert|xlsx-to-csv
filekit analyze
filekit completions generate|install
```

Staging is generic: use repeated `--where field=value` filters and optionally
`--name-field field` to derive output filenames from frontmatter. Staging does
not modify source files. `frontmatter publish` remains a deprecated alias for
compatibility. Editorial policy and content workflows belong in the calling
application, not Filekit.

## Development

```bash
npm ci
npm run typecheck
npm test
npm run build
```

Filekit requires Node 24 or newer. DOCX conversion additionally requires
Pandoc.
