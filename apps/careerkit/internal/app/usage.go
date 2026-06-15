package app

import "fmt"

func (a *App) usage() {
	fmt.Fprintln(a.stdout, appName+" - Markdown to DOCX resume tool")
	fmt.Fprintln(a.stdout)
	fmt.Fprintln(a.stdout, "Usage:")
	fmt.Fprintln(a.stdout, "  "+appName+" build [--input file.md] [--output file.docx] [--verify]")
	fmt.Fprintln(a.stdout, "  "+appName+" verify [--input file.md] [--docx file.docx]")
	fmt.Fprintln(a.stdout, "  "+appName+" review [--input file.md]")
	fmt.Fprintln(a.stdout)
	fmt.Fprintln(a.stdout, "If no command is supplied, a single path argument is treated as a build input.")
}
