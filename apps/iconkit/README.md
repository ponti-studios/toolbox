# iconkit

Image asset toolkit — resize, optimize, and generate web icons from the command line.

A TypeScript rewrite of the original bash script, compiled to a standalone binary with [Bun](https://bun.sh).

## Install

### From source or a checked-out repository

```bash
git clone https://github.com/ponti-studios/toolbox.git
cd toolbox/apps/iconkit
bun install
bun run build
./iconkit install
```

IconKit currently targets macOS because it depends on the built-in `sips` command. The optional
encoders and ImageMagick features require Homebrew dependencies:

```bash
brew install imagemagick webp libavif exiftool
```

`cwebp` is required for WebP optimization, `avifenc` for AVIF optimization, ImageMagick for
cropping with gravity and web-asset generation, and either ImageMagick or `exiftool` for metadata
stripping.

The `install` command is intended for the compiled standalone binary. When running the Node-targeted
package entrypoint, it creates a small wrapper script in the selected bin directory.

---

## Commands

### `iconkit optimize` — Resize & convert for the web

```bash
iconkit optimize -s 500x500 logo.*.png
iconkit optimize -s 1200x630 -q 80 -f both -o ./web ~/assets/*.png
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

### `iconkit web` — Generate favicon, app icons & social cards

```bash
iconkit web logo.png
iconkit web logo.png -o ./static/icons
```

Generates favicon (16–96 + .ico), Apple touch (57–180), Android (36–192), PWA (192–512), MS Tile (70–310), OG image & Twitter card (1200×630).

Requires `magick` (`brew install imagemagick`).

---

### `iconkit info` — Show image dimensions & sizes

```bash
iconkit info *.png
```

---

### `iconkit install` — Symlink into PATH

Auto-detects `~/.local/bin`, `/usr/local/bin`, or `~/bin`.
