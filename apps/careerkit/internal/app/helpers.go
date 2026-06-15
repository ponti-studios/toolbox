package app

import (
	"os"
	"path/filepath"
	"strings"
)

func parseTags(raw string) []string {
	parts := strings.Split(raw, ",")
	var tags []string
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part != "" {
			tags = append(tags, part)
		}
	}
	return tags
}

func firstPositional(args []string, fallback string) string {
	if fallback != "" {
		return fallback
	}
	if len(args) == 0 {
		return ""
	}
	if strings.HasPrefix(args[0], "-") {
		return ""
	}
	return args[0]
}

func skipFirst(args []string) []string {
	if len(args) <= 1 {
		return nil
	}
	return args[1:]
}

func defaultOutput(input string) string {
	ext := filepath.Ext(input)
	base := strings.TrimSuffix(input, ext)
	if ext == "" {
		return input + ".docx"
	}
	return base + ".docx"
}

func ptr[T any](v T) *T { return &v }

func looksLikePath(s string) bool {
	lower := strings.ToLower(s)
	return strings.Contains(s, string(os.PathSeparator)) ||
		strings.HasSuffix(lower, ".md") ||
		strings.HasSuffix(lower, ".markdown") ||
		strings.HasSuffix(lower, ".txt")
}
