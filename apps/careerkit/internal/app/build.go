package app

import (
	"flag"
	"fmt"

	"github.com/ponti-studios/toolbox/apps/careerkit/internal/resumedocx"
)

func (a *App) runBuild(args []string) int {
	fs := flag.NewFlagSet("build", flag.ContinueOnError)
	fs.SetOutput(a.stderr)

	input := fs.String("input", "", "source Markdown file")
	output := fs.String("output", "", "output DOCX file")
	verify := fs.Bool("verify", false, "verify text extraction after render")
	title := fs.String("title", "", "document title")
	author := fs.String("author", "", "document author")
	creator := fs.String("creator", "", "document creator")
	subject := fs.String("subject", "", "document subject")
	tags := fs.String("tags", "resume", "comma-separated core-property tags")
	if err := fs.Parse(args); err != nil {
		return 2
	}

	path := firstPositional(fs.Args(), *input)
	if path == "" {
		fmt.Fprintln(a.stderr, "build requires an input file")
		fs.Usage()
		return 2
	}
	if *output == "" {
		output = ptr(defaultOutput(path))
	}

	opts := resumedocx.Options{
		Title:   *title,
		Author:  *author,
		Creator: *creator,
		Subject: *subject,
		Tags:    parseTags(*tags),
	}

	if err := resumedocx.Build(path, *output, opts); err != nil {
		fmt.Fprintf(a.stderr, "build failed: %v\n", err)
		return 1
	}
	fmt.Fprintf(a.stdout, "built %s -> %s\n", path, *output)

	if *verify {
		if err := resumedocx.Verify(path, *output); err != nil {
			fmt.Fprintf(a.stderr, "verify failed: %v\n", err)
			return 1
		}
		fmt.Fprintln(a.stdout, "verify passed")
	}

	return 0
}
