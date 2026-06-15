package resumedocx

import "strings"

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
