package app

import (
	"fmt"
	"os"
	"time"

	"github.com/charmbracelet/lipgloss"
)

var (
	tsStyle        = lipgloss.NewStyle().Foreground(lipgloss.Color("244"))
	infoStyle      = lipgloss.NewStyle().Foreground(lipgloss.Color("86"))
	warnStyle      = lipgloss.NewStyle().Foreground(lipgloss.Color("214"))
	errorStyle     = lipgloss.NewStyle().Foreground(lipgloss.Color("196")).Bold(true)
	accentStyle    = lipgloss.NewStyle().Foreground(lipgloss.Color("81")).Bold(true)
	countdownStyle = lipgloss.NewStyle().Bold(true)
)

func logInfo(format string, args ...any) {
	logWithStyle(infoStyle, format, args...)
}

func logWarn(format string, args ...any) {
	logWithStyle(warnStyle, format, args...)
}

func logError(format string, args ...any) {
	logWithStyle(errorStyle, format, args...)
}

func logWithStyle(style lipgloss.Style, format string, args ...any) {
	msg := fmt.Sprintf(format, args...)
	timestamp := tsStyle.Render(time.Now().Format("2006-01-02 15:04:05"))
	prefix := style.Render("[xkit]")
	fmt.Fprintf(os.Stderr, "%s %s %s\n", timestamp, prefix, msg)
}
