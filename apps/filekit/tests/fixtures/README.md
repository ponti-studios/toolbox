# filekit test fixtures

| File | Purpose |
|------|---------|
| `article-valid.md` | Fully valid frontmatter — walk, aggregate, validate |
| `article-draft.md` | Valid draft with subset of fields |
| `article-invalid.md` | Missing fields + bad values — validate errors |
| `article-same-slug.md` | Duplicate slug with `article-valid.md` — slug detect |
| `no-frontmatter.md` | Plain markdown, no YAML — should be skipped |
| `nested/sub-article.md` | Deep file for recursive walk testing |
| `sample.docx` | DOCX file for `docx to-md` |
| `sample.xlsx` | XLSX file for `files xlsx-to-csv` |
| `calendar1.ics` | ICS with all-day events for `cal import` |
| `calendar2.ics` | Second ICS file for multi-file import |

## Usage

```bash
# from apps/filekit
cargo run -p filekit -- frontmatter walk -r tests/fixtures
cargo run -p filekit -- frontmatter validate -r tests/fixtures
cargo run -p filekit -- frontmatter slug -r tests/fixtures --scope project
cargo run -p filekit -- frontmatter aggregate -r tests/fixtures
```

Note: `cal import` and `docx to-md` require `pandoc` to be installed.
