#!/usr/bin/env python3
"""
photokit CLI - Analyze EXIF metadata from photo files.

Usage:
    photokit <directory>           # Analyze all photos in directory
    photokit <directory> --json    # Output as JSON
    photokit <directory> --csv     # Output as CSV
    photokit <directory> --geo     # Show only GPS/location data
    photokit <directory> --stats   # Show summary statistics
    photokit <directory> --verbose # Show all EXIF tags
"""

import os
import sys
import json
import csv
from pathlib import Path
from datetime import datetime
from typing import Optional
import io
import contextlib

import click
import exifread


# Supported image extensions
IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.jpg', '.png', '.tiff', '.tif', '.heic', '.heif', '.webp', '.raw', '.cr2', '.nef', '.arw', '.dng'}


def get_lat_lon(gps_info: dict) -> Optional[tuple]:
    """Extract GPS latitude and longitude from GPS info."""
    def convert_to_degrees(value):
        try:
            d, m, s = value.values
            return float(d.num / d.den) + float(m.num / m.den) / 60 + float(s.num / s.den) / 3600
        except (AttributeError, IndexError, ZeroDivisionError):
            return None

    lat = gps_info.get('GPS GPSLatitude')
    lat_ref = gps_info.get('GPS GPSLatitudeRef')
    lon = gps_info.get('GPS GPSLongitude')
    lon_ref = gps_info.get('GPS GPSLongitudeRef')

    if lat and lon:
        latitude = convert_to_degrees(lat)
        longitude = convert_to_degrees(lon)
        
        if latitude is not None and longitude is not None:
            if str(lat_ref) == 'S':
                latitude = -latitude
            if str(lon_ref) == 'W':
                longitude = -longitude
            return (latitude, longitude)
    
    return None


def extract_exif(filepath: Path) -> dict:
    """Extract EXIF metadata from an image file."""
    result = {
        'filename': filepath.name,
        'filepath': str(filepath),
        'file_size': 0,
        'date_taken': None,
        'camera_make': None,
        'camera_model': None,
        'lens': None,
        'iso': None,
        'aperture': None,
        'shutter_speed': None,
        'focal_length': None,
        'flash': None,
        'latitude': None,
        'longitude': None,
        'location': None,
        'orientation': None,
        'software': None,
        'copyright': None,
        'artist': None,
        'width': None,
        'height': None,
        'error': None,
    }

    try:
        # Get file size safely
        try:
            result['file_size'] = filepath.stat().st_size
        except (OSError, FileNotFoundError):
            pass

        with open(filepath, 'rb') as f:
            # Suppress exifread print warnings (both stdout and stderr)
            suppress_out = io.StringIO()
            with contextlib.redirect_stdout(suppress_out), contextlib.redirect_stderr(suppress_out):
                tags = exifread.process_file(f, details=False, strict=False)

        if not tags:
            # No EXIF data - return basic file info only
            return result

        # Date taken
        for key in ['EXIF DateTimeOriginal', 'Image DateTime', 'GPS GPSDate']:
            if key in tags:
                result['date_taken'] = str(tags[key])
                break

        # Camera info
        if 'Image Make' in tags:
            result['camera_make'] = str(tags['Image Make']).strip()
        if 'Image Model' in tags:
            result['camera_model'] = str(tags['Image Model']).strip()
        if 'EXIF LensModel' in tags:
            result['lens'] = str(tags['EXIF LensModel']).strip()

        # Exposure settings
        if 'EXIF ISOSpeedRatings' in tags:
            result['iso'] = f"ISO {tags['EXIF ISOSpeedRatings']}"
        if 'EXIF FNumber' in tags:
            result['aperture'] = f"f/{tags['EXIF FNumber']}"
        if 'EXIF ExposureTime' in tags:
            result['shutter_speed'] = f"{tags['EXIF ExposureTime']}s"
        if 'EXIF FocalLength' in tags:
            result['focal_length'] = f"{tags['EXIF FocalLength']}mm"
        if 'EXIF Flash' in tags:
            result['flash'] = str(tags['EXIF Flash'])

        # GPS
        gps_keys = {k: v for k, v in tags.items() if k.startswith('GPS')}
        if gps_keys:
            coords = get_lat_lon(gps_keys)
            if coords:
                result['latitude'] = coords[0]
                result['longitude'] = coords[1]

        # Other metadata
        if 'Image Orientation' in tags:
            result['orientation'] = str(tags['Image Orientation'])
        if 'Image Software' in tags:
            result['software'] = str(tags['Image Software']).strip()
        if 'Image Copyright' in tags:
            result['copyright'] = str(tags['Image Copyright'])
        if 'Image Artist' in tags:
            result['artist'] = str(tags['Image Artist'])
        if 'EXIF ExifImageWidth' in tags:
            result['width'] = str(tags['EXIF ExifImageWidth'])
        if 'EXIF ExifImageLength' in tags:
            result['height'] = str(tags['EXIF ExifImageLength'])

    except Exception as e:
        result['error'] = str(e)

    return result


