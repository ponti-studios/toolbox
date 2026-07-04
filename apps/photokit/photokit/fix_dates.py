#!/usr/bin/env python3
"""
Restore EXIF date metadata from filenames in a photo directory.

Can be run stand-alone:

    python -m photokit.fix_dates /path/to/photos --dry-run

Or invoked as ``photokit fix-dates`` via the Click CLI.
"""

import argparse
import sys
from pathlib import Path
from typing import Optional

import piexif
from PIL import Image

from .date_patterns import (
    auto_detect,
    match_from_pattern,
    DATE_PATTERN_HELP,
)

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".tiff", ".tif", ".heic", ".heif", ".webp"}


def find_images(directory: Path, extensions: set, recursive: bool) -> list[Path]:
    """Find image files matching *extensions* under *directory*."""
    if recursive:
        files = [p for ext in extensions for p in directory.rglob(f"*{ext}")]
    else:
        files = [p for ext in extensions for p in directory.glob(f"*{ext}")]
    # Filter out symlinks, macOS extended attributes, etc.
    return sorted(
        p for p in files
        if p.is_file() and not p.is_symlink() and not p.name.startswith("._")
    )


def create_exif_dict(
    year: int, month: int, day: int,
    hour: int, minute: int, second: int,
) -> dict:
    """Build an EXIF dict with date/time tags."""
    date_str = f"{year:04d}:{month:02d}:{day:02d} {hour:02d}:{minute:02d}:{second:02d}"
    return {
        "0th": {piexif.ImageIFD.DateTime: date_str},
        "Exif": {
            piexif.ExifIFD.DateTimeOriginal: date_str,
            piexif.ExifIFD.DateTimeDigitized: date_str,
        },
    }


def write_exif_date(filepath: Path, date_parts: dict) -> bool:
    """Write EXIF date metadata into an image file in-place.

    Uses ``piexif.insert`` which works for both JPEG and PNG (inserts an
    eXIf chunk into PNGs — no format conversion needed).
    """
    try:
        exif_dict = create_exif_dict(**date_parts)
        exif_bytes = piexif.dump(exif_dict)
        # piexif.insert writes directly into the binary — works for
        # JPEG and PNG without re-encoding.
        piexif.insert(exif_bytes, str(filepath))
        return True
    except Exception as exc:
        print(f"  ❌ Error writing EXIF to {filepath.name}: {exc}", file=sys.stderr)
        return False


def fix_dates(
    directory: Path,
    *,
    pattern: Optional[str] = None,
    recursive: bool = False,
    dry_run: bool = False,
    extensions: Optional[set] = None,
) -> int:
    """Main logic for fix-dates.

    Returns exit code (0 = success).
    """
    if extensions is None:
        extensions = IMAGE_EXTENSIONS

    images = find_images(directory, extensions, recursive)
    if not images:
        print(f"No images found in {directory}")
        return 0

    print(f"\n📷  Found {len(images)} image(s) in {directory}\n")

    fixed = 0
    skipped = 0
    errors = 0

    for filepath in images:
        if pattern:
            date_parts = match_from_pattern(pattern, filepath.name)
        else:
            date_parts = auto_detect(filepath.name)

        if date_parts is None:
            print(f"  ⚠️  Could not parse date from: {filepath.name}")
            skipped += 1
            continue

        ds = date_parts
        print(
            f"  📷 {filepath.name}\n"
            f"     Extracted date: {ds['year']:04d}-{ds['month']:02d}-{ds['day']:02d}"
            f" {ds['hour']:02d}:{ds['minute']:02d}:{ds['second']:02d}"
        )

        if dry_run:
            print("     (dry run — skipped)")
            fixed += 1  # count as "would fix"
            continue

        if write_exif_date(filepath, date_parts):
            fixed += 1
        else:
            errors += 1

    print(f"\n{'=' * 50}")
    print(f"  Fixed:    {fixed}")
    print(f"  Skipped:  {skipped}")
    print(f"  Errors:   {errors}")
    return 1 if errors else 0


# ---------------------------------------------------------------------------
# Stand-alone entry point
# ---------------------------------------------------------------------------

def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Restore EXIF date metadata from filenames in a photo directory.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=DATE_PATTERN_HELP,
    )
    parser.add_argument("directory", type=Path, help="Directory containing photos")
    parser.add_argument(
        "-p", "--pattern",
        help="Custom regex with named groups year, month, day (or year, doy)",
    )
    parser.add_argument(
        "-r", "--recursive", action="store_true",
        help="Recurse into subdirectories",
    )
    parser.add_argument(
        "-n", "--dry-run", action="store_true",
        help="Preview only — don't write EXIF data",
    )
    parser.add_argument(
        "--extensions",
        default=",".join(sorted(IMAGE_EXTENSIONS)),
        help=f"Comma-separated extensions (default: {','.join(sorted(IMAGE_EXTENSIONS))})",
    )

    args = parser.parse_args(argv)
    extensions = {f".{e.strip().lstrip('.')}" for e in args.extensions.split(",")}

    return fix_dates(
        args.directory,
        pattern=args.pattern,
        recursive=args.recursive,
        dry_run=args.dry_run,
        extensions=extensions,
    )


if __name__ == "__main__":
    sys.exit(main())
