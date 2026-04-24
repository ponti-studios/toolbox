# Geo Review SwiftData Migration Plan

## Goal

Migrate `geo-review` from the current SQLite-driven runtime model to a fully SwiftData-native architecture.

This means:

- SwiftData becomes the canonical persistence layer for the app
- the existing `db.sqlite` becomes a migration/import source
- the runtime app no longer depends on direct SQL queries or the `sqlite3` CLI
- the model is redesigned around the app domain, not around the legacy SQLite schema

---

## Guiding principles

1. **Do not mirror the old SQLite schema 1:1 in SwiftData**
   - model the app we want, not the database we inherited

2. **Preserve all important data**
   - place identity
   - review state
   - attempt history
   - Apple Maps payloads
   - provenance / legacy references

3. **Keep the first SwiftData schema focused**
   - avoid over-modeling every possible legacy table immediately

4. **Make migration traceable**
   - preserve legacy IDs so imported records can be audited/debugged

5. **Do not run mixed canonical storage long-term**
   - SQLite may exist as import/archive/export material
   - SwiftData should become the runtime source of truth

---

## Recommended SwiftData model architecture

## 1. `Place`
Canonical place entity.

### Responsibilities
- represents the actual place
- holds stable identity + canonical location/address fields
- should not be overloaded with transient workflow state beyond what is essential

### Proposed fields
- `legacyPlaceID: Int?`
- `name: String`
- `url: String?`
- `placeType: String?`
- `latitude: Double?`
- `longitude: Double?`
- `formattedAddress: String?`
- `city: String?`
- `state: String?`
- `postalCode: String?`
- `country: String?`
- `countryCode: String?`
- `geocodedAt: Date?`
- `createdAt: Date?`
- `updatedAt: Date?`
- `rawMetadataJSON: String?`

### Relationships
- one-to-one: `review: PlaceReview?`
- one-to-many: `attempts: [PlaceGeocodeAttempt]`

---

## 2. `PlaceReview`
Review/workflow state for a place.

### Responsibilities
- stores human/app review state
- stores current query and last known geocode outcome
- keeps workflow concerns separate from canonical place identity

### Proposed fields
- `status: String`
  - expected values:
    - `needs_review`
    - `ok`
    - `no_match`
    - `not_a_place`
    - `unknown`
- `reason: String?`
- `query: String?`
- `updatedAt: Date?`
- `decisionAt: Date?`
- `decisionSource: String?`
- `lastGeocodeStatus: String?`
- `lastGeocodeQuery: String?`
- `lastGeocodeResultSummary: String?`
- `expectedCountry: String?`
- `suggestedQueries: String?`
- `legacyCandidateMetadataJSON: String?`

### Relationship
- inverse one-to-one with `Place`

---

## 3. `PlaceGeocodeAttempt`
Historical log of geocode/review attempts.

### Responsibilities
- stores attempt history
- preserves raw response payloads
- supports debugging/audit/history UI

### Proposed fields
- `legacyAttemptID: Int?`
- `query: String`
- `provider: String`
- `status: String`
- `resultSummary: String?`
- `responseJSON: String?`
- `createdAt: Date`

### Relationship
- many-to-one with `Place`

---

## Optional later models
These are not required for the first migration pass.

Potential future SwiftData models:
- `PlaceCollection`
- `PlaceCollectionItem`
- `CalendarEvent`
- `PlaceTag`
- `ReviewPreset`
- app settings / saved filters

For now, the minimum viable canonical domain is:
- `Place`
- `PlaceReview`
- `PlaceGeocodeAttempt`

---

## Field mapping from current SQLite

## Source: `places`

### To `Place`
- `places.id` -> `Place.legacyPlaceID`
- `places.name` -> `Place.name`
- `places.url` -> `Place.url`
- `places.place_type` -> `Place.placeType`
- `places.latitude` -> `Place.latitude`
- `places.longitude` -> `Place.longitude`
- `places.formatted_address` -> `Place.formattedAddress`
- `places.city` -> `Place.city`
- `places.state` -> `Place.state`
- `places.postal_code` -> `Place.postalCode`
- `places.country` -> `Place.country`
- `places.country_code` -> `Place.countryCode`
- `places.geocoded_at` -> `Place.geocodedAt`
- `places.created_at` -> `Place.createdAt`
- `places.updated_at` -> `Place.updatedAt`
- `places.metadata` -> `Place.rawMetadataJSON`

### To `PlaceReview`
- `places.review_status` -> `PlaceReview.status`
- `places.review_reason` -> `PlaceReview.reason`
- `places.review_query` -> `PlaceReview.query`
- `places.review_updated_at` -> `PlaceReview.updatedAt`
- `places.review_decision_at` -> `PlaceReview.decisionAt`
- `places.review_decision_source` -> `PlaceReview.decisionSource`
- `places.last_geocode_status` -> `PlaceReview.lastGeocodeStatus`
- `places.last_geocode_query` -> `PlaceReview.lastGeocodeQuery`
- `places.last_geocode_result_summary` -> `PlaceReview.lastGeocodeResultSummary`

### From `places.metadata` into structured `PlaceReview` fields
If present in JSON, extract:
- `$.review.expected_country` -> `PlaceReview.expectedCountry`
- `$.review.suggested_queries` -> `PlaceReview.suggestedQueries`
- `$.review.legacy_candidate_metadata` -> `PlaceReview.legacyCandidateMetadataJSON`

Anything not promoted into first-class properties stays in:
- `Place.rawMetadataJSON`

---

## Source: `place_geocode_attempts`

