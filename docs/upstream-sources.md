# Upstream Sources

`toolbox` remains the umbrella tools monorepo, but some tools now have
standalone upstream repositories and are mirrored into `apps/` on purpose.

## Current upstream-owned tools

- `apps/geokit` <- `/Users/charlesponti/Developer/geo`
- `apps/warehouse` <- `/Users/charlesponti/Developer/voidline`

## Sync rules

- Make product-level changes in the upstream repo first.
- Use the sync scripts in `scripts/` to copy the upstream implementation into
  this repo.
- Keep repo-specific packaging and release notes in the upstream repo unless the
  change is explicitly `toolbox`-only.
- Avoid editing `apps/geokit` or `apps/warehouse` directly unless you are also
  updating the upstream repo in the same change.

## Commands

```bash
just sync-geokit-from-geo
just sync-warehouse-from-voidline
```
