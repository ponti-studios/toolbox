package resumedocx

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode"
)

const (
	wNS   = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
	rNS   = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
	cpNS  = "http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
	dcNS  = "http://purl.org/dc/elements/1.1/"
	dtNS  = "http://purl.org/dc/terms/"
	xsiNS = "http://www.w3.org/2001/XMLSchema-instance"
	xmlNS = "http://www.w3.org/XML/1998/namespace"

	pageWidthTwips  = 12240
	pageHeightTwips = 15840

	topMarginTwips    = 720   // 0.5 in
	bottomMarginTwips = 720   // 0.5 in
	leftMarginTwips   = 864   // 0.6 in
	rightMarginTwips  = 864   // 0.6 in

	bodyFont       = "Arial"
	bodySizePt     = 11
	heading1SizePt = 20
	heading2SizePt = 11
	heading3SizePt = 11

	accentColor = "1F3A5C"
)

var (
	pageBreakHTML = regexp.MustCompile(`(?i)^<!--\s*page(?:[- ]?break)?\s*-->$`)
	pageBreakTex  = regexp.MustCompile(`(?i)^\\newpage$`)
	bulletPrefix  = regexp.MustCompile(`^[\-\x{2022}\x{2023}\x{25E6}\x{2043}\x{2219}\x{F0B7}]\s*`)
	numberPrefix  = regexp.MustCompile(`^\d{1,3}[.)]\s+`)
	whitespace    = regexp.MustCompile(`\s+`)
)

type Options struct {
	Title   string
	Author  string
	Creator string
	Subject string
	Tags    []string
}

type blockKind int

const (
	blockParagraph blockKind = iota
	blockHeading
	blockBullet
	blockSpacer
	blockPageBreak
)

type block struct {
	kind  blockKind
	level int
	text  string
}

type inlineRun struct {
	text   string
	bold   bool
	italic bool
}

// Build reads a Markdown file and writes a DOCX rendition to outputPath.
func Build(inputPath, outputPath string, opts Options) error {
	raw, err := os.ReadFile(inputPath)
	if err != nil {
		return err
	}
	blocks := parseBlocks(string(raw))
	if err := os.MkdirAll(filepath.Dir(outputPath), 0o755); err != nil && filepath.Dir(outputPath) != "." {
		return err
	}
	return writeDocx(outputPath, blocks, opts, inputPath)
}

// Verify compares normalized text extracted from source and DOCX files.
func Verify(inputPath, docxPath string) error {
	sourceRaw, err := os.ReadFile(inputPath)
	if err != nil {
		return err
	}
	docxText, err := extractDocxText(docxPath)
	if err != nil {
		return err
	}

	source := normalizeSource(string(sourceRaw))
	docx := normalizeExtracted(docxText)
	if source != docx {
		return fmt.Errorf("docx text extraction mismatch\nsource length: %d\ndocx length: %d\n\nsource excerpt:\n%s\n\ndocx excerpt:\n%s",
			len(source), len(docx), excerpt(source, 1200), excerpt(docx, 1200))
	}
	return nil
}

// Review returns heuristic resume feedback for Markdown content.
func Review(inputPath string) ([]string, error) {
	raw, err := os.ReadFile(inputPath)
	if err != nil {
		return nil, err
	}
	blocks := parseBlocks(string(raw))

	var findings []string
	var headings int
	var bullets []string
	var bulletWithMetrics int

	for _, b := range blocks {
		switch b.kind {
		case blockHeading:
			headings++
		case blockBullet:
			bullets = append(bullets, b.text)
			if hasMetric(b.text) {
				bulletWithMetrics++
			}
		}
	}

	if headings == 0 {
		findings = append(findings, "No headings detected; resumes are usually easier to scan with clear section headings.")
	}
	if len(bullets) > 0 {
		ratio := float64(bulletWithMetrics) / float64(len(bullets))
		if ratio < 0.7 {
			findings = append(findings, fmt.Sprintf("Only %d of %d bullets include a measurable result; aim for at least 70%% metric coverage.", bulletWithMetrics, len(bullets)))
		}
	}
	for i, bullet := range bullets {
		if len([]rune(bullet)) > 240 {
			findings = append(findings, fmt.Sprintf("Bullet %d is quite long; consider trimming it for faster scanning.", i+1))
		}
	}
	for i := 1; i < len(bullets); i++ {
		if firstWord(bullets[i-1]) == firstWord(bullets[i]) && firstWord(bullets[i]) != "" {
			findings = append(findings, fmt.Sprintf("Bullets %d and %d start with the same verb (%s); vary action verbs to reduce repetition.", i, i+1, firstWord(bullets[i])))
		}
	}
	if len(findings) == 0 {
		findings = append(findings, "No obvious structural issues found.")
	}
	return findings, nil
}

