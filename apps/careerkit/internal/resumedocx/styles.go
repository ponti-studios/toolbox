package resumedocx

import "bytes"

func stylesXML() []byte {
	var buf bytes.Buffer
	buf.WriteString(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` + "\n")
	buf.WriteString(`<w:styles xmlns:w="` + wNS + `">` + "\n")
	buf.WriteString(`<w:docDefaults>` + "\n")
	buf.WriteString(`<w:rPrDefault>` + "\n")
	buf.WriteString(getFonts(bodyFont, 11, FontOptions{}))
	buf.WriteString(`</w:rPrDefault>` + "\n")
	buf.WriteString(`<w:pPrDefault>` + "\n")
	buf.WriteString(`<w:pPr>` + "\n")
	buf.WriteString(`<w:spacing w:before="0" w:after="15" w:line="259" w:lineRule="auto"/>` + "\n")
	buf.WriteString(`</w:pPr>` + "\n")
	buf.WriteString(`</w:pPrDefault>` + "\n")
	buf.WriteString(`</w:docDefaults>` + "\n")

	buf.WriteString(`<w:style w:type="paragraph" w:default="1" w:styleId="Normal">` + "\n")
	buf.WriteString(`<w:name w:val="Normal"/>` + "\n")
	buf.WriteString(`<w:pPr>` + "\n")
	buf.WriteString(`<w:spacing w:before="0" w:after="15" w:line="259" w:lineRule="auto"/>` + "\n")
	buf.WriteString(`</w:pPr>` + "\n")
	buf.WriteString(getFonts(bodyFont, 11, FontOptions{}))
	buf.WriteString(`</w:style>` + "\n")

	buf.WriteString(`<w:style w:type="paragraph" w:styleId="Heading1">` + "\n")
	buf.WriteString(`<w:name w:val="Heading1"/>` + "\n")
	buf.WriteString(`<w:keepWithNext/>` + "\n")
	buf.WriteString(`<w:pPr>` + "\n")
	buf.WriteString(`<w:spacing w:before="0" w:after="200" w:line="259" w:lineRule="auto"/>` + "\n")
	buf.WriteString(`</w:pPr>` + "\n")
	buf.WriteString(getFonts(bodyFont, heading1SizePt, FontOptions{IsBold: true, color: accentColor}))
	buf.WriteString(`</w:style>` + "\n")

	buf.WriteString(`<w:style w:type="paragraph" w:styleId="Heading2">` + "\n")
	buf.WriteString(`<w:name w:val="Heading2"/>` + "\n")
	buf.WriteString(`<w:keepWithNext/>` + "\n")
	buf.WriteString(`<w:pPr>` + "\n")
	buf.WriteString(`<w:spacing w:before="240" w:after="60" w:line="259" w:lineRule="auto"/>` + "\n")
	buf.WriteString(`<w:pBdr><w:bottom w:val="single" w:sz="4" w:space="1" w:color="` + accentColor + `"/></w:pBdr>` + "\n")
	buf.WriteString(`</w:pPr>` + "\n")
	buf.WriteString(getFonts(bodyFont, heading2SizePt, FontOptions{IsBold: true, color: accentColor, caps: true}))
	buf.WriteString(`</w:style>` + "\n")

	buf.WriteString(`<w:style w:type="paragraph" w:styleId="Heading3">` + "\n")
	buf.WriteString(`<w:name w:val="Heading3"/>` + "\n")
	buf.WriteString(`<w:keepWithNext/>` + "\n")
	buf.WriteString(`<w:pPr>` + "\n")
	buf.WriteString(`<w:spacing w:before="160" w:after="60" w:line="259" w:lineRule="auto"/>` + "\n")
	buf.WriteString(`</w:pPr>` + "\n")
	buf.WriteString(getFonts(bodyFont, heading3SizePt, FontOptions{IsBold: true, IsItalic: true}))
	buf.WriteString(`</w:style>` + "\n")
	buf.WriteString(`</w:styles>`)
	return buf.Bytes()
}
