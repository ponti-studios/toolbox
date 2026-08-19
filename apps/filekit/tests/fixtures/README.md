# filekit test fixtures

| File                    | Purpose                                              |
| ----------------------- | ---------------------------------------------------- |
| `article-valid.md`      | Fully valid frontmatter — walk, aggregate, validate  |
| `article-draft.md`      | Valid draft with subset of fields                    |
| `article-invalid.md`    | Missing fields + bad values — validate errors        |
| `article-same-slug.md`  | Duplicate slug with `article-valid.md` — slug detect |
| `no-frontmatter.md`     | Plain markdown, no YAML — should be skipped          |
| `nested/sub-article.md` | Deep file for recursive walk testing                 |
| `sample.docx`           | DOCX file for `docx to-md`                           |
| `sample.xlsx`           | XLSX file for `files xlsx-to-csv`                    |

## Usage

```bash
# from apps/filekit
npm run build
node dist/index.js frontmatter walk -r tests/fixtures
node dist/index.js frontmatter validate -r tests/fixtures
node dist/index.js frontmatter slug -r tests/fixtures --scope project
node dist/index.js frontmatter aggregate -r tests/fixtures
```