func parseBlocks(text string) []block {
	lines := strings.Split(strings.ReplaceAll(text, "\r\n", "\n"), "\n")
	var blocks []block
	var paragraph []string

	flushParagraph := func() {
		if len(paragraph) == 0 {
			return
		}
		blocks = append(blocks, block{kind: blockParagraph, text: strings.Join(paragraph, " ")})
		paragraph = nil
	}

	for _, raw := range lines {
		line := strings.TrimSpace(raw)
		if line == "" {
			flushParagraph()
			blocks = append(blocks, block{kind: blockSpacer})
			continue
		}
		if isPageBreak(line) {
			flushParagraph()
			blocks = append(blocks, block{kind: blockPageBreak})
			continue
		}
		if level, headingText, ok := parseHeading(line); ok {
			flushParagraph()
			blocks = append(blocks, block{kind: blockHeading, level: level, text: headingText})
			continue
		}
		if bulletText, ok := parseBullet(line); ok {
			flushParagraph()
			blocks = append(blocks, block{kind: blockBullet, text: bulletText})
			continue
		}
		paragraph = append(paragraph, line)
	}
	flushParagraph()
	return blocks
}

func parseHeading(line string) (level int, text string, ok bool) {
	if !strings.HasPrefix(line, "#") {
		return 0, "", false
	}
	for level < len(line) && line[level] == '#' {
		level++
	}
	if level == 0 || level > 6 {
		return 0, "", false
	}
	if len(line) <= level || line[level] != ' ' {
		return 0, "", false
	}
	return level, strings.TrimSpace(line[level:]), true
}

func parseBullet(line string) (string, bool) {
	trimmed := strings.TrimSpace(line)
	if trimmed == "" {
		return "", false
	}
	for _, prefix := range []string{"- ", "* ", "+ ", "• ", "‣ ", "◦ ", "⁃ ", "∙ ", " "} {
		if strings.HasPrefix(trimmed, prefix) {
			return strings.TrimSpace(strings.TrimPrefix(trimmed, prefix)), true
		}
	}
	return "", false
}

func isPageBreak(line string) bool {
	return pageBreakHTML.MatchString(line) || pageBreakTex.MatchString(line)
}

func parseInline(text string) []inlineRun {
	var runs []inlineRun
	var buf strings.Builder
	bold := false
	italic := false
	flush := func() {
		if buf.Len() == 0 {
			return
		}
		runs = append(runs, inlineRun{text: buf.String(), bold: bold, italic: italic})
		buf.Reset()
	}

	for i := 0; i < len(text); {
		switch {
		case strings.HasPrefix(text[i:], "**"):
			flush()
			bold = !bold
			i += 2
		case text[i] == '*':
			flush()
			italic = !italic
			i++
		case text[i] == '`':
			i++
		default:
			buf.WriteByte(text[i])
			i++
		}
	}
	flush()
	return mergeAdjacentRuns(runs)
}

func mergeAdjacentRuns(runs []inlineRun) []inlineRun {
	if len(runs) == 0 {
		return nil
	}
	merged := make([]inlineRun, 0, len(runs))
	for _, r := range runs {
		if r.text == "" {
			continue
		}
		if len(merged) > 0 {
			last := &merged[len(merged)-1]
			if last.bold == r.bold && last.italic == r.italic {
				last.text += r.text
				continue
			}
		}
		merged = append(merged, r)
	}
	return merged
}

