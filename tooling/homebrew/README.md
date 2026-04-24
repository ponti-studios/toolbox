# Homebrew Formulas

This directory holds formula templates for toolbox binaries.

## Intended Flow

1. Create a release tag such as `geokit-v0.1.0`
2. Let `.github/workflows/release.yml` publish target archives and `.sha256` files
3. Copy the matching formula into the studio tap repository
4. Replace the placeholder versioned URLs and checksums with the released values
5. Merge the tap update and test with `brew install`

## Asset Convention

- Archive name: `<cli>-<target>.tar.gz`
- Supported targets: `aarch64-apple-darwin`, `x86_64-apple-darwin`
- Release tag: `<cli>-v<version>`

## Notes

- These formula files are templates until checksums are filled in
- `timekit` remains experimental even though a formula template exists
