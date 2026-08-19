# Filekit

Node 24 CLI utilities for frontmatter, essays, and filesystem workflows.

## Install

```bash
npm install --global @ponti-studios/filekit
```

Or run without a global install:

```bash
npx @ponti-studios/filekit frontmatter publish --root essays --output site/_essays
```

## Commands

```text
filekit frontmatter walk|aggregate|validate|migrate|publish|slug|update|remove
filekit classify essays
filekit docx to-md
filekit files merge-markdown|find-duplicates|bulk-rename|convert|xlsx-to-csv
filekit analyze
filekit completions generate|install
```

The publishing boundary is explicit: only essays with `visibility: public` and
`status: published` are staged by `frontmatter publish`.

## Development

```bash
npm ci
npm run typecheck
npm test
npm run build
```

Filekit requires Node 24 or newer. DOCX conversion additionally requires
Pandoc.