func writeDocx(outputPath string, blocks []block, opts Options, inputPath string) error {
	f, err := os.Create(outputPath)
	if err != nil {
		return err
	}
	defer f.Close()

	zw := zip.NewWriter(f)

	title := opts.Title
	if title == "" {
		title = strings.TrimSuffix(filepath.Base(inputPath), filepath.Ext(inputPath))
	}
	author := opts.Author
	if author == "" {
		author = title
	}
	creator := opts.Creator
	if creator == "" {
		creator = author
	}
	subject := opts.Subject
	if subject == "" {
		subject = "Document"
	}

	if err := writeZipFile(zw, "[Content_Types].xml", contentTypesXML()); err != nil {
		return err
	}
	if err := writeZipFile(zw, "_rels/.rels", rootRelsXML()); err != nil {
		return err
	}
	if err := writeZipFile(zw, "docProps/core.xml", corePropsXML(title, author, creator, subject, opts.Tags)); err != nil {
		return err
	}
	if err := writeZipFile(zw, "docProps/app.xml", appPropsXML()); err != nil {
		return err
	}
	if err := writeZipFile(zw, "word/document.xml", documentXML(blocks)); err != nil {
		return err
	}
	if err := writeZipFile(zw, "word/styles.xml", stylesXML()); err != nil {
		return err
	}
	if err := writeZipFile(zw, "word/_rels/document.xml.rels", documentRelsXML()); err != nil {
		return err
	}

	return zw.Close()
}

func writeZipFile(zw *zip.Writer, name string, data []byte) error {
	w, err := zw.Create(name)
	if err != nil {
		return err
	}
	_, err = w.Write(data)
	return err
}

func contentTypesXML() []byte {
	return []byte(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`)
}

func rootRelsXML() []byte {
	return []byte(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`)
}

func documentRelsXML() []byte {
	return []byte(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`)
}

func corePropsXML(title, author, creator, subject string, tags []string) []byte {
	now := time.Now().UTC().Format(time.RFC3339)
	keywords := strings.Join(tags, ", ")
	var buf bytes.Buffer
	buf.WriteString(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` + "\n")
	buf.WriteString(`<cp:coreProperties xmlns:cp="` + cpNS + `" xmlns:dc="` + dcNS + `" xmlns:dcterms="` + dtNS + `" xmlns:xsi="` + xsiNS + `">` + "\n")
	buf.WriteString(xmlNode("dc:title", title))
	buf.WriteString(xmlNode("dc:creator", creator))
	buf.WriteString(xmlNode("cp:lastModifiedBy", author))
	buf.WriteString(xmlTypedNode("dcterms:created", now))
	buf.WriteString(xmlTypedNode("dcterms:modified", now))
	buf.WriteString(xmlNode("dc:subject", subject))
	if keywords != "" {
		buf.WriteString(xmlNode("cp:keywords", keywords))
	}
	buf.WriteString(`</cp:coreProperties>`)
	return buf.Bytes()
}

func appPropsXML() []byte {
	return []byte(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Microsoft Office Word</Application>
  <DocSecurity>0</DocSecurity>
  <ScaleCrop>false</ScaleCrop>
  <Company></Company>
  <LinksUpToDate>false</LinksUpToDate>
  <SharedDoc>false</SharedDoc>
  <HyperlinksChanged>false</HyperlinksChanged>
  <AppVersion>16.0000</AppVersion>
</Properties>`)
}

func stylesXML() []byte {
	return []byte(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="` + wNS + `">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="` + bodyFont + `" w:hAnsi="` + bodyFont + `" w:eastAsia="` + bodyFont + `" w:cs="` + bodyFont + `"/>
        <w:sz w:val="22"/>
        <w:szCs w:val="22"/>
      </w:rPr>
    </w:rPrDefault>
    <w:pPrDefault>
      <w:pPr>
        <w:spacing w:before="0" w:after="15" w:line="240" w:lineRule="auto"/>
      </w:pPr>
    </w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:pPr>
      <w:spacing w:before="0" w:after="15" w:line="240" w:lineRule="auto"/>
    </w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="` + bodyFont + `" w:hAnsi="` + bodyFont + `" w:eastAsia="` + bodyFont + `" w:cs="` + bodyFont + `"/>
      <w:sz w:val="22"/>
      <w:szCs w:val="22"/>
    </w:rPr>
  </w:style>
</w:styles>`)
}

