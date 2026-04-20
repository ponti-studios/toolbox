package pipeline

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"unicode"

	"github.com/charlesponti/cli-tools/essay-classifier/store"
	"github.com/charlesponti/cli-tools/essay-classifier/taxonomy"
)

type Fingerprint struct {
	ID             string   `json:"id"`
	Filename       string   `json:"filename"`
	RelativePath   string   `json:"relative_path"`
	Title          string   `json:"title"`
	Headings       []string `json:"headings"`
	IntroExcerpt   string   `json:"intro_excerpt"`
	ClosingExcerpt string   `json:"closing_excerpt"`
	Keywords       []string `json:"keywords"`
	WordCount      int      `json:"word_count"`
	PrimaryDomain  string   `json:"primary_domain,omitempty"`
}

const (
	MaxIntroWords   = 500
	MaxClosingWords = 200
)

func Pass1(dir string, st *store.State, threshold float64) ([]Fingerprint, error) {
	files, err := findMarkdownFiles(dir)
	if err != nil {
		return nil, fmt.Errorf("finding markdown files: %w", err)
	}

	records := make([]Fingerprint, 0, len(files))
	for i, f := range files {
		fp, err := extractFingerprint(f, dir, i)
		if err != nil {
			continue
		}
		records = append(records, fp)

		if i%50 == 0 && i > 0 {
			fd, _ := os.Create(st.Path("pass1_progress.tmp"))
			if fd != nil {
				fmt.Fprintf(fd, "%d/%d", i, len(files))
				fd.Close()
			}
		}
	}

	if err := st.Write("pass1_fingerprints.jsonl", records); err != nil {
		return records, fmt.Errorf("writing fingerprints: %w", err)
	}

	return records, nil
}

func findMarkdownFiles(dir string) ([]string, error) {
	var files []string
	err := filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if info.IsDir() {
			if info.Name() == ".essay-classifier" || info.Name() == ".git" {
				return filepath.SkipDir
			}
			return nil
		}
		if strings.HasSuffix(info.Name(), ".md") {
			files = append(files, path)
		}
		return nil
	})
	return files, err
}

func extractFingerprint(path, baseDir string, idx int) (Fingerprint, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return Fingerprint{}, err
	}

	content := string(data)
	rel, _ := filepath.Rel(baseDir, path)
	id := fmt.Sprintf("essay_%04d", idx)

	fp := Fingerprint{
		ID:           id,
		Filename:     filepath.Base(path),
		RelativePath: rel,
		WordCount:    countWords(content),
	}

	fp.Title = extractTitle(content)
	fp.Headings = extractHeadings(content)
	fp.IntroExcerpt = extractIntro(content)
	fp.ClosingExcerpt = extractClosing(content)
	fp.Keywords = extractKeywords(content)

	return fp, nil
}

func extractTitle(content string) string {
	scanner := bufio.NewScanner(strings.NewReader(content))
	scanner.Split(bufio.ScanLines)
	lineNum := 0
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		lineNum++
		if lineNum > 10 {
			break
		}
		if line == "" {
			continue
		}
		if strings.HasPrefix(line, "# ") {
			return strings.TrimPrefix(line, "# ")
		}
	}
	return ""
}

func extractHeadings(content string) []string {
	var headings []string
	lines := strings.Split(content, "\n")
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "## ") {
			headings = append(headings, strings.TrimPrefix(trimmed, "## "))
		}
	}
	return headings
}

func extractIntro(content string) string {
	var words int
	var sb strings.Builder
	lines := strings.Split(content, "\n")
	inCode := false
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "```") {
			inCode = !inCode
			continue
		}
		if inCode {
			continue
		}
		if strings.HasPrefix(trimmed, "#") {
			continue
		}
		if trimmed == "" {
			continue
		}
		w := countWords(line)
		if words+w > MaxIntroWords {
			remaining := MaxIntroWords - words
			if remaining > 10 {
				sb.WriteString(truncateToWords(line, remaining))
			}
			break
		}
		sb.WriteString(line)
		sb.WriteString(" ")
		words += w
	}
	return strings.TrimSpace(sb.String())
}

