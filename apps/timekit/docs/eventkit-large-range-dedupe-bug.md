# EventKit Dedupe Bug: Why a Wider Date Range Returned Zero Events

## Summary

While building `timekit dedupe`, we hit a subtle EventKit failure mode:

- a narrower dedupe scan found **447 duplicate events**
- after changing the default range to be effectively “all time”, the same command returned:
  - `Scanned writable events: 0`
  - `Duplicate groups: 0`

At first glance this looked impossible. The app still had calendar access, `timekit sync` could still read events, and the calendars clearly contained the same recurring items we had just detected.

The root cause was **how EventKit handles event predicates over very large time windows**, especially when recurring events are involved.

## The Commands That Exposed the Bug

A successful earlier run produced output like:

```text
Group 447: [Untitled] Anniversary: Marcy @ 2026-10-19 [recurring]
  keep   80A8C317-6BCC-439E-85A6-A7DCD2AF361E | Untitled | Anniversary: Marcy | 2026-10-19 | recurring
  delete 9CBBFF69-6EE2-4819-AD08-1143CD756244 | Untitled | Anniversary: Marcy | 2026-10-19 | recurring
Dry run only. Re-run with --apply to delete 447 events.
```

Then after widening the default date range, this same command returned nothing:

```bash
timekit dedupe --strictness strict
```

Output:

```text
Timekit Dedupe
Strictness: strict
Mode: dry-run
Calendar filter: all writable calendars
Range: 1900-01-01T00:00:00Z to 2101-01-01T00:00:00Z
Range defaults: start=default, end=default
Scanned writable events: 0
Duplicate groups: 0
Duplicate events to delete: 0
No duplicates found.
```

That contradiction is what told us the bug was not in duplicate grouping logic. It was happening **before dedupe logic even ran**, at event retrieval time.

## What `timekit dedupe` Does

`timekit dedupe` reads the user’s **real Apple Calendar data** through EventKit. It does not dedupe a local file or a SQLite table.

The high-level flow is:

1. Request access to Apple Calendar via `EKEventStore`
2. Fetch writable calendars
3. Query events in a date range
4. Group events by a dedupe key (`strict`, `medium`, or `loose`)
5. Keep one event in each group and mark the others as duplicates
6. If `--apply` is passed, remove the duplicates from the real calendar store

So if the fetch step returns zero events, the whole dedupe pipeline becomes a no-op.

## How EventKit Works Here

The key EventKit APIs involved are:

- `EKEventStore`
- `store.calendars(for: .event)`
- `store.predicateForEvents(withStart:end:calendars:)`
- `store.events(matching:)`

The important detail is that EventKit does not simply read rows from a static table. It builds a result set from Apple Calendar’s event store, including:

- normal single events
- all-day events
- recurring events
- generated recurring **occurrences** within the requested time window

That last point matters a lot.

## Why Recurring Events Make This Harder

Recurring events are not stored as a giant pre-expanded list of every future occurrence.

Instead, EventKit conceptually works more like this:

- there is a recurring series definition
- when you ask for a time window, EventKit expands occurrences that fall into that window
- exceptions and overrides are then merged in

That means query behavior depends heavily on the requested date span.

For a reasonable window, like:

- 1 year
- 18 months
- 2 years

EventKit can expand occurrences and return sensible results.

For a huge window, like:

- `Date.distantPast ... Date.distantFuture`
- or even a practical but very wide range like `1900 ... 2100`

EventKit may behave poorly because it now has to reason about a vast span of time and potentially huge recurring expansions.

## Why the Bug Happened

We introduced the bug in two steps.

### Step 1: Original working behavior

Originally, dedupe used a limited default range similar to the sync command:

- about 12 months in the past
- about 6 months in the future

That returned real events and found duplicates correctly.

### Step 2: We widened the default range

To make dedupe feel like it searched “all time”, we changed the default range to use very large bounds.

First we tried effectively infinite bounds:

- `Date.distantPast`
- `Date.distantFuture`

That was a mistake. EventKit predicate queries do not behave reliably with effectively infinite dates.

Then we tried a very wide finite range:

- `1900-01-01`
- `2101-01-01`

That was better in theory, but still too large for a single EventKit fetch in this workflow.

The result was that this line of code effectively failed at runtime:

```swift
let predicate = store.predicateForEvents(withStart: start, end: end, calendars: calendars)
let events = store.events(matching: predicate)
```

Not by throwing an error, but by returning **zero events**.

That is the dangerous part of this bug: the API did not fail loudly. It failed **silently**.

