package resumedocx

import (
	"fmt"
	"os"
	"strings"
)

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
