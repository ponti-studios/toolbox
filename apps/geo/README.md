# geo

Geolocation lookup and CSV geocoding CLI built on OpenStreetMap Nominatim.

## Install

Preferred distribution is via the studio Homebrew tap.

For local development:

```bash
cargo run -p geo -- --help
```

## Examples

```bash
geo geocode "Mahopac, New York"
geo geocode-csv --file contacts.csv --column City
```

## Release

Release assets are published from tags like `geo-v0.1.0`.
