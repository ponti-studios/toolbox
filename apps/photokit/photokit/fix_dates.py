#!/usr/bin/env python3
"""
Restore date metadata from filenames for photos in iphotos/review/
"""

import os
import re
import piexif
from pathlib import Path
from datetime import datetime, timedelta
from PIL import Image
from collections import defaultdict

# Pattern 1: iphotos-2020-03-12-11-32-03.png (date-time)
PATTERN_DATETIME = re.compile(
    r'iphotos-(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})\.'
)

# Pattern 2: iphotos-2021-04-11-hollywood...png (date only with text)
PATTERN_DATE_TEXT = re.compile(
    r'iphotos-(\d{4})-(\d{2})-(\d{2})-[^-]+'
)

# Pattern 3: iphotos-2022-07-23-0931.png (date-time compact)
PATTERN_DATE_COMPACT = re.compile(
    r'iphotos-(\d{4})-(\d{2})-(\d{2})-(\d{4})\.'
)

# Pattern 4: iphotos-2022-03-21-20220321-5247...png (double date with uuid)
PATTERN_DOUBLE_DATE = re.compile(
    r'iphotos-(\d{4})-(\d{2})-(\d{2})-(\d{8})-'
)

# Pattern 5: iphotos-2023-019-at-11-05-42.png (day-of-year style: 019 = Jan 9)
PATTERN_DAY_OF_YEAR = re.compile(
    r'iphotos-(\d{4})-(\d{3})-at-(\d{2})-(\d{2})-(\d{2})\.'
)

# Pattern 6: iphotos-2023-022-0843.png (day-of-year with compact time)
PATTERN_DAY_COMPACT = re.compile(
    r'iphotos-(\d{4})-(\d{3})-(\d{4})\.'
)

# Pattern 7: iphotos-2024-06-21.png (date only, no time)
PATTERN_DATE_ONLY = re.compile(
    r'iphotos-(\d{4})-(\d{2})-(\d{2})\.([a-z]+)'
)

# Pattern 8: iphotos-2025-toyota-...png (text after year, no clear date)
PATTERN_YEAR_TEXT = re.compile(
    r'iphotos-(\d{4})-[a-z]'
)

SUPPORTED_EXTENSIONS = {'.jpg', '.jpeg', '.png'}


def day_of_year_to_month_day(year: int, day_of_year: int) -> tuple:
    """Convert day-of-year (1-366) to month and day."""
    from datetime import date
    d = date(year, 1, 1) + timedelta(days=day_of_year - 1)
    return d.month, d.day


def parse_date_from_filename(filename: str) -> tuple | None:
    """Extract date from various filename formats."""
    # Pattern 1: iphotos-2020-03-12-11-32-03.png (standard datetime)
    match = PATTERN_DATETIME.search(filename)
    if match:
        return match.group(1), match.group(2), match.group(3), match.group(4), match.group(5), match.group(6)
    
    # Pattern 5: iphotos-2023-019-at-11-05-42.png (day-of-year with time)
    match = PATTERN_DAY_OF_YEAR.search(filename)
    if match:
        year = int(match.group(1))
        doy = int(match.group(2))
        month, day = day_of_year_to_month_day(year, doy)
        return (str(year), f"{month:02d}", f"{day:02d}", match.group(3), match.group(4), match.group(5))
    
    # Pattern 6: iphotos-2023-022-0843.png (day-of-year with compact time)
    match = PATTERN_DAY_COMPACT.search(filename)
    if match:
        year = int(match.group(1))
        doy = int(match.group(2))
        month, day = day_of_year_to_month_day(year, doy)
        time_str = match.group(3)
        hour, minute = time_str[:2], time_str[2:]
        return (str(year), f"{month:02d}", f"{day:02d}", hour, minute, "00")
    
    # Pattern 3: iphotos-2022-07-23-0931.png (compact time)
    match = PATTERN_DATE_COMPACT.search(filename)
    if match:
        year, month, day = match.group(1), match.group(2), match.group(3)
        time_str = match.group(4)
        hour, minute = time_str[:2], time_str[2:]
        return (year, month, day, hour, minute, "00")
    
    # Pattern 4: iphotos-2022-03-21-20220321-5247...png (double date)
    match = PATTERN_DOUBLE_DATE.search(filename)
    if match:
        year, month, day = match.group(1), match.group(2), match.group(3)
        return (year, month, day, "12", "00", "00")
    
    # Pattern 7: iphotos-2024-06-21.png (date only, no time)
    match = PATTERN_DATE_ONLY.search(filename)
    if match:
        year, month, day = match.group(1), match.group(2), match.group(3)
        return (year, month, day, "12", "00", "00")
    
    # Pattern 2: iphotos-2021-04-11-hollywood...png (date with text)
    match = PATTERN_DATE_TEXT.search(filename)
    if match:
        year, month, day = match.group(1), match.group(2), match.group(3)
        return (year, month, day, "12", "00", "00")
    
    # Pattern 8: iphotos-2025-toyota-...png (text after year only - unparseable)
    # Return None - these need manual handling
    return None


