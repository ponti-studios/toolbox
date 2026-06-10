package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/ponti-studios/toolbox/apps/resume/internal/resumedocx"
)

func main() {
	os.Exit(run(os.Args[1:]))
}

func run(args []string) int {
	if len(args) == 0 {
		usage()
		return 2
	}

	switch args[0] {
	case "build", "render":
		return runBuild(args[1:])
	case "verify":
		return runVerify(args[1:])
	case "review":
		return runReview(args[1:])
	case "help", "-h", "--help":
		usage()
		return 0
	default:
		if looksLikePath(args[0]) {
			return runBuild(args)
		}
		fmt.Fprintf(os.Stderr, "unknown command %q\n\n", args[0])
		usage()
		return 2
	}
}

func runBuild(args []string) int {
	fs := flag.NewFlagSet("build", flag.ContinueOnError)
	fs.SetOutput(os.Stderr)
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
		fmt.Fprintln(os.Stderr, "build requires an input file")
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
		fmt.Fprintf(os.Stderr, "build failed: %v\n", err)
		return 1
	}
	fmt.Printf("built %s -> %s\n", path, *output)
	if *verify {
		if err := resumedocx.Verify(path, *output); err != nil {
			fmt.Fprintf(os.Stderr, "verify failed: %v\n", err)
			return 1
		}
		fmt.Println("verify passed")
	}
	return 0
}

func runVerify(args []string) int {
	fs := flag.NewFlagSet("verify", flag.ContinueOnError)
	fs.SetOutput(os.Stderr)
	input := fs.String("input", "", "source Markdown file")
	output := fs.String("docx", "", "DOCX file to compare")
	if err := fs.Parse(args); err != nil {
		return 2
	}

	path := firstPositional(fs.Args(), *input)
	docxPath := firstPositional(skipFirst(fs.Args()), *output)
	if path == "" || docxPath == "" {
		fmt.Fprintln(os.Stderr, "verify requires both a source file and a DOCX file")
		fs.Usage()
		return 2
	}

	if err := resumedocx.Verify(path, docxPath); err != nil {
		fmt.Fprintf(os.Stderr, "verify failed: %v\n", err)
		return 1
	}
	fmt.Println("verify passed")
	return 0
}

func runReview(args []string) int {
	fs := flag.NewFlagSet("review", flag.ContinueOnError)
	fs.SetOutput(os.Stderr)
	input := fs.String("input", "", "source Markdown file")
	if err := fs.Parse(args); err != nil {
		return 2
	}

	path := firstPositional(fs.Args(), *input)
	if path == "" {
		fmt.Fprintln(os.Stderr, "review requires an input file")
		fs.Usage()
		return 2
	}

	findings, err := resumedocx.Review(path)
	if err != nil {
		fmt.Fprintf(os.Stderr, "review failed: %v\n", err)
		return 1
	}
	for _, finding := range findings {
		fmt.Println(finding)
	}
	return 0
}

func usage() {
	fmt.Println("resume - Markdown to DOCX resume tool")
	fmt.Println()
	fmt.Println("Usage:")
	fmt.Println("  resume build [--input file.md] [--output file.docx] [--verify]")
	fmt.Println("  resume verify [--input file.md] [--docx file.docx]")
	fmt.Println("  resume review [--input file.md]")
	fmt.Println()
	fmt.Println("If no command is supplied, a single path argument is treated as a build input.")
}

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
	return strings.Contains(s, string(os.PathSeparator)) || strings.HasSuffix(strings.ToLower(s), ".md") || strings.HasSuffix(strings.ToLower(s), ".markdown") || strings.HasSuffix(strings.ToLower(s), ".txt")
}