### To `PlaceGeocodeAttempt`
- `id` -> `legacyAttemptID`
- `place_id` -> relationship via `Place.legacyPlaceID`
- `query` -> `query`
- `provider` -> `provider`
- `status` -> `status`
- `result_summary` -> `resultSummary`
- `response_json` -> `responseJSON`
- `created_at` -> `createdAt`

---

## Data preservation strategy

## Preserve as structured first-class fields
These should become native SwiftData properties:
- canonical place name and address fields
- coordinates
- review status / reason / query
- last geocode state
- attempt history

## Preserve as raw JSON
These can remain as raw JSON strings for now:
- full imported `places.metadata`
- selected Apple Maps payloads inside metadata
- legacy candidate metadata blobs
- any provenance fields not yet modeled

This gives us:
- low-risk migration
- no loss of detail
- ability to normalize further later

---

## Migration/import architecture

## Phase 1: Introduce SwiftData models
Create `@Model` definitions for:
- `Place`
- `PlaceReview`
- `PlaceGeocodeAttempt`

Also define:
- shared conversion helpers
- date parsing helpers
- import diagnostics/logging

### Important
Do this before changing the UI.

---

## Phase 2: Build one-time importer from legacy SQLite
Create an importer that:
1. opens the existing `db.sqlite`
2. reads rows from `places`
3. creates/imports `Place`
4. creates `PlaceReview`
5. reads/imports `place_geocode_attempts`
6. links attempts to imported places via `legacyPlaceID`

### Import behavior requirements
- idempotent or safely rerunnable in dev
- logs counts and mismatches
- preserves legacy IDs
- tolerates null/malformed fields gracefully

### Suggested import checks
- imported place count matches expected legacy count
- imported review-state counts match expected source counts
- imported attempt count matches legacy attempt count
- imported coordinates count matches source count

---

## Phase 3: Validation pass
Before switching the UI over fully, verify:
- total places imported correctly
- status counts match
- sample spot checks match original rows
- selected Apple Maps payloads survived
- review history survived
- `needs_review` / `ok` / `not_a_place` / `no_match` counts all match

### Recommended validation queries/checks
- compare total counts old/new
- compare per-status counts old/new
- compare sample legacy IDs across both systems
- compare a few accepted geocode attempts end-to-end

---

## Phase 4: Switch runtime app reads to SwiftData
After validation:
- sidebar loads from SwiftData
- map annotations load from SwiftData
- detail pane loads from SwiftData
- review actions write to SwiftData
- attempt history reads from SwiftData

At this point, SQLite is no longer needed for runtime reads/writes.

---

## Phase 5: Retire runtime SQLite dependency
After the app runs fully on SwiftData:
- remove the `sqlite3` CLI dependency from the app
- keep SQLite importer only as:
  - migration tool
  - export/import tool
  - legacy archive reader if needed

---

## Runtime behavior after migration

## SwiftData becomes the canonical source for:
- list/sidebar
- map
- detail view
- review status
- review query edits
- accept/not-a-place actions
- attempt history

## Legacy SQLite becomes:
- one-time import source
- optional export/archive source
- not part of normal runtime behavior

---

## SwiftData-specific design recommendations

## Keep `PlaceReview` separate from `Place`
This is important.

Why:
- `Place` is the entity
- `PlaceReview` is app workflow state
- clearer separation
- easier future reuse of `Place`

## Keep `PlaceGeocodeAttempt` separate and append-only
This gives:
- history integrity
- debugging
- easier UI timelines
- less mutation risk

## Avoid over-normalizing in v1
For the first migration:
- prefer a few robust models
- keep raw metadata JSON where helpful
- avoid inventing many new entities unless the UI needs them immediately

---

## UI implications after SwiftData adoption

SwiftData should improve:
- SwiftUI previews
- live development workflow
- platform expansion to iPhone/iPad
- testability
- local state modeling

### The app shell can become cleaner
- `@Query` / fetch descriptors where appropriate
- cleaner selection logic
- easier in-memory preview containers

---

## Risks and mitigations

## Risk 1: Data loss during migration
### Mitigation
- preserve raw JSON fields
- preserve legacy IDs
- build validation checks before switching runtime

## Risk 2: Overfitting SwiftData to current SQLite quirks
### Mitigation
- model the domain cleanly
- do not mirror SQLite schema blindly

## Risk 3: Mixed persistence confusion
### Mitigation
- clearly define SQLite as import-only after cutover

## Risk 4: Migration complexity slows UI progress
### Mitigation
- implement in phases
- keep current UI working while importer is built and validated

---

## Recommended implementation order

## Step 1
Define SwiftData `@Model` types.

## Step 2
Build date parsing / import utility layer.

## Step 3
Build SQLite importer for `places`.

## Step 4
Build SQLite importer for `place_geocode_attempts`.

## Step 5
Run validation and compare counts.

## Step 6
Switch `geo-review` reads to SwiftData.

## Step 7
Switch review actions to SwiftData writes.

## Step 8
Remove runtime SQLite dependency.

---

## Questions to resolve before implementation

1. Should `Place.rawMetadataJSON` preserve the full original `places.metadata` untouched?
   - Recommended: yes

2. Should `PlaceReview.expectedCountry` and `suggestedQueries` be first-class fields?
   - Recommended: yes

3. Should imported dates be optional if parsing fails?
   - Recommended: yes

4. Should app preferences/filter state also use SwiftData later?
   - Optional; not required for initial migration

---

## Recommendation summary

If we are going all in on SwiftData, the right path is:

- redesign around app-native models
- preserve all important legacy data
- import from current SQLite carefully
- validate thoroughly
- switch runtime fully to SwiftData
- retire SQLite runtime usage

The first SwiftData foundation should be:
- `Place`
- `PlaceReview`
- `PlaceGeocodeAttempt`

That is the cleanest and safest all-in SwiftData migration path.
