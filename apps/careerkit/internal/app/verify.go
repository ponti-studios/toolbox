package app

import (
	"flag"
	"fmt"

	"github.com/ponti-studios/toolbox/apps/careerkit/internal/resumedocx"
)

func (a *App) runVerify(args []string) int {
	fs := flag.NewFlagSet("verify", flag.ContinueOnError)
	fs.SetOutput(a.stderr)

	input := fs.String("input", "", "source Markdown file")
	output := fs.String("docx", "", "DOCX file to compare")
	if err := fs.Parse(args); err != nil {
		return 2
	}

	path := firstPositional(fs.Args(), *input)
	docxPath := firstPositional(skipFirst(fs.Args()), *output)
	if path == "" || docxPath == "" {
		fmt.Fprintln(a.stderr, "verify requires both a source file and a DOCX file")
		fs.Usage()
		return 2
	}

	if err := resumedocx.Verify(path, docxPath); err != nil {
		fmt.Fprintf(a.stderr, "verify failed: %v\n", err)
		return 1
	}
	fmt.Fprintln(a.stdout, "verify passed")
	return 0
}
