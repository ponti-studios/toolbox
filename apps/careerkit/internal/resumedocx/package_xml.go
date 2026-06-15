package resumedocx

import (
	"bytes"
	"encoding/xml"
	"fmt"
	"io"
	"strconv"
	"strings"
	"time"
)

func contentTypesXML() []byte {
	var buf bytes.Buffer
	buf.WriteString(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` + "\n")
	buf.WriteString(`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` + "\n")
	buf.WriteString(`<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` + "\n")
	buf.WriteString(`<Default Extension="xml" ContentType="application/xml"/>` + "\n")
	buf.WriteString(`<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` + "\n")
	buf.WriteString(`<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` + "\n")
	buf.WriteString(`<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` + "\n")
	buf.WriteString(`<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>` + "\n")
	buf.WriteString(`</Types>`)
	return buf.Bytes()
}

func rootRelsXML() []byte {
	var buf bytes.Buffer
	buf.WriteString(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` + "\n")
	buf.WriteString(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` + "\n")
	buf.WriteString(`<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` + "\n")
	buf.WriteString(`<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` + "\n")
	buf.WriteString(`<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>` + "\n")
	buf.WriteString(`</Relationships>`)
	return buf.Bytes()
}

func documentRelsXML() []byte {
	var buf bytes.Buffer
	buf.WriteString(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` + "\n")
	buf.WriteString(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` + "\n")
	buf.WriteString(`<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` + "\n")
	buf.WriteString(`</Relationships>`)
	return buf.Bytes()
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
	var buf bytes.Buffer
	buf.WriteString(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` + "\n")
	buf.WriteString(`<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">` + "\n")
	buf.WriteString(`<Application>Microsoft Office Word</Application>` + "\n")
	buf.WriteString(`<DocSecurity>0</DocSecurity>` + "\n")
	buf.WriteString(`<ScaleCrop>false</ScaleCrop>` + "\n")
	buf.WriteString(`<Company></Company>` + "\n")
	buf.WriteString(`<LinksUpToDate>false</LinksUpToDate>` + "\n")
	buf.WriteString(`<SharedDoc>false</SharedDoc>` + "\n")
	buf.WriteString(`<HyperlinksChanged>false</HyperlinksChanged>` + "\n")
	buf.WriteString(`<AppVersion>16.0000</AppVersion>` + "\n")
	buf.WriteString(`</Properties>`)
	return buf.Bytes()
}

func getFonts(bodyFont string, fontSize int, options FontOptions) string {
	var asciiFont = `w:ascii="` + bodyFont + `"`
	var hAnsiFont = `w:hAnsi="` + bodyFont + `"`
	var eastAsiaFont = `w:eastAsia="` + bodyFont + `"`
	var csFont = `w:cs="` + bodyFont + `"`
	var fontSizeVal = strconv.Itoa(fontSize * 2)

	var buf bytes.Buffer
	buf.WriteString("<w:rPr>")
	buf.WriteString(`<w:rFonts ` + asciiFont + ` ` + hAnsiFont + ` ` + eastAsiaFont + ` ` + csFont + `/>`)
	buf.WriteString(`
		<w:sz w:val="` + fontSizeVal + `"/><w:szCs w:val="` + fontSizeVal + `"/>
	`)

	if options.IsBold {
		buf.WriteString(`<w:b/>`)
	}
	if options.IsItalic {
		buf.WriteString(`<w:i/>`)
	}
	if options.color != "" {
		buf.WriteString(`<w:color w:val="` + options.color + `"/>`)
	}
	if options.caps {
		buf.WriteString(`<w:caps/>`)
	}

	buf.WriteString("</w:rPr>")
	return buf.String()
}

func documentXML(blocks []block) []byte {
	var buf bytes.Buffer
	buf.WriteString(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` + "\n")
	buf.WriteString(`<w:document xmlns:w="` + wNS + `" xmlns:r="` + rNS + `">` + "\n")
	buf.WriteString(`<w:body>` + "\n")
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
	buf.WriteString(`</w:body>` + "\n")
	buf.WriteString(`</w:document>`)
	return buf.Bytes()
}

func renderHeading(level int, text string) string {
	size := heading3SizePt
	before := 160
	after := 60

	switch level {
	case 1:
		size = heading1SizePt
		before, after = 80, 120
	case 2:
		size = heading2SizePt
		before, after = 60, 80
	case 3:
		size = heading3SizePt
		before, after = 160, 60
	}

	return renderParagraph(text, size, true, before, after)
}

func renderBullet(text string) string {
	inline := parseInline(text)
	var buf bytes.Buffer
	buf.WriteString(`<w:p>` + "\n")
	buf.WriteString(`<w:pPr><w:spacing w:before="0" w:after="15" w:line="259" w:lineRule="auto"/><w:ind w:left="360" w:hanging="220"/></w:pPr>` + "\n")
	buf.WriteString(renderRun("• ", false, false, bodySizePt))
	for _, r := range inline {
		buf.WriteString(renderRun(r.text, r.bold, r.italic, bodySizePt))
	}
	buf.WriteString(`</w:p>` + "\n")
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
	buf.WriteString(`<w:p>` + "\n")
	buf.WriteString(`<w:pPr><w:spacing w:before="`)
	buf.WriteString(strconv.Itoa(beforeTwips))
	buf.WriteString(`" w:after="`)
	buf.WriteString(strconv.Itoa(afterTwips))
	buf.WriteString(`" w:line="259" w:lineRule="auto"/></w:pPr>` + "\n")
	for _, r := range inline {
		buf.WriteString(renderRun(r.text, bold || r.bold, r.italic, sizePt))
	}
	buf.WriteString(`</w:p>` + "\n")
	return buf.String()
}

func renderSpacer() string {
	return `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="259" w:lineRule="auto"/></w:pPr></w:p>` + "\n"
}

func renderPageBreak() string {
	return "    <w:p><w:r><w:br w:type=\"page\"/></w:r></w:p>\n"
}

func renderSectionPr() string {
	return fmt.Sprintf(`<w:sectPr>
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
	buf.WriteString(`<w:r><w:rPr>`)
	buf.WriteString(`<w:rFonts w:ascii="` + bodyFont + `" w:hAnsi="` + bodyFont + `" w:eastAsia="` + bodyFont + `" w:cs="` + bodyFont + `"/>`)
	buf.WriteString(`<w:sz w:val="` + strconv.Itoa(sizePt*2) + `"/><w:szCs w:val="` + strconv.Itoa(sizePt*2) + `"/>`)
	if bold {
		buf.WriteString(`<w:b/><w:bCs/>`)
	}
	if italic {
		buf.WriteString(`<w:i/>`)
	}
	buf.WriteString(`</w:rPr><w:t`)
	if strings.HasPrefix(text, " ") || strings.HasSuffix(text, " ") {
		buf.WriteString(` xml:space="preserve"`)
	}
	buf.WriteString(`>`)
	xmlEscape(&buf, text)
	buf.WriteString(`</w:t></w:r>` + "\n")
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
	var buf bytes.Buffer
	_ = xml.EscapeText(&buf, []byte(s))
	_, _ = io.Copy(w, &buf)
}
