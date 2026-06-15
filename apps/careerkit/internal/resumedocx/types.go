package resumedocx

import "regexp"

const (
	wNS   = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
	rNS   = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
	cpNS  = "http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
	dcNS  = "http://purl.org/dc/elements/1.1/"
	dtNS  = "http://purl.org/dc/terms/"
	xsiNS = "http://www.w3.org/2001/XMLSchema-instance"
	xmlNS = "http://www.w3.org/XML/1998/namespace"

	// Twips are 1/20 of a point (1/20 of 120 DPI)
	pageWidthTwips  = 12240
	pageHeightTwips = 15840

	topMarginTwips    = 720 // 0.5 in
	bottomMarginTwips = 720 // 0.5 in
	leftMarginTwips   = 864 // 0.6 in
	rightMarginTwips  = 864 // 0.6 in

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

type FontOptions struct {
	IsBold   bool
	IsItalic bool
	color    string
	caps     bool
}
