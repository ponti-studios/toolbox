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

`update`, `set`, and `remove` are **surgical by default**: they edit only the
matching key's frontmatter block (including multi-line values like `tags:` lists)
and leave every other line byte-identical, so untouched keys keep their exact
formatting and scalar types (dates, quotes, flow vs. block sequences, key order).
Pass `--render` to opt into re-rendering the whole frontmatter block
instead — useful when normalizing formatting is the point, but it will also
normalize date scalars and quoting.

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
