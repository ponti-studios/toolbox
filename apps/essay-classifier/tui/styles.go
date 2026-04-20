package tui

import (
	"fmt"
	"os"
	"strconv"

	"github.com/charmbracelet/bubbles/table"
	"github.com/charmbracelet/lipgloss"
)

var (
	TitleStyle   = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("205"))
	DimStyle     = lipgloss.NewStyle().Foreground(lipgloss.Color("240"))
	SuccessStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("76"))
	ErrorStyle   = lipgloss.NewStyle().Foreground(lipgloss.Color("204"))
	InfoStyle    = lipgloss.NewStyle().Foreground(lipgloss.Color("75"))
	DomainStyles = map[string]lipgloss.Style{
		"ai":          lipgloss.NewStyle().Foreground(lipgloss.Color("141")),
		"technology":  lipgloss.NewStyle().Foreground(lipgloss.Color("75")),
		"philosophy":  lipgloss.NewStyle().Foreground(lipgloss.Color("221")),
		"politics":    lipgloss.NewStyle().Foreground(lipgloss.Color("204")),
		"economics":   lipgloss.NewStyle().Foreground(lipgloss.Color("79")),
		"culture":     lipgloss.NewStyle().Foreground(lipgloss.Color("213")),
		"science":     lipgloss.NewStyle().Foreground(lipgloss.Color("117")),
		"history":     lipgloss.NewStyle().Foreground(lipgloss.Color("94")),
		"design":      lipgloss.NewStyle().Foreground(lipgloss.Color("219")),
		"business":    lipgloss.NewStyle().Foreground(lipgloss.Color("76")),
		"product":     lipgloss.NewStyle().Foreground(lipgloss.Color("141")),
		"engineering": lipgloss.NewStyle().Foreground(lipgloss.Color("81")),
		"writing":     lipgloss.NewStyle().Foreground(lipgloss.Color("223")),
		"personal":    lipgloss.NewStyle().Foreground(lipgloss.Color("225")),
		"health":      lipgloss.NewStyle().Foreground(lipgloss.Color("82")),
		"education":   lipgloss.NewStyle().Foreground(lipgloss.Color("74")),
		"ethics":      lipgloss.NewStyle().Foreground(lipgloss.Color("214")),
		"religion":    lipgloss.NewStyle().Foreground(lipgloss.Color("228")),
		"psychology":  lipgloss.NewStyle().Foreground(lipgloss.Color("183")),
		"sociology":   lipgloss.NewStyle().Foreground(lipgloss.Color("210")),
		"law":         lipgloss.NewStyle().Foreground(lipgloss.Color("147")),
		"media":       lipgloss.NewStyle().Foreground(lipgloss.Color("139")),
		"art":         lipgloss.NewStyle().Foreground(lipgloss.Color("205")),
		"environment": lipgloss.NewStyle().Foreground(lipgloss.Color("71")),
		"career":      lipgloss.NewStyle().Foreground(lipgloss.Color("222")),
		"unclear":     lipgloss.NewStyle().Foreground(lipgloss.Color("240")),
	}
)

func DomainColor(domain string) lipgloss.Style {
	if s, ok := DomainStyles[domain]; ok {
		return s
	}
	return lipgloss.NewStyle().Foreground(lipgloss.Color("255"))
}

func ConfidenceColor(conf float64) lipgloss.Color {
	if conf >= 0.90 {
		return lipgloss.Color("76")
	}
	if conf >= 0.75 {
		return lipgloss.Color("221")
	}
	return lipgloss.Color("204")
}

func ConfidenceLabel(conf float64) string {
	return fmt.Sprintf("%.0f%%", conf*100)
}

func MakeTable(columns []string, rows [][]string) table.Model {
	cols := make([]table.Column, len(columns))
	for i, c := range columns {
		cols[i] = table.Column{Title: c, Width: min(30, max(10, len(c)+2))}
	}
	t := table.New(table.WithColumns(cols))
	ts := table.Styles{
		Header: lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("240")),
		Cell:   lipgloss.NewStyle().Foreground(lipgloss.Color("250")),
	}
	t.SetStyles(ts)
	return t
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func ParseFloat(s string) float64 {
	f, _ := strconv.ParseFloat(s, 64)
	return f
}

func FileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}
