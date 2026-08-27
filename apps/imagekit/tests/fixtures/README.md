# ImageKit test fixtures

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

From `apps/imagekit`, build the test binary and run:

```bash
bun run build:test
mkdir -p /tmp/imagekit-manual-output
cp tests/fixtures/metadata-exif.jpg /tmp/imagekit-manual-output/metadata-exif.jpg
.test-bin/imagekit info tests/fixtures/*.png tests/fixtures/*.jpg
.test-bin/imagekit resize -s 320x180 -o /tmp/imagekit-manual-output tests/fixtures/rgb-landscape.png
.test-bin/imagekit crop -s 1:1 -g north -o /tmp/imagekit-manual-output tests/fixtures/rgb-landscape.png
.test-bin/imagekit convert -f jpg -o /tmp/imagekit-manual-output tests/fixtures/rgb-portrait.png
.test-bin/imagekit optimize -f webp -o /tmp/imagekit-manual-output tests/fixtures/rgb-landscape.png
.test-bin/imagekit strip /tmp/imagekit-manual-output/metadata-exif.jpg
.test-bin/imagekit web tests/fixtures/transparent-rgba.png -o /tmp/imagekit-manual-output/web
# metadata workflows:
.test-bin/imagekit analyze tests/fixtures --json
.test-bin/imagekit fix-dates /tmp/imagekit-manual-output --dry-run
.test-bin/imagekit rename /tmp/imagekit-manual-output --dry-run
```

Inspect `/tmp/imagekit-manual-output` visually and use `sips` or `exiftool` to verify dimensions and
metadata. `iconkit` and `photokit` aliases dispatch to the same binary.
