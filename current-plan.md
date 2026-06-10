# Resume DOCX Style Improvements

## Context

The Go-based resume generator (`apps/resume/internal/resumedocx/resumedocx.go`) produces
DOCX files with functional but visually underdeveloped styling. The core problems are:

1. **Structural incorrectness** — Heading styles aren't defined in `styles.xml` and aren't
   referenced via `w:pStyle`. Word's Navigation Pane, accessibility tools, and PDF bookmarks
   all require named heading styles.
2. **Bullet lists bypass DOCX's list model** — bullets are emitted as raw Unicode text runs
   instead of `w:numPr`, so Word's outline view doesn't recognise them as list items.
3. **Weak visual hierarchy** — H1 (candidate name) is 14pt, same weight as H2; no colour; no
   section dividers; spacing values are too tight to scan quickly.
4. **Dead config** — `styles/resume.yaml` defines detailed styles that `resumedocx.go` never
   reads (all values are hardcoded constants).

The `Verify()` round-trip (normalised text extraction against the source markdown) must
continue to pass after all changes. All changes are in one file with no new Go dependencies.

---

## Implementation Plan

**Single file to change:** `apps/resume/internal/resumedocx/resumedocx.go`
**New DOCX part added:** `word/numbering.xml` (emitted from a new `numberingXML()` function)

### Step 1 — Constants

Replace `marginTwips = 648` with four directional constants and update heading sizes:

```go
topMarginTwips    = 720   // 0.5 in
bottomMarginTwips = 720   // 0.5 in
leftMarginTwips   = 864   // 0.6 in
rightMarginTwips  = 864   // 0.6 in

heading1SizePt = 20   // was 14 — name should anchor the page
heading2SizePt = 11   // visual weight via border+caps, not size
heading3SizePt = 11

accentColor = "1F3A5C"  // dark navy used for H1/H2 colour + border
```

### Step 2 — `renderSectionPr()`

Use the four directional margin constants instead of the single `marginTwips`.

### Step 3 — `stylesXML()` (complete rewrite)

- Change default `w:line` from `240` → `259` (1.08× line spacing) in `docDefaults`,
  `Normal`, and all heading styles.
- Add three new `w:style` elements:

  **Heading1** (`w:styleId="Heading1"`, `w:name w:val="heading 1"`):
  - `w:keepWithNext`, before=0, after=200 twips
  - rPr: bold, `w:color val="1F3A5C"`, 20pt

  **Heading2** (`w:styleId="Heading2"`, `w:name w:val="heading 2"`):
  - `w:keepWithNext`, before=240, after=60 twips
  - `w:pBdr` → `w:bottom val="single" sz="4" space="1" color="1F3A5C"` (section divider)
  - rPr: bold, `w:caps`, `w:color val="1F3A5C"`, 11pt
    (`w:caps` is visual only — `w:t` content stays mixed-case, so Verify() is unaffected)

  **Heading3** (`w:styleId="Heading3"`, `w:name w:val="heading 3"`):
  - `w:keepWithNext`, before=160, after=60 twips
  - rPr: bold, italic, 11pt

### Step 4 — `renderHeading()` (full rewrite)