func documentXML(blocks []block) []byte {
	var buf bytes.Buffer
	buf.WriteString(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` + "\n")
	buf.WriteString(`<w:document xmlns:w="` + wNS + `" xmlns:r="` + rNS + `">` + "\n")
	buf.WriteString("  <w:body>\n")
	for _, b := range blocks {
		switch b.kind {
		case blockParagraph:
			buf.WriteString(renderParagraph(b.text, 0, false, 0, 0))
		case blockHeading:
			buf.WriteString(renderHeading(b.level, b.text))
		case blockBullet:
			buf.WriteString(renderBullet(b.text))
		case blockSpacer:
			buf.WriteString(renderSpacer())
		case blockPageBreak:
			buf.WriteString(renderPageBreak())
		}
	}
	buf.WriteString(renderSectionPr())
	buf.WriteString("  </w:body>\n")
	buf.WriteString(`</w:document>`)
	return buf.Bytes()
}

func renderHeading(level int, text string) string {
	size := heading3SizePt
	before := 160
	after := 60
	if level == 1 {
		size = heading1SizePt
		before, after = 80, 120
	} else if level == 2 {
		size = heading2SizePt
		before, after = 60, 80
	}
	return renderParagraph(text, size, true, before, after)
}

func renderBullet(text string) string {
	inline := parseInline(text)
	var buf bytes.Buffer
	buf.WriteString("    <w:p>\n")
	buf.WriteString("      <w:pPr><w:spacing w:before=\"0\" w:after=\"15\" w:line=\"240\" w:lineRule=\"auto\"/><w:ind w:left=\"360\" w:hanging=\"220\"/></w:pPr>\n")
	buf.WriteString(renderRun("• ", false, false, bodySizePt))
	for _, r := range inline {
		buf.WriteString(renderRun(r.text, r.bold, r.italic, bodySizePt))
	}
	buf.WriteString("    </w:p>\n")
	return buf.String()
}

func renderParagraph(text string, sizePt int, bold bool, beforeTwips, afterTwips int) string {
	inline := parseInline(text)
	if sizePt == 0 {
		sizePt = bodySizePt
	}
	if beforeTwips < 0 {
		beforeTwips = 0
	}
	if afterTwips < 0 {
		afterTwips = 0
	}
	var buf bytes.Buffer
	buf.WriteString("    <w:p>\n")
	buf.WriteString("      <w:pPr><w:spacing w:before=\"")
	buf.WriteString(strconv.Itoa(beforeTwips))
	buf.WriteString("\" w:after=\"")
	buf.WriteString(strconv.Itoa(afterTwips))
	buf.WriteString("\" w:line=\"240\" w:lineRule=\"auto\"/></w:pPr>\n")
	for _, r := range inline {
		buf.WriteString(renderRun(r.text, bold || r.bold, r.italic, sizePt))
	}
	buf.WriteString("    </w:p>\n")
	return buf.String()
}

func renderSpacer() string {
	return "    <w:p><w:pPr><w:spacing w:before=\"0\" w:after=\"0\" w:line=\"240\" w:lineRule=\"auto\"/></w:pPr></w:p>\n"
}

func renderPageBreak() string {
	return "    <w:p><w:r><w:br w:type=\"page\"/></w:r></w:p>\n"
}

func renderSectionPr() string {
	return fmt.Sprintf(`    <w:sectPr>
      <w:pgSz w:w="%d" w:h="%d"/>
      <w:pgMar w:top="%d" w:right="%d" w:bottom="%d" w:left="%d" w:header="0" w:footer="0" w:gutter="0"/>
    </w:sectPr>
`, pageWidthTwips, pageHeightTwips, topMarginTwips, rightMarginTwips, bottomMarginTwips, leftMarginTwips)
}

func renderRun(text string, bold, italic bool, sizePt int) string {
	if text == "" {
		return ""
	}
	if sizePt == 0 {
		sizePt = bodySizePt
	}
	var buf bytes.Buffer
	buf.WriteString("      <w:r><w:rPr>")
	buf.WriteString(`<w:rFonts w:ascii="` + bodyFont + `" w:hAnsi="` + bodyFont + `" w:eastAsia="` + bodyFont + `" w:cs="` + bodyFont + `"/>`)
	buf.WriteString(`<w:sz w:val="` + strconv.Itoa(sizePt*2) + `"/><w:szCs w:val="` + strconv.Itoa(sizePt*2) + `"/>`)
	if bold {
		buf.WriteString("<w:b/><w:bCs/>")
	}
	if italic {
		buf.WriteString("<w:i/>")
	}
	buf.WriteString("</w:rPr><w:t")
	if strings.HasPrefix(text, " ") || strings.HasSuffix(text, " ") {
		buf.WriteString(` xml:space="preserve"`)
	}
	buf.WriteString(">")
	xmlEscape(&buf, text)
	buf.WriteString("</w:t></w:r>\n")
	return buf.String()
}

func xmlNode(name, value string) string {
	var buf bytes.Buffer
	buf.WriteString("<" + name + ">")
	xmlEscape(&buf, value)
	buf.WriteString("</" + name + ">\n")
	return buf.String()
}

func xmlTypedNode(name, value string) string {
	var buf bytes.Buffer
	buf.WriteString("<" + name + ` xsi:type="dcterms:W3CDTF">`)
	xmlEscape(&buf, value)
	buf.WriteString("</" + name + ">\n")
	return buf.String()
}

func xmlEscape(w io.Writer, s string) {
	var b bytes.Buffer
	_ = xml.EscapeText(&b, []byte(s))
	_, _ = io.Copy(w, &b)
}

func extractDocxText(path string) (string, error) {
	zf, err := zip.OpenReader(path)
	if err != nil {
		return "", err
	}
	defer zf.Close()

	var document []byte
	for _, f := range zf.File {
		if f.Name == "word/document.xml" {
			rc, err := f.Open()
			if err != nil {
				return "", err
			}
			defer rc.Close()
			document, err = io.ReadAll(rc)
			if err != nil {
				return "", err
			}
			break
		}
	}
	if len(document) == 0 {
		return "", fmt.Errorf("word/document.xml not found in %s", path)
	}

	var root xmlNodeReader
	if err := xml.Unmarshal(document, &root); err != nil {
		return "", err
	}
	return root.extract(), nil
}

type xmlNodeReader struct {
	XMLName xml.Name
	Attrs   []xml.Attr      `xml:",any,attr"`
	Nodes   []xmlNodeReader `xml:",any"`
	Text    string          `xml:",chardata"`
}

func (n xmlNodeReader) extract() string {
	body := findNode(n, wNS, "body")
	if body == nil {
		return ""
	}
	var parts []string
	for _, child := range body.Nodes {
		switch child.XMLName.Space + ":" + child.XMLName.Local {
		case wNS + ":p":
			if text := extractParagraph(child); text != "" {
				parts = append(parts, text)
			} else {
				parts = append(parts, "")
			}
		case wNS + ":tbl":
			if text := extractTable(child); text != "" {
				parts = append(parts, text)
			}
		}
	}
	return strings.Join(parts, "\n\n")
}

func findNode(n xmlNodeReader, space, local string) *xmlNodeReader {
	if n.XMLName.Space == space && n.XMLName.Local == local {
		return &n
	}
	for i := range n.Nodes {
		if found := findNode(n.Nodes[i], space, local); found != nil {
			return found
		}
	}
	return nil
}

func extractParagraph(n xmlNodeReader) string {
	var parts []string
	var walk func(xmlNodeReader)
	walk = func(node xmlNodeReader) {
		switch node.XMLName.Space + ":" + node.XMLName.Local {
		case wNS + ":t":
			parts = append(parts, node.Text)
		case wNS + ":tab":
			parts = append(parts, "\t")
		case wNS + ":br":
			parts = append(parts, "\n")
		case wNS + ":drawing":
			// ignore images for text comparison
		default:
			for _, child := range node.Nodes {
				walk(child)
			}
		}
	}
	walk(n)
	return strings.Join(parts, "")
}

func extractTable(n xmlNodeReader) string {
	var rows []string
	for _, tr := range n.Nodes {
		if tr.XMLName.Space != wNS || tr.XMLName.Local != "tr" {
			continue
		}
		var cells []string
		for _, tc := range tr.Nodes {
			if tc.XMLName.Space != wNS || tc.XMLName.Local != "tc" {
				continue
			}
			var cellParts []string
			for _, child := range tc.Nodes {
				if child.XMLName.Space == wNS && child.XMLName.Local == "p" {
					if text := strings.TrimSpace(extractParagraph(child)); text != "" {
						cellParts = append(cellParts, text)
					}
				} else if child.XMLName.Space == wNS && child.XMLName.Local == "tbl" {
					if text := strings.TrimSpace(extractTable(child)); text != "" {
						cellParts = append(cellParts, text)
					}
				}
			}
			cells = append(cells, strings.Join(cellParts, " "))
		}
		rows = append(rows, strings.Join(cells, "\t"))
	}
	return strings.Join(rows, "\n")
}

func normalizeSource(text string) string {
	lines := strings.Split(strings.ReplaceAll(text, "\r\n", "\n"), "\n")
	var parts []string
	for _, raw := range lines {
		line := strings.TrimSpace(raw)
		if line == "" {
			continue
		}
		if isPageBreak(line) || line == "---" || line == "***" || line == "___" {
			continue
		}
		if level, headingText, ok := parseHeading(line); ok {
			_ = level
			line = headingText
		} else if bulletText, ok := parseBullet(line); ok {
			line = bulletText
		} else {
			line = numberPrefix.ReplaceAllString(line, "")
		}
		line = strings.ReplaceAll(line, "**", "")
		line = strings.ReplaceAll(line, "*", "")
		line = strings.ReplaceAll(line, "`", "")
		line = strings.ReplaceAll(line, "[", "")
		line = strings.ReplaceAll(line, "]", "")
		line = strings.ReplaceAll(line, "(", "")
		line = strings.ReplaceAll(line, ")", "")
		line = whitespace.ReplaceAllString(line, " ")
		parts = append(parts, strings.TrimSpace(line))
	}
	joined := strings.Join(parts, " ")
	joined = strings.ReplaceAll(joined, "•", "-")
	joined = strings.ReplaceAll(joined, "–", "-")
	joined = strings.ReplaceAll(joined, "—", "-")
	joined = strings.ReplaceAll(joined, "’", "'")
	joined = strings.ReplaceAll(joined, "“", `"`)
	joined = strings.ReplaceAll(joined, "”", `"`)
	joined = whitespace.ReplaceAllString(joined, " ")
	return canonicalizeComparison(joined)
}

