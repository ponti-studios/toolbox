package app

import (
	"flag"
	"fmt"

	"github.com/ponti-studios/toolbox/apps/careerkit/internal/resumedocx"
)

func (a *App) runReview(args []string) int {
	fs := flag.NewFlagSet("review", flag.ContinueOnError)
	fs.SetOutput(a.stderr)

	input := fs.String("input", "", "source Markdown file")
	if err := fs.Parse(args); err != nil {
		return 2
	}

	path := firstPositional(fs.Args(), *input)
	if path == "" {
		fmt.Fprintln(a.stderr, "review requires an input file")
		fs.Usage()
		return 2
	}

	findings, err := resumedocx.Review(path)
	if err != nil {
		fmt.Fprintf(a.stderr, "review failed: %v\n", err)
		return 1
	}
	for _, finding := range findings {
		fmt.Fprintln(a.stdout, finding)
	}
	return 0
}
