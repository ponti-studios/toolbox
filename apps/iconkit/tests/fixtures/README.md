# IconKit test fixtures

These small, committed assets provide deterministic inputs for binary-level tests and manual
inspection. They are intentionally generated at modest dimensions so the repository stays light.

| Fixture                    | Purpose                                                                |
| -------------------------- | ---------------------------------------------------------------------- |
| `rgb-landscape.png`        | 1600×900 landscape RGB source for resize, crop, and optimization       |
| `rgb-portrait.png`         | 900×1600 portrait source for crop and conversion                       |
| `transparent-rgba.png`     | 512×512 transparent source for web icon generation                     |
| `metadata-exif.jpg`        | 640×480 JPEG containing Artist, Description, and Copyright EXIF fields |
| `conversion-source.tiff`   | TIFF source for format conversion                                      |
| `conversion-source.gif`    | GIF source for format conversion                                       |
| `asset with spaces.v1.png` | 480×320 source exercising spaces and multiple dots in filenames        |
| `malformed.png`            | Non-image input for graceful failure behavior                          |

## Manual sweep

From `apps/iconkit`, build the test binary and run:

```bash
bun run build:test
mkdir -p /tmp/iconkit-manual-output
cp tests/fixtures/metadata-exif.jpg /tmp/iconkit-manual-output/metadata-exif.jpg
.test-bin/iconkit info tests/fixtures/*.png tests/fixtures/*.jpg
.test-bin/iconkit resize -s 320x180 -o /tmp/iconkit-manual-output tests/fixtures/rgb-landscape.png
.test-bin/iconkit crop -s 1:1 -g north -o /tmp/iconkit-manual-output tests/fixtures/rgb-landscape.png
.test-bin/iconkit convert -f jpg -o /tmp/iconkit-manual-output tests/fixtures/rgb-portrait.png
.test-bin/iconkit optimize -f webp -o /tmp/iconkit-manual-output tests/fixtures/rgb-landscape.png
.test-bin/iconkit strip /tmp/iconkit-manual-output/metadata-exif.jpg
.test-bin/iconkit web tests/fixtures/transparent-rgba.png -o /tmp/iconkit-manual-output/web
```

Inspect `/tmp/iconkit-manual-output` visually and use `sips` or `exiftool` to verify dimensions and
metadata.