func normalizeExtracted(text string) string {
	text = strings.ReplaceAll(text, "\f", "\n")
	text = strings.ReplaceAll(text, "’", "'")
	text = strings.ReplaceAll(text, "“", `"`)
	text = strings.ReplaceAll(text, "”", `"`)
	text = strings.ReplaceAll(text, "–", "-")
	text = strings.ReplaceAll(text, "—", "-")
	text = strings.ReplaceAll(text, "•", "-")
	lines := strings.Split(text, "\n")
	var parts []string
	for _, raw := range lines {
		line := strings.TrimSpace(raw)
		if line == "" {
			continue
		}
		if strings.EqualFold(line, "page break") {
			continue
		}
		line = bulletPrefix.ReplaceAllString(line, "")
		line = numberPrefix.ReplaceAllString(line, "")
		line = whitespace.ReplaceAllString(line, " ")
		parts = append(parts, line)
	}
	return canonicalizeComparison(strings.TrimSpace(strings.Join(parts, " ")))
}

func canonicalizeComparison(text string) string {
	var buf strings.Builder
	lastSpace := true
	for _, r := range text {
		switch {
		case unicode.IsLetter(r) || unicode.IsDigit(r):
			buf.WriteRune(unicode.ToLower(r))
			lastSpace = false
		case r == '$' || r == '%' || r == '+':
			buf.WriteRune(r)
			lastSpace = false
		default:
			if !lastSpace {
				buf.WriteByte(' ')
				lastSpace = true
			}
		}
	}
	return strings.TrimSpace(whitespace.ReplaceAllString(buf.String(), " "))
}

func excerpt(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}

func hasMetric(text string) bool {
	for _, token := range []string{"%", "$", "+", "x", "X", "minute", "minutes", "hour", "hours", "week", "weeks", "month", "months", "year", "years"} {
		if strings.Contains(strings.ToLower(text), strings.ToLower(token)) {
			return true
		}
	}
	for _, ch := range text {
		if ch >= '0' && ch <= '9' {
			return true
		}
	}
	return false
}

func firstWord(text string) string {
	fields := strings.Fields(strings.TrimSpace(text))
	if len(fields) == 0 {
		return ""
	}
	word := strings.ToLower(strings.Trim(fields[0], "-•*,:;()[]{}"))
	if len(word) > 24 {
		word = word[:24]
	}
	return word
}

func sortedCopy(tags []string) []string {
	out := append([]string(nil), tags...)
	sort.Strings(out)
	return out
}
