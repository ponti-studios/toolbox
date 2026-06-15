package app

import (
	"fmt"
	"io"
	"os"
)

const appName = "careerkit"

type App struct {
	stdout io.Writer
	stderr io.Writer
}

func New(stdout, stderr io.Writer) *App {
	if stdout == nil {
		stdout = io.Discard
	}
	if stderr == nil {
		stderr = io.Discard
	}
	return &App{
		stdout: stdout,
		stderr: stderr,
	}
}

func (a *App) Run(args []string) int {
	if len(args) == 0 {
		a.usage()
		return 2
	}

	switch args[0] {
	case "build", "render":
		return a.runBuild(args[1:])
	case "verify":
		return a.runVerify(args[1:])
	case "review":
		return a.runReview(args[1:])
	case "help", "-h", "--help":
		a.usage()
		return 0
	default:
		if looksLikePath(args[0]) {
			return a.runBuild(args)
		}
		fmt.Fprintf(a.stderr, "unknown command %q\n\n", args[0])
		a.usage()
		return 2
	}
}

func Main() {
	os.Exit(New(os.Stdout, os.Stderr).Run(os.Args[1:]))
}
