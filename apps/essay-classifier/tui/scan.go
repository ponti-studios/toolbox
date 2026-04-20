package tui

import (
	"fmt"

	"github.com/charmbracelet/bubbletea"
)

type ScanModel struct {
	totalFiles int
	doneFiles  int
	phase      string
	status     string
}

func NewScanModel() ScanModel {
	return ScanModel{
		totalFiles: 0,
		doneFiles:  0,
		phase:      "idle",
		status:     "Waiting for Pass 1 to start...",
	}
}

func (m ScanModel) Init() tea.Cmd {
	return nil
}

func (m ScanModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case ScanProgressMsg:
		m.totalFiles = msg.Total
		m.doneFiles = msg.Done
		m.phase = "scanning"
		m.status = fmt.Sprintf("Parsing file %d of %d", msg.Done, msg.Total)
	case ScanDoneMsg:
		m.doneFiles = m.totalFiles
		m.phase = "done"
		m.status = fmt.Sprintf("Done. Parsed %d essays.", msg.Count)
	}
	return m, nil
}

func (m ScanModel) View() string {
	s := TitleStyle.Render("Pass 1: Scan") + "\n\n"

	barWidth := 40
	if m.totalFiles > 0 {
		filled := (m.doneFiles * barWidth) / m.totalFiles
		bar := ""
		for i := 0; i < barWidth; i++ {
			if i < filled {
				bar += "█"
			} else {
				bar += "░"
			}
		}
		pct := (m.doneFiles * 100) / m.totalFiles
		s += fmt.Sprintf("[%s] %d%% (%d/%d)\n\n", bar, pct, m.doneFiles, m.totalFiles)
	} else {
		s += DimStyle.Render("[░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░] 0%% (0/0)\n\n")
	}

	s += InfoStyle.Render(m.status) + "\n\n"
	s += DimStyle.Render("Navigation: Tab to continue | q to quit")
	return s
}

type ScanProgressMsg struct {
	Done  int
	Total int
}

type ScanDoneMsg struct {
	Count int
}