func extractClosing(content string) string {
	lines := strings.Split(content, "\n")
	var para []string
	var words int
	for i := len(lines) - 1; i >= 0; i-- {
		trimmed := strings.TrimSpace(lines[i])
		if trimmed == "" || strings.HasPrefix(trimmed, "```") || strings.HasPrefix(trimmed, "#") {
			continue
		}
		w := countWords(trimmed)
		if words+w > MaxClosingWords {
			break
		}
		para = append([]string{trimmed}, para...)
		words += w
	}
	return strings.TrimSpace(strings.Join(para, " "))
}

var stopWords = map[string]bool{
	"the": true, "a": true, "an": true, "and": true, "or": true, "but": true,
	"in": true, "on": true, "at": true, "to": true, "for": true, "of": true,
	"with": true, "by": true, "from": true, "as": true, "is": true, "was": true,
	"are": true, "were": true, "been": true, "be": true, "have": true, "has": true,
	"had": true, "do": true, "does": true, "did": true, "will": true, "would": true,
	"could": true, "should": true, "may": true, "might": true, "must": true,
	"shall": true, "can": true, "need": true, "it": true, "its": true,
	"this": true, "that": true, "these": true, "those": true,
	"i": true, "you": true, "he": true, "she": true, "we": true, "they": true,
	"my": true, "your": true, "his": true, "her": true, "our": true, "their": true,
	"what": true, "which": true, "who": true, "whom": true, "when": true,
	"where": true, "why": true, "how": true, "all": true, "each": true,
	"every": true, "both": true, "few": true, "more": true, "most": true,
	"other": true, "some": true, "such": true, "no": true, "nor": true,
	"not": true, "only": true, "own": true, "same": true, "so": true,
	"than": true, "too": true, "very": true, "just": true, "also": true,
}

func extractKeywords(content string) []string {
	tokenRe := regexp.MustCompile(`[a-zA-Z][a-zA-Z0-9-]{2,}`)
	tokens := tokenRe.FindAllString(content, -1)

	freq := make(map[string]int)
	for _, t := range tokens {
		lower := strings.ToLower(t)
		if stopWords[lower] {
			continue
		}
		if len(lower) < 4 {
			continue
		}
		freq[lower]++
	}

	type kv struct {
		k string
		v int
	}
	var sorted []kv
	for k, v := range freq {
		sorted = append(sorted, kv{k, v})
	}
	for i := 0; i < len(sorted); i++ {
		for j := i + 1; j < len(sorted); j++ {
			if sorted[j].v > sorted[i].v {
				sorted[i], sorted[j] = sorted[j], sorted[i]
			}
		}
	}

	var keywords []string
	for i := 0; i < len(sorted) && i < 20; i++ {
		if sorted[i].v >= 2 {
			keywords = append(keywords, sorted[i].k)
		}
	}
	return keywords
}

func countWords(s string) int {
	words := 0
	inWord := false
	for _, r := range s {
		if unicode.IsLetter(r) || unicode.IsDigit(r) || r == '-' {
			if !inWord && (unicode.IsLetter(r) || unicode.IsDigit(r)) {
				words++
				inWord = true
			}
		} else {
			inWord = false
		}
	}
	return words
}

func truncateToWords(s string, n int) string {
	var sb strings.Builder
	words := 0
	for _, r := range s {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			sb.WriteRune(r)
		} else {
			sb.WriteRune(r)
		}
		if unicode.IsSpace(r) {
			words++
			if words >= n {
				break
			}
		}
	}
	return sb.String()
}

func LoadFingerprints(st *store.State) ([]Fingerprint, error) {
	var records []Fingerprint
	err := st.Read("pass1_fingerprints.jsonl", &records)
	if err == io.EOF {
		return []Fingerprint{}, nil
	}
	if err != nil {
		return nil, err
	}
	return records, nil
}

func LoadFingerprintsFromJSONL(st *store.State) ([]Fingerprint, error) {
	f, err := os.Open(st.Path("pass1_fingerprints.jsonl"))
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var records []Fingerprint
	dec := json.NewDecoder(f)
	for dec.More() {
		var fp Fingerprint
		if err := dec.Decode(&fp); err != nil {
			continue
		}
		records = append(records, fp)
	}
	return records, nil
}

func AllowedDomains() []string {
	return taxonomy.DefaultTaxonomy
}
