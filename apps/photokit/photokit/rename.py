#!/usr/bin/env python3
"""
Rename photos to a normalized date-based filename.

Can be run stand-alone:

    python -m photokit.rename /path/to/photos --dry-run

Or invoked as ``photokit rename`` via the Click CLI.
"""

import argparse
import sys
from collections import defaultdict
from pathlib import Path
from typing import Optional

from .date_patterns import (
    auto_detect,
    match_from_pattern,
    DATE_PATTERN_HELP,
)

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".tiff", ".tif", ".heic", ".heif", ".webp"}


DEFAULT_TEMPLATE = "{year}-{month:02d}-{day:02d}_{hour:02d}-{minute:02d}-{second:02d}"


def find_images(directory: Path, extensions: set, recursive: bool) -> list[Path]:
    """Find image files matching *extensions* under *directory*."""
    if recursive:
        files = [p for ext in extensions for p in directory.rglob(f"*{ext}")]
    else:
        files = [p for ext in extensions for p in directory.glob(f"*{ext}")]
    return sorted(
        p for p in files
        if p.is_file() and not p.is_symlink() and not p.name.startswith("._")
    )


def render_template(template: str, parts: dict, seq: Optional[int] = None, ext: str = "") -> str:
    """Render a filename template from date parts.

    Supported placeholders: ``{year}``, ``{month}``, ``{day}``,
    ``{hour}``, ``{minute}``, ``{second}``, ``{seq}``, ``{ext}``.

    All date placeholders support zero-padded format specs
    (e.g. ``{month:02d}``).
    """
    ctx = {k: int(v) if isinstance(v, str) else v for k, v in parts.items()}
    ctx["ext"] = ext
    ctx["seq"] = seq or 0
    return template.format(**ctx)


def rename_photos(
    directory: Path,
    *,
    pattern: Optional[str] = None,
    template: str = DEFAULT_TEMPLATE,
    collision: str = "increment",
    recursive: bool = False,
    dry_run: bool = False,
    extensions: Optional[set] = None,
) -> int:
    """Main logic for rename.

    Returns exit code (0 = success).
    """
    if extensions is None:
        extensions = IMAGE_EXTENSIONS

    images = find_images(directory, extensions, recursive)
    if not images:
        print(f"No images found in {directory}")
        return 0

    print(f"\n📷  Found {len(images)} image(s) in {directory}\n")

    # Pre-scan: count how many files share each timestamp key
    # so we know whether to include a sequence number.
    timestamp_counts: dict[str, int] = defaultdict(int)
    date_parts_by_path: dict[Path, Optional[dict]] = {}

    for filepath in images:
        if pattern:
            parts = match_from_pattern(pattern, filepath.name)
        else:
            parts = auto_detect(filepath.name)

        date_parts_by_path[filepath] = parts
        if parts:
            key = render_template(template, parts, ext=filepath.suffix.lower())
            timestamp_counts[key] += 1

    renamed = 0
    unchanged = 0
    skipped = 0
    errors = 0
    seq_counter: dict[str, int] = defaultdict(int)

    for filepath in images:
        parts = date_parts_by_path[filepath]
        if parts is None:
            print(f"  ⚠️  Could not parse date from: {filepath.name}")
            skipped += 1
            continue

        ext = filepath.suffix.lower()
        base_key = render_template(template, parts, ext=ext)
        total_for_key = timestamp_counts[base_key]
        seq_counter[base_key] += 1
        seq = seq_counter[base_key]

        if total_for_key > 1:
            new_name = render_template(template, parts, seq=seq, ext=ext)
        else:
            new_name = render_template(template, parts, ext=ext)

        new_path = directory / new_name

        if new_path == filepath:
            # Already correctly named
            unchanged += 1
            continue

        # Handle collisions
        if new_path.exists() and new_path != filepath:
            if collision == "skip":
                print(f"  ⚠️  Collision — skipping: {filepath.name}")
                skipped += 1
                continue
            elif collision == "overwrite":
                pass  # will overwrite below
            else:  # increment
                # Append a hash suffix to disambiguate
                safe_base = new_path.stem
                new_name = f"{safe_base}_{seq:04d}{ext}"
                new_path = directory / new_name
                # If it *still* exists, add a hash of the original name
                while new_path.exists() and new_path != filepath:
                    new_name = f"{safe_base}_{seq:04d}_{hash(filepath.name) % 10000:04d}{ext}"
                    new_path = directory / new_name
                    seq += 1

        if dry_run:
            display_old = filepath.name[:60]
            display_new = new_name[:60]
            print(f"  🔄 {display_old}  →  {display_new}")
            renamed += 1
            continue

        try:
            filepath.rename(new_path)
            print(f"  ✅ {filepath.name[:60]}  →  {new_name[:60]}")
            renamed += 1
        except Exception as exc:
            print(f"  ❌ Error renaming {filepath.name}: {exc}", file=sys.stderr)
            errors += 1

    print(f"\n{'=' * 50}")
    print(f"  Renamed:   {renamed}")
    print(f"  Unchanged: {unchanged}")
    print(f"  Skipped:   {skipped}")
    print(f"  Errors:    {errors}")
    return 1 if errors else 0


# ---------------------------------------------------------------------------
# Stand-alone entry point
# ---------------------------------------------------------------------------

def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Rename photos to a normalized date-based filename.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=DATE_PATTERN_HELP,
    )
    parser.add_argument("directory", type=Path, help="Directory containing photos")
    parser.add_argument(
        "-p", "--pattern",
        help="Custom regex with named groups year, month, day (or year, doy)",
    )
    parser.add_argument(
        "-t", "--template",
        default=DEFAULT_TEMPLATE,
        help=f"Output filename template (default: {DEFAULT_TEMPLATE})",
    )
    parser.add_argument(
        "--collision",
        default="increment",
        choices=["increment", "overwrite", "skip"],
        help="How to handle name collisions (default: increment)",
    )
    parser.add_argument(
        "-r", "--recursive", action="store_true",
        help="Recurse into subdirectories",
    )
    parser.add_argument(
        "-n", "--dry-run", action="store_true",
        help="Preview only — don't rename",
    )
    parser.add_argument(
        "--extensions",
        default=",".join(sorted(IMAGE_EXTENSIONS)),
        help=f"Comma-separated extensions (default: {','.join(sorted(IMAGE_EXTENSIONS))})",
    )

    args = parser.parse_args(argv)
    extensions = {f".{e.strip().lstrip('.')}" for e in args.extensions.split(",")}

    return rename_photos(
        args.directory,
        pattern=args.pattern,
        template=args.template,
        collision=args.collision,
        recursive=args.recursive,
        dry_run=args.dry_run,
        extensions=extensions,
    )


if __name__ == "__main__":
    sys.exit(main())