- Emit `<w:pStyle w:val="HeadingN"/>` and `<w:keepWithNext/>` in each heading's `w:pPr`.
- Emit per-level spacing inline on the `w:p` (mirrors style defaults; ensures correct
  rendering even when styles aren't loaded).
- For H2, also emit `w:pBdr` inline in `w:pPr` (redundant with the style but harmless —
  inline pPr overrides style pPr and both carry the same border).
- Build run XML inline (not via `renderRun()`) to support heading-specific rPr:
  H1 runs get `w:color`; H2 runs get `w:caps` + `w:color`; H3 runs get `w:i`.
- Preserve `xml:space="preserve"` logic for runs with leading/trailing spaces.

### Step 5 — Line spacing in `renderParagraph()`, `renderBullet()`, `renderSpacer()`

Change the literal `w:line="240"` → `w:line="259"` in all three functions so inline
`w:spacing` overrides don't contradict the style defaults.

### Step 6 — `numberingXML()` (new function)

Returns `word/numbering.xml` with one `w:abstractNum` (id=0) and one `w:num` (id=1):

```xml
<w:abstractNum w:abstractNumId="0">
  <w:multiLevelType w:val="hybridMultilevel"/>
  <w:lvl w:ilvl="0">
    <w:start w:val="1"/>
    <w:numFmt w:val="bullet"/>
    <w:lvlText w:val="&#x2022;"/>
    <w:lvlJc w:val="left"/>
    <w:pPr><w:ind w:left="360" w:hanging="220"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Symbol" w:hAnsi="Symbol" w:hint="default"/></w:rPr>
  </w:lvl>
</w:abstractNum>
<w:num w:numId="1">
  <w:abstractNumId w:val="0"/>
</w:num>
```

### Step 7 — `renderBullet()` (rewrite)

Replace the `renderRun("• ", ...)` text-prefix approach with `w:numPr`:

```xml
<w:pPr>
  <w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>
  <w:spacing w:before="0" w:after="15" w:line="259" w:lineRule="auto"/>
</w:pPr>
```

Remove the `w:ind` from here — indentation is now declared in `numbering.xml`'s level pPr.

**Verify() impact:** `extractParagraph()` walks `w:t` nodes. With `w:numPr`, the bullet
character lives in `numbering.xml`'s `w:lvlText` and never appears as `w:t` in the
paragraph. `normalizeExtracted()` already calls `bulletPrefix.ReplaceAllString()` which
becomes a no-op. `normalizeSource()` strips the `- ` markdown prefix via `parseBullet()`.
Both sides produce bare content text → round-trip passes unchanged.

### Step 8 — `contentTypesXML()`

Add Override: `/word/numbering.xml` →
`application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml`

### Step 9 — `documentRelsXML()`

Add Relationship `rId2`, Type `.../relationships/numbering`, Target `numbering.xml`.

### Step 10 — `writeDocx()`

After writing `word/styles.xml`, add:

```go
if err := writeZipFile(zw, "word/numbering.xml", numberingXML()); err != nil {
    return err
}
```

### Step 11 — Dead-config comment

Add a `// TODO: wire styles/resume.yaml ...` comment near the `Options` struct or top of
`writeDocx()` to make the dead config explicit.

---

## Key Risks

| Risk                           | Mitigation                                                                                                                             |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `w:caps` changes text in `w:t` | It doesn't — caps is a visual-only render property. `canonicalizeComparison()` lowercases anyway.                                      |
| Bullet Verify() break          | Analysed above — both sides strip the bullet symbol before comparison.                                                                 |
| Nested bullets in `generic.md` | `parseBullet()` trims whitespace, so all nesting is treated as flat level-0. `numberingXML` only defines `ilvl="0"`. No change needed. |
| H2 `w:pBdr` defined twice      | Style + inline are identical; inline takes precedence but result is the same.                                                          |

---

## Verification

```bash
# Build
cd apps/resume && go build ./...

# Build a fixture and verify round-trip
go run ./cmd/resume build --input fixtures/md-to-docx/resume-regression.md --output /tmp/resume.docx --verify
go run ./cmd/resume build --input fixtures/md-to-docx/generic.md --output /tmp/generic.docx --verify

# Open /tmp/resume.docx in Word or LibreOffice and confirm:
# - Name (H1) appears ~20pt, dark navy colour
# - Section headings (H2) appear with bottom rule, all-caps, dark navy
# - Job role lines (H3) appear bold-italic
# - Bullet points render as list items (check Word's Navigation Pane)
# - No orphaned headings at page bottoms
# - Margins are visually wider L/R than before
```
