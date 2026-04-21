# geo

Geolocation lookup and CSV geocoding CLI built on OpenStreetMap Nominatim.

## Install

Preferred distribution is via the studio Homebrew tap.

For local development:

```bash
cargo run -p geo -- --help
```

## Commands

### `geocode` - Lookup a place name

```bash
geo geocode <query>
```

**Examples:**

```bash
# Basic place lookup
geo geocode "Mahopac, New York"

# City lookup
geo geocode "Paris, France"

# Address lookup
geo geocode "1600 Amphitheatre Parkway, Mountain View, CA"

# Landmark lookup
geo geocode "Empire State Building"

# Country lookup
geo geocode "Japan"

# Postal code lookup
geo geocode "90210"
```

**Expected Output:**

```
Mahopac, Putnam County, New York, United States
lat=41.6006, lon=-73.7429
```

---

### `geocode-csv` - Geocode a CSV column

```bash
geo geocode-csv -f <file> -c <column> [-o <output>]
```

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `-f, --file <FILE>` | Input CSV file (required) | - |
| `-c, --column <COLUMN>` | Column to geocode (required) | - |
| `-o, --output <OUTPUT>` | Output CSV file | `<input>.geocoded.csv` |

**Examples:**

```bash
# Basic CSV geocoding
geo geocode-csv -f locations.csv -c city

# Specify output file
geo geocode-csv -f locations.csv -c city -o geocoded_locations.csv

# Full path example
geo geocode-csv -f /data/addresses.csv -c address -o /output/geocoded.csv

# Different column names
geo geocode-csv -f stores.csv -c "Store Location"
geo geocode-csv -f customers.csv -c "Full Address"
```

**Input CSV Format:**

```csv
name,city,state
Store A,"New York, NY",NY
Store B,"Los Angeles, CA",CA
```

**Output CSV adds columns:** `lat,lon,city,state,country,country_code`

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NOMINATIM_BASE_URL` | Custom Nominatim server URL | `https://nominatim.openstreetmap.org` |

**Example:**

```bash
# Use custom Nominatim server
NOMINATIM_BASE_URL="https://your-nominatim-server.com" geo geocode "Test Location"
```

---

## Build & Run

```bash
# Build
cargo build -p geo

# Run from source
cargo run -p geo -- geocode "New York"

# Run binary directly
./target/debug/geo geocode "New York"

# Install globally
cargo install --path apps/geo
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
- [ ] Custom Nominatim server

### geocode-csv command
- [ ] Basic CSV with city column
- [ ] CSV with address column
- [ ] Custom output file path
- [ ] Default output file naming
- [ ] CSV with quoted fields
- [ ] Missing column error
- [ ] Missing file error
- [ ] Large CSV file (100+ rows)

---

## API Notes

- **Provider:** OpenStreetMap Nominatim
- **Rate Limiting:** 1 request per second (enforced by CLI)
- **Timeout:** 5 seconds per request
- **User-Agent:** `geo-cli/1.0`

---

## Release

Release assets are published from tags like `geo-v0.1.0`.

---

## Technical Notes

- Uses async Rust with `tokio` for network requests
- `geocode` and `geocode-csv` both call OpenStreetMap Nominatim
- CSV mode rate-limits requests with a 1.1s delay between lookups
- Results are cached within a run to avoid duplicate geocoding requests
- HTTP requests use a 5-second timeout and a fixed `User-Agent` header

## Related Files

- Source: `apps/geo/src/cli.rs`
- Entry point: `apps/geo/src/main.rs`
- Tests: `apps/geo/tests/cli.rs`
