# geo

Swift CLI for Apple Maps geocoding and CSV enrichment using `MapKit`.

## Requirements

- macOS
- Swift 6+

## Install

Preferred distribution is via the studio Homebrew tap.

For local development:

```bash
cd apps/geo
swift run geo -- --help
```

To install a global binary from this repo:

```bash
just install-geo
```

## Commands

### `geocode` - Lookup a place name

```bash
geo geocode [--limit N] <query>
```

You can also omit the subcommand and run:

```bash
geo <query>
```

**Examples:**

```bash
geo "Mahopac, New York"
geo geocode "Paris, France"
geo geocode "1600 Amphitheatre Parkway, Mountain View, CA"
geo geocode "Empire State Building"
geo geocode "Japan"
geo geocode "90210"
geo geocode --limit 3 "coffee near Apple Park"
```

**Output:**

`geocode` emits pretty-printed JSON so you can inspect Apple Maps result data, including:

- query metadata
- bounding region
- all returned result payloads
- `MKMapItem` fields like `name`, `phoneNumber`, `url`, `pointOfInterestCategory`
- detailed `MKPlacemark` fields like coordinates, address components, timezone, areas of interest, and postal address data when available

---

### `geo-review` - Native macOS review UI for `place_review_candidates`

A separate executable target, `geo-review`, opens a SwiftUI macOS app for browsing and editing review candidates directly from `db.sqlite`.

```bash
swift run geo-review -- --db /path/to/db.sqlite
```

If `--db` is omitted, `geo-review` defaults to `./db.sqlite` from the current working directory.

Current capabilities:

- loads all rows from `place_review_candidates`
- shows list + detail UI for records needing review
- displays canonical place name, current query, result summary, and metadata
- lets you edit and save `current_query` back to SQLite
- supports in-app refresh and text filtering

This is intended to be the manual review surface, while the `geo` CLI remains the automation/batch tool.

---

### `geocode-csv` - Geocode a CSV column

```bash
geo geocode-csv -f <file> -c <column> [-o <output>] [--include-json]
```

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `-f, --file <FILE>` | Input CSV file (required) | - |
| `-c, --column <COLUMN>` | Column to geocode (required) | - |
| `-o, --output <OUTPUT>` | Output CSV file | `<input>.geocoded.csv` |
| `--include-json` | Add an `apple_maps_json` column with the full first result payload | off |

**Examples:**

```bash
geo geocode-csv -f locations.csv -c city
geo geocode-csv -f locations.csv -c city -o geocoded_locations.csv
geo geocode-csv -f /data/addresses.csv -c address -o /output/geocoded.csv
geo geocode-csv -f stores.csv -c "Store Location"
geo geocode-csv -f customers.csv -c "Full Address"
geo geocode-csv -f locations.csv -c city --include-json
```

**Input CSV Format:**

```csv
name,city,state
Store A,"New York, NY",NY
Store B,"Los Angeles, CA",CA
```

**Output CSV adds columns:** `lat,lon,city,state,country,country_code`

Optional: `apple_maps_json`

---

## Build & Run

```bash
# Build
cd apps/geo && swift build

# Run from source
cd apps/geo && swift run geo -- geocode "New York"

# Run binary directly
./apps/geo/.build/debug/geo geocode "New York"
./apps/geo/.build/debug/geo-review --db /path/to/db.sqlite

# Install globally via repo helper
just install-geo
```

---

## Testing Checklist

### geocode command
- [ ] City lookup (e.g., "Paris, France")
- [ ] Address lookup (e.g., "1600 Amphitheatre Parkway")
- [ ] Landmark lookup (e.g., "Empire State Building")
- [ ] Country lookup (e.g., "Japan")
- [ ] Postal code lookup (e.g., "90210")
- [ ] International locations (non-English characters)
- [ ] Invalid/non-existent locations
- [ ] Multi-result lookup with `--limit`

### geocode-csv command
- [ ] Basic CSV with city column
- [ ] CSV with address column
- [ ] Custom output file path
- [ ] Default output file naming
- [ ] CSV with quoted fields
- [ ] Missing column error
- [ ] Missing file error
- [ ] Large CSV file (100+ rows)
- [ ] `--include-json` output column

---

## API Notes

- **Provider:** Apple Maps via `MKLocalSearch`
- **Platform:** macOS only
- **CSV pacing:** 1.1s delay between uncached lookups
- **Result caching:** duplicate CSV queries are cached within a run

---

## Release

Release assets are published from tags like `geo-v0.1.0`.

---

## Technical Notes

- Built as a Swift Package executable
- Uses `MapKit`, `CoreLocation`, and `Contacts`
- `geocode` emits rich JSON payloads for capability inspection
- `geocode-csv` uses the first Apple Maps result for enrichment
- CSV parsing and writing are implemented in-process for portability within the Swift CLI
