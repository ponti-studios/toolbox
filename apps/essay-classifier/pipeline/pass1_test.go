package pipeline

import (
	"testing"
)

func TestExtractTitle(t *testing.T) {
	tests := []struct {
		name     string
		content  string
		expected string
	}{
		{
			name:     "h1 at beginning",
			content:  "# My Title\n\nSome content here.",
			expected: "My Title",
		},
		{
			name:     "h1 after blank line",
			content:  "\n\n# Another Title\n\nBody text.",
			expected: "Another Title",
		},
		{
			name:     "no h1 returns empty",
			content:  "Just some text without a heading.",
			expected: "",
		},
		{
			name:     "h2 not matched",
			content:  "## This is H2\n\n# Real Title",
			expected: "Real Title",
		},
		{
			name:     "empty lines skipped",
			content:  "\n\n#\n\nNo title",
			expected: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := extractTitle(tt.content)
			if got != tt.expected {
				t.Errorf("extractTitle() = %q, want %q", got, tt.expected)
			}
		})
	}
}

func TestExtractHeadings(t *testing.T) {
	tests := []struct {
		name     string
		content  string
		expected []string
	}{
		{
			name:     "multiple h2 headings",
			content:  "# Title\n\n## First Heading\n\n## Second Heading",
			expected: []string{"First Heading", "Second Heading"},
		},
		{
			name:     "h1 not included",
			content:  "# Title\n\n## Included\n\n### H3 Not Included",
			expected: []string{"Included"},
		},
		{
			name:     "no headings",
			content:  "Just plain text.",
			expected: nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := extractHeadings(tt.content)
			if len(got) != len(tt.expected) {
				t.Errorf("extractHeadings() got %d headings, want %d", len(got), len(tt.expected))
				return
			}
			for i, h := range got {
				if h != tt.expected[i] {
					t.Errorf("extractHeadings()[%d] = %q, want %q", i, h, tt.expected[i])
				}
			}
		})
	}
}

func TestCountWords(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected int
	}{
		{"simple sentence", "Hello world.", 2},
		{"empty string", "", 0},
		{"numbers count", "123 456", 2},
		{"punctuation only", "... ---", 0},
		{"mixed content", "The quick-brown fox.", 3},
		{"whitespace only", "   ", 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := countWords(tt.input)
			if got != tt.expected {
				t.Errorf("countWords(%q) = %d, want %d", tt.input, got, tt.expected)
			}
		})
	}
}

func TestExtractKeywords(t *testing.T) {
	content := "artificial intelligence machine learning artificial intelligence neural networks artificial"
	keywords := extractKeywords(content)

	if len(keywords) == 0 {
		t.Error("expected keywords but got none")
	}

	aiFound := false
	for _, k := range keywords {
		if k == "artificial" || k == "intelligence" || k == "machine" || k == "learning" || k == "neural" {
			aiFound = true
		}
	}
	if !aiFound {
		t.Error("expected AI-related keywords to be found")
	}

	stopWordFound := false
	for _, k := range keywords {
		if k == "the" || k == "and" || k == "or" {
			stopWordFound = true
		}
	}
	if stopWordFound {
		t.Error("stop words should not appear in keywords")
	}
}

func TestExtractIntro(t *testing.T) {
	content := "First paragraph of text.\n\nSecond paragraph here.\n\n## A Heading\n\nThird paragraph."
	intro := extractIntro(content)

	if intro == "" {
		t.Error("expected intro text but got empty string")
	}

	if len(intro) > MaxIntroWords*10 {
		t.Error("intro seems unreasonably long")
	}
}

func TestExtractClosing(t *testing.T) {
	content := "Some opening text.\n\n## Heading\n\nLast paragraph conclusion."
	closing := extractClosing(content)

	if closing == "" {
		t.Error("expected closing text but got empty string")
	}
}

func TestBatchFingerprints(t *testing.T) {
	fps := make([]Fingerprint, 150)
	for i := range fps {
		fps[i] = Fingerprint{ID: "test"}
	}

	batches := batchFingerprints(fps, 50)

	if len(batches) != 3 {
		t.Errorf("expected 3 batches, got %d", len(batches))
	}
	if len(batches[0]) != 50 {
		t.Errorf("first batch size = %d, want 50", len(batches[0]))
	}
	if len(batches[2]) != 50 {
		t.Errorf("last batch size = %d, want 50", len(batches[2]))
	}

	smallBatch := batchFingerprints(fps[:30], 50)
	if len(smallBatch) != 1 {
		t.Errorf("expected 1 batch for 30 items with size 50, got %d", len(smallBatch))
	}
	if len(smallBatch[0]) != 30 {
		t.Errorf("batch size = %d, want 30", len(smallBatch[0]))
	}
}
