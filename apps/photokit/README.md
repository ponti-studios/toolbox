# photokit

Photo metadata maintenance CLI. Analyzes EXIF data, restores missing EXIF
dates from filename patterns, and renames photos into a consistent
date-based naming convention.

## Quick start

```bash
cd apps/photokit
python3 -m photokit --help
```

## Commands

- `analyze` — inspect EXIF metadata (text table, JSON, or summary stats)
- `fix-dates` — restore EXIF dates from filename patterns
- `rename` — rename photos by capture date
