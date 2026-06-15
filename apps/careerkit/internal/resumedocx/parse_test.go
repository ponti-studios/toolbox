package resumedocx

import "testing"

func TestParseBlocksRecognizesMarkdownStructure(t *testing.T) {
	input := "# Summary\n\n- shipped feature\n\n<!-- pagebreak -->\n\nBody copy"

	blocks := parseBlocks(input)
	if len(blocks) != 7 {
		t.Fatalf("expected 7 blocks, got %d", len(blocks))
	}
	if blocks[0].kind != blockHeading || blocks[0].text != "Summary" {
		t.Fatalf("unexpected heading block: %#v", blocks[0])
	}
	if blocks[2].kind != blockBullet || blocks[2].text != "shipped feature" {
		t.Fatalf("unexpected bullet block: %#v", blocks[2])
	}
	if blocks[4].kind != blockPageBreak {
		t.Fatalf("expected page break block, got %#v", blocks[4])
	}
	if blocks[6].kind != blockParagraph || blocks[6].text != "Body copy" {
		t.Fatalf("unexpected paragraph block: %#v", blocks[6])
	}
}

func TestParseInlineMergesAdjacentRuns(t *testing.T) {
	runs := parseInline("Hello **bold** world")
	if len(runs) != 3 {
		t.Fatalf("expected 3 runs, got %d", len(runs))
	}
	if runs[1].text != "bold" || !runs[1].bold {
		t.Fatalf("unexpected bold run: %#v", runs[1])
	}
}