def find_images(directory: Path) -> list:
    """Find all image files in a directory recursively."""
    images = []
    for ext in IMAGE_EXTENSIONS:
        images.extend(directory.rglob(f"*{ext}"))
        images.extend(directory.rglob(f"*{ext.upper()}"))
    # Filter out macOS extended attribute files (._ prefix)
    images = [f for f in images if not f.name.startswith('._')]
    # Filter out symlinks and non-existent files
    images = [f for f in images if f.is_file() and not f.is_symlink()]
    return sorted(set(images))


def format_size(size_bytes: int) -> str:
    """Format file size in human-readable format."""
    for unit in ['B', 'KB', 'MB', 'GB']:
        if size_bytes < 1024:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024
    return f"{size_bytes:.1f} TB"


def print_photo_summary(photo: dict, verbose: bool = False) -> None:
    """Print a single photo's metadata in a formatted way."""
    click.echo(f"\n📷  {click.style(photo['filename'], bold=True)}")
    click.echo(f"    Path: {photo['filepath']}")
    click.echo(f"    Size: {format_size(photo['file_size'])}")

    if photo['error']:
        click.echo(f"    ⚠️  Error: {photo['error']}")
        return

    if photo['date_taken']:
        click.echo(f"    📅  Date: {photo['date_taken']}")

    if photo['camera_make'] or photo['camera_model']:
        camera = ' '.join(filter(None, [photo['camera_make'], photo['camera_model']]))
        click.echo(f"    📷  Camera: {camera}")

    if photo['lens']:
        click.echo(f"    🔍  Lens: {photo['lens']}")

    exposure = []
    if photo['iso']:
        exposure.append(photo['iso'])
    if photo['aperture']:
        exposure.append(photo['aperture'])
    if photo['shutter_speed']:
        exposure.append(photo['shutter_speed'])
    if photo['focal_length']:
        exposure.append(photo['focal_length'])
    if exposure:
        click.echo(f"    ⚡ Exposure: {' | '.join(exposure)}")

    if photo['latitude'] and photo['longitude']:
        click.echo(f"    📍  Location: {photo['latitude']:.6f}, {photo['longitude']:.6f}")

    if verbose:
        if photo['software']:
            click.echo(f"    💻  Software: {photo['software']}")
        if photo['copyright']:
            click.echo(f"    ©️  Copyright: {photo['copyright']}")
        if photo['artist']:
            click.echo(f"    👤  Artist: {photo['artist']}")