def create_exif_date(year: str, month: str, day: str, hour: str, minute: str, second: str) -> dict:
    """Create EXIF date dict for piexif."""
    date_str = f"{year}:{month}:{day} {hour}:{minute}:{second}"
    return {
        '0th': {
            piexif.ImageIFD.DateTime: date_str,
        },
        'Exif': {
            piexif.ExifIFD.DateTimeOriginal: date_str,
            piexif.ExifIFD.DateTimeDigitized: date_str,
        },
    }


def add_date_to_image(filepath: Path, year: str, month: str, day: str, hour: str, minute: str, second: str) -> bool:
    """Add EXIF date metadata to an image file."""
    try:
        # Load image and preserve quality
        img = Image.open(filepath)
        
        # Convert to RGB if necessary (for PNG with transparency)
        if img.mode in ('RGBA', 'P'):
            # For PNGs, we need to handle differently
            pass
        
        ext = filepath.suffix.lower()
        
        if ext == '.png':
            # PNG doesn't support EXIF directly, save as JPEG
            # First save image data
            img = img.convert('RGB')
            jpg_path = filepath.with_suffix('.jpg')
            img.save(jpg_path, 'JPEG', quality=95, exif=piexif.dump(create_exif_date(year, month, day, hour, minute, second)))
            
            # Remove original PNG
            filepath.unlink()
            print(f"  ✅ Converted to JPEG: {jpg_path.name}")
            return True
        else:
            # JPEG - add EXIF directly
            exif_dict = create_exif_date(year, month, day, hour, minute, second)
            exif_bytes = piexif.dump(exif_dict)
            img.save(str(filepath), 'JPEG', quality=95, exif=exif_bytes)
            print(f"  ✅ Updated EXIF: {filepath.name}")
            return True
            
    except Exception as e:
        print(f"  ❌ Error: {filepath.name}: {e}")
        return False


def main():
    review_dir = Path("/Volumes/ponti.drive/Photos/iphotos/review")
    
    if not review_dir.exists():
        print(f"Error: {review_dir} does not exist")
        return
    
    files = [f for f in review_dir.iterdir() if f.is_file() and f.suffix.lower() in SUPPORTED_EXTENSIONS]
    
    print(f"Found {len(files)} images in {review_dir}\n")
    
    fixed = 0
    skipped = 0
    failed = 0
    
    for filepath in sorted(files):
        date_parts = parse_date_from_filename(filepath.name)
        
        if date_parts:
            year, month, day, hour, minute, second = date_parts
            print(f"📷 {filepath.name}")
            print(f"   Extracted date: {year}-{month}-{day} {hour}:{minute}:{second}")
            
            if add_date_to_image(filepath, year, month, day, hour, minute, second):
                fixed += 1
            else:
                failed += 1
        else:
            print(f"⚠️  Could not parse date from: {filepath.name}")
            skipped += 1
    
    print(f"\n{'='*50}")
    print(f"Fixed: {fixed}")
    print(f"Skipped: {skipped}")
    print(f"Failed: {failed}")


if __name__ == '__main__':
    main()
