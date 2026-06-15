package resumedocx

import (
	"archive/zip"
	"encoding/xml"
	"fmt"
	"io"
	"os"
	"strings"
	"unicode"
)

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
