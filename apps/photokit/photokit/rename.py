#!/usr/bin/env python3
"""
Rename iphotos files to normalized format: YYYY-MM-DD_HH-MM-SS_###.ext
"""

import re
from pathlib import Path
from collections import defaultdict
from photokit.fix_dates import parse_date_from_filename

SUPPORTED_EXTENSIONS = {'.jpg', '.jpeg', '.png'}


def extract_date_parts(filename: str) -> tuple | None:
    """Extract date parts from iphotos filename."""
    # Check if already in new format: YYYY-MM-DD_HH-MM-SS.ext or YYYY-MM-DD_HH-MM-SS_###.ext
    match = re.match(r'(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})(?:_\d+)?\.', filename)
    if match:
        return (match.group(1), match.group(2), match.group(3), 
                match.group(4), match.group(5), match.group(6))
    
    # Try our existing parser (handles iphotos-YYYY-MM-DD... format)
    result = parse_date_from_filename(filename)
    if result:
        return result
    
    # Fallback: try to find any YYYY-MM-DD pattern
    match = re.search(r'(\d{4})-(\d{2})-(\d{2})', filename)
    if match:
        return (match.group(1), match.group(2), match.group(3), "12", "00", "00")
    
    return None


def main():
    photos_dir = Path("/Volumes/ponti.drive/Photos/iphotos")
    
    # Get all image files (only top-level, not in subdirectories)
    files = [f for f in photos_dir.iterdir() 
             if f.is_file() and f.suffix.lower() in SUPPORTED_EXTENSIONS 
             and f.parent == photos_dir]
    
    print(f"Found {len(files)} files to rename\n")
    
    # Count occurrences of each timestamp
    timestamp_counts = defaultdict(int)
    for f in files:
        parts = extract_date_parts(f.name)
        if parts:
            year, month, day, hour, minute, second = parts
            key = f"{year}-{month}-{day}_{hour}-{minute}-{second}"
            timestamp_counts[key] += 1
    
    # Rename files
    timestamp_seq = defaultdict(int)
    renamed = 0
    skipped = 0
    unchanged = 0
    errors = []
    
    for f in sorted(files):
        parts = extract_date_parts(f.name)
        if not parts:
            print(f"⚠️  Could not parse: {f.name}")
            skipped += 1
            continue
        
        year, month, day, hour, minute, second = parts
        base_name = f"{year}-{month}-{day}_{hour}-{minute}-{second}"
        timestamp_seq[base_name] += 1
        
        # Build new filename
        ext = f.suffix.lower()
        if timestamp_counts[base_name] > 1:
            new_name = f"{base_name}_{timestamp_seq[base_name]:03d}{ext}"
        else:
            new_name = f"{base_name}{ext}"
        
        new_path = photos_dir / new_name
        
        # Skip if already named correctly
        if new_path == f:
            unchanged += 1
            continue
        
        # Handle collisions
        if new_path.exists():
            new_name = f"{base_name}_{timestamp_seq[base_name]:03d}_{hash(f.name) % 10000:04d}{ext}"
            new_path = photos_dir / new_name
        
        try:
            f.rename(new_path)
            renamed += 1
            if renamed <= 10:
                print(f"  ✅ {f.name[:50]}...")
                print(f"     -> {new_name[:50]}")
        except Exception as e:
            errors.append((f.name, str(e)))
    
    print(f"\n{'='*50}")
    print(f"Renamed: {renamed}")
    print(f"Unchanged: {unchanged}")
    print(f"Skipped: {skipped}")
    if errors:
        print(f"Errors: {len(errors)}")


if __name__ == '__main__':
    main()