## Why `timekit sync` Still Worked

This was a useful clue.

`timekit sync` still returned data like:

```text
Synced 2292 events from 3 calendars.
```

So we knew:

- permissions were fine
- EventKit access still worked
- calendars were still present
- the data had not disappeared

The difference was that `sync` used a much narrower, practical date range, while `dedupe` was using an all-time range.

That isolated the problem to the predicate window, not authentication or calendar selection.

## How We Spotted It

We spotted the bug by comparing two facts that could not both be true:

1. earlier dedupe output listed hundreds of recurring duplicate groups
2. later dedupe output said `Scanned writable events: 0`

That ruled out several possible causes:

- not a grouping bug, because grouping never saw any events
- not a permissions bug, because `sync` still worked
- not a missing-calendar bug, because writable calendars were still there
- not a deletion bug, because this happened on dry-run

The only consistent explanation was that the fetch strategy had become invalid.

## The Real EventKit Constraint

The practical lesson is:

> EventKit is reliable over reasonable bounded ranges, but not over gigantic “all time” queries.

This is especially true when recurring events must be expanded into occurrences.

Even if a very large range is technically finite, it can still behave like an “unbounded” query from EventKit’s perspective.

## How We Fixed It

We changed the fetch strategy from:

- **one giant query over the entire range**

to:

- **many smaller queries in one-year chunks**

### Before

Conceptually, the old code did this:

```swift
let predicate = store.predicateForEvents(withStart: start, end: end, calendars: calendars)
let events = store.events(matching: predicate)
```

Where `start` and `end` might span centuries.

### After

Now the code:

1. keeps the practical “all time” defaults (`1900` to `2100`)
2. iterates across that range in one-year windows
3. asks EventKit for each chunk separately
4. merges the results
5. removes duplicates caused by chunk boundaries

Conceptually:

```swift
var cursor = start
while cursor < end {
    let chunkEnd = min(cursor + 1 year, end)
    let predicate = store.predicateForEvents(withStart: cursor, end: chunkEnd, calendars: calendars)
    let chunkEvents = store.events(matching: predicate)
    merge(chunkEvents)
    cursor = chunkEnd
}
```

## Why Chunking Works

Chunking works because it keeps each EventKit query inside a manageable expansion window.

For recurring events, this means:

- EventKit only has to expand occurrences for one year at a time
- the predicate is much smaller and more realistic
- the API returns real events again

This preserves the user-facing meaning of “search everything” without relying on a single pathological query.

## Why We Had to De-duplicate Fetch Results Too

When querying adjacent time chunks, there is a risk that an event near a boundary could appear twice depending on how EventKit interprets the range.

So the fix also added a fetch-level uniqueness key based on:

- calendar item identifier
- start date
- end date
- normalized title

That way, the merged result set only contains one copy of each occurrence before dedupe logic begins.

## Why This Bug Was Easy to Miss

This bug was subtle for a few reasons:

1. **No thrown error**
   - EventKit simply returned an empty result set.
2. **Permissions still looked fine**
   - `timekit sync` still worked.
3. **The wider range sounded safer**
   - “all time” feels like it should include more data, not less.
4. **Recurring events change the behavior of large windows**
   - the problem is not just raw event count, but recurrence expansion complexity.

## The Final Rule

When using EventKit:

- do **not** query effectively infinite ranges
- do **not** rely on one giant predicate over centuries of time
- do use **bounded windows**
- if you need “all time”, implement it as **chunked bounded scans**

## Practical Takeaway for `timekit`

The correct mental model is:

- users want “all events”
- EventKit wants “reasonable windows”
- the implementation must translate the first into the second

So the right solution is not literal infinity. The right solution is **progressive bounded querying**.

## Files Involved

Primary implementation file:

- `apps/timekit/Sources/Timekit/main.swift`

This is where we:

- changed dedupe defaults away from truly infinite dates
- discovered that a single very wide predicate still failed
- replaced the giant fetch with chunked yearly EventKit fetches
- merged and de-duplicated occurrence results before dedupe grouping

## Short Version

The bug happened because `timekit dedupe` asked EventKit for too much calendar time in one query.

EventKit can expand recurring events within reasonable date windows, but a massive “all time” predicate can silently collapse into an empty result.

We spotted it because dedupe had previously found 447 duplicates, yet after widening the range it reported `Scanned writable events: 0` while `timekit sync` still returned thousands of events.

We fixed it by querying EventKit in smaller one-year chunks and merging the results.

That keeps dedupe effectively “all time” for users, while staying inside the bounds EventKit handles reliably.
