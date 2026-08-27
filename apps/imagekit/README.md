# imagekit

Image asset toolkit — resize, optimize, analyze EXIF, fix dates, rename, and generate web icons from the command line.

A TypeScript/Bun CLI, compiled to a standalone binary. Formerly `iconkit` and `photokit`; both names remain as compatibility aliases.

## Install

### From npm

```bash
npm install -g @ponti-studios/imagekit
imagekit --help
# compatibility aliases:
iconkit --help
photokit --help
```

### From source or a checked-out repository

```bash
git clone https://github.com/ponti-studios/toolbox.git
cd toolbox/apps/imagekit
bun install
bun run build
./imagekit install
```

ImageKit currently targets macOS because it depends on the built-in `sips` command. The optional encoders and ImageMagick features require Homebrew dependencies:

```bash
brew install imagemagick webp libavif exiftool
```

`exiftool` is required for `analyze`, `fix-dates`, `rename`, and `strip` (metadata) operations. `cwebp` is required for WebP optimization, `avifenc` for AVIF optimization, and ImageMagick for cropping with gravity and web-asset generation.

The `install` command is intended for the compiled standalone binary. When running the Node-targeted package entrypoint, it creates small wrapper scripts for `imagekit`, `iconkit`, and `photokit` in the selected bin directory.

---

## Commands

### `imagekit analyze` — Inspect EXIF metadata

```bash
imagekit analyze ./photos
imagekit analyze ./photos --json
imagekit analyze ./photos --csv
imagekit analyze ./photos --geo
imagekit analyze ./photos --stats
imagekit analyze ./photos --recursive --extensions jpg,png
```

**Options:**

| Option | Description | Default |
| --- | --- | --- |
| `--json` | Output as JSON | `false` |
| `--csv` | Output as CSV | `false` |
| `--geo` | Show only photos with GPS data | `false` |
| `--stats` | Show summary statistics | `false` |
| `-v, --verbose` | Show all EXIF details | `false` |
| `-r, --recursive` | Recurse into subdirectories | `false` |
| `--extensions <list>` | Comma-separated extensions | `jpg,jpeg,png,tiff,tif,heic,heif,webp,raw,cr2,nef,arw,dng` |
| `--no-progress` | Disable progress indicator | `false` |

Requires `exiftool`.

### `imagekit fix-dates` — Restore EXIF dates from filenames

```bash
imagekit fix-dates ./photos --dry-run
imagekit fix-dates ./photos --pattern '(?<year>\d{4})_(?<month>\d{2})_(?<day>\d{2})'
imagekit fix-dates ./photos --recursive
```

**Options:**

| Option | Description | Default |
| --- | --- | --- |
| `-p, --pattern <regex>` | Custom regex with named groups `year`, `month`, `day` (or `year`, `doy`) and optionally `hour`, `minute`, `second` | auto-detect built-ins |
| `-r, --recursive` | Recurse into subdirectories | `false` |
| `-n, --dry-run` | Preview without writing | `false` |
| `--extensions <list>` | Comma-separated extensions | `jpg,jpeg,png,tiff,tif,heic,heif,webp` |

Auto-detect tries these built-in patterns (in order): `YYYY-MM-DD-HH-MM-SS`, `YYYY-MM-DD_HH-MM-SS`, `YYYYMMDD_HHMMSS`, `YYYY-MM-DD-HHMM`, `YYYY-MM-DD`, `YYYY-DDD-at-HH-MM-SS`, `YYYY-DDD-HHMM`, `YYYY-DDD`.

Requires `exiftool`.

### `imagekit rename` — Rename photos by capture date

```bash
imagekit rename ./photos --dry-run
imagekit rename ./photos -t '{year}-{month:02d}-{day:02d}_{hour:02d}-{minute:02d}-{second:02d}{ext}'
imagekit rename ./photos --collision skip
```

**Options:**

| Option | Description | Default |
| --- | --- | --- |
| `-p, --pattern <regex>` | Custom regex (same as fix-dates) | auto-detect |
| `-t, --template <tmpl>` | Output filename template with `{year}`, `{month}`, `{day}`, `{hour}`, `{minute}`, `{second}`, `{seq}`, `{ext}` | `{year}-{month:02d}-{day:02d}_{hour:02d}-{minute:02d}-{second:02d}` |
| `--collision <mode>` | `increment` \| `overwrite` \| `skip` | `increment` |
| `-r, --recursive` | Recurse into subdirectories | `false` |
| `-n, --dry-run` | Preview without renaming | `false` |
| `--extensions <list>` | Comma-separated extensions | `jpg,jpeg,png,tiff,tif,heic,heif,webp` |

### `imagekit optimize` — Resize & convert for the web

```bash
imagekit optimize -s 500x500 logo.*.png
imagekit optimize -s 1200x630 -q 80 -f both -o ./web ~/assets/*.png
```

**Options:**

| Option                   | Description                   | Default           |
| ------------------------ | ----------------------------- | ----------------- |
| `-s, --size <WxH>`       | Target dimensions             | `500x500`         |
| `-q, --quality <N>`      | WebP/AVIF quality             | `85`              |
| `-o, --output-dir <DIR>` | Output directory              | same dir as input |
| `-k, --keep-png`         | Keep resized PNG              | `false`           |
| `-f, --format <fmt>`     | `webp`, `avif`, `both`, `png` | `webp`            |
| `-d, --dry-run`          | Preview without writing       | `false`           |

---

### `imagekit web` — Generate favicon, app icons & social cards

```bash
imagekit web logo.png
imagekit web logo.png -o ./static/icons
```

Generates favicon (16–96 + .ico), Apple touch (57–180), Android (36–192), PWA (192–512), MS Tile (70–310), OG image & Twitter card (1200×630).

Requires `magick` (`brew install imagemagick`).

---

### `imagekit resize` — Resize images

```bash
imagekit resize -s 500x500 logo.png -o ./out
```

### `imagekit crop` — Crop with gravity

```bash
imagekit crop -s 1200x630 -g center logo.png
```

### `imagekit convert` — Convert formats

```bash
imagekit convert -f jpg logo.png
```

### `imagekit strip` — Strip metadata

```bash
imagekit strip logo.jpg
```

Requires `exiftool` or ImageMagick.

### `imagekit info` — Show image dimensions & sizes

```bash
imagekit info *.png
```

---

### `imagekit install` — Symlink into PATH

Auto-detects `~/.local/bin`, `/usr/local/bin`, or `~/bin`. Creates `imagekit`, `iconkit`, and `photokit` aliases.

### Compatibility

- `iconkit` and `photokit` remain as executable aliases for `imagekit`.
- `@ponti-studios/iconkit` is a deprecated compatibility package that depends on `@ponti-studios/imagekit`.