def print_stats(photos: list) -> None:
    """Print summary statistics."""
    total = len(photos)
    with_exif = sum(1 for p in photos if not p['error'])
    with_date = sum(1 for p in photos if p['date_taken'])
    with_gps = sum(1 for p in photos if p['latitude'] and p['longitude'])
    total_size = sum(p['file_size'] for p in photos)

    cameras = {}
    for p in photos:
        if p['camera_model']:
            cameras[p['camera_model']] = cameras.get(p['camera_model'], 0) + 1

    dates = {}
    for p in photos:
        if p['date_taken']:
            year = p['date_taken'][:4] if len(p['date_taken']) >= 4 else 'Unknown'
            dates[year] = dates.get(year, 0) + 1

    click.echo("\n" + "=" * 50)
    click.echo(click.style("  📊 PHOTO ANALYSIS SUMMARY", bold=True, fg='cyan'))
    click.echo("=" * 50)
    click.echo(f"\n  Total photos:     {total}")
    click.echo(f"  With EXIF data:   {with_exif} ({100*with_exif/max(total,1):.1f}%)")
    click.echo(f"  With date:        {with_date} ({100*with_date/max(total,1):.1f}%)")
    click.echo(f"  With GPS:         {with_gps} ({100*with_gps/max(total,1):.1f}%)")
    click.echo(f"  Total size:       {format_size(total_size)}")

    if cameras:
        click.echo("\n  📷  Cameras used:")
        for camera, count in sorted(cameras.items(), key=lambda x: -x[1])[:5]:
            click.echo(f"      {camera}: {count} photos")

    if dates:
        click.echo("\n  📅  Photos by year:")
        for year, count in sorted(dates.items())[:10]:
            click.echo(f"      {year}: {count} photos")

    click.echo()


@click.command()
@click.argument('directory', type=click.Path(exists=True, path_type=Path))
@click.option('--json', 'output_json', is_flag=True, help='Output as JSON')
@click.option('--csv', 'output_csv', is_flag=True, help='Output as CSV')
@click.option('--geo', is_flag=True, help='Show only photos with GPS data')
@click.option('--stats', is_flag=True, help='Show summary statistics')
@click.option('--verbose', '-v', is_flag=True, help='Show all EXIF details')
@click.option('--no-progress', is_flag=True, help='Disable progress bar')
def cli(directory: Path, output_json: bool, output_csv: bool, geo: bool, stats: bool, verbose: bool, no_progress: bool):
    """
    Analyze EXIF metadata from photos in a directory.

    Examples:

        photokit ./photos                    Analyze all photos
        photokit ./photos --json             Output as JSON
        photokit ./photos --geo              Show only GPS-tagged photos
        photokit ./photos --stats            Show summary statistics
    """
    click.echo(click.style("\n🔍  photokit - Photo EXIF Analyzer\n", bold=True, fg='cyan'))
    click.echo(f"  Scanning: {directory}\n")

    # Find all images
    images = find_images(directory)
    
    if not images:
        click.echo(f"⚠️  No images found in {directory}")
        return

    click.echo(f"  Found {len(images)} image(s)...\n")

    # Process images
    photos = []
    
    if no_progress:
        for img_path in images:
            photo = extract_exif(img_path)
            photos.append(photo)
    else:
        with click.progressbar(images, label='  Analyzing', show_eta=True, show_pos=True) as bar:
            for img_path in bar:
                photo = extract_exif(img_path)
                photos.append(photo)

    # Filter for geo mode
    if geo:
        photos = [p for p in photos if p['latitude'] and p['longitude']]
        if photos:
            click.echo(f"\n  📍  Found {len(photos)} photo(s) with GPS data:\n")
        else:
            click.echo(f"\n  ⚠️  No photos with GPS data found.")
            return

    # Output modes
    if output_json:
        output = {
            'scanned_at': datetime.now().isoformat(),
            'directory': str(directory),
            'total_photos': len(photos),
            'photos': photos,
        }
        click.echo(json.dumps(output, indent=2))
    elif output_csv:
        if not photos:
            return
        fieldnames = ['filename', 'filepath', 'file_size', 'date_taken', 
                     'camera_make', 'camera_model', 'lens', 'iso', 'aperture',
                     'shutter_speed', 'focal_length', 'latitude', 'longitude', 
                     'width', 'height', 'software']
        writer = csv.DictWriter(sys.stdout, fieldnames=fieldnames, extrasaction='ignore')
        writer.writeheader()
        writer.writerows(photos)
    elif stats:
        print_stats(photos)
    else:
        # Default: print summaries
        if not photos:
            return
        for photo in photos:
            print_photo_summary(photo, verbose=verbose)
        click.echo("\n" + "-" * 50)
        click.echo(f"  Total: {len(photos)} photo(s) analyzed")
        click.echo()


if __name__ == '__main__':
    cli()
