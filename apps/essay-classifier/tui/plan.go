package tui

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

type PlanModel struct {
	plan     []map[string]any
	selected int
	quitting bool
	executed bool
}

func NewPlanModel() PlanModel {
	return PlanModel{
		selected: 0,
	}
}

func (m PlanModel) Init() tea.Cmd {
	return nil
}

func (m PlanModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case PlanLoadedMsg:
		m.plan = msg.Plan
	case tea.KeyMsg:
		switch msg.String() {
		case "ctrl+c", "q":
			m.quitting = true
			return m, tea.Quit
		case "j", "down":
			if m.selected < len(m.plan)-1 {
				m.selected++
			}
		case "k", "up":
			if m.selected > 0 {
				m.selected--
			}
		case "enter", "y":
			if !m.executed && len(m.plan) > 0 {
				m.executed = true
			}
		}
	}
	return m, nil
}

func (m PlanModel) View() string {
	s := TitleStyle.Render("Pass 5: Move Plan") + "\n\n"

	if len(m.plan) == 0 {
		s += DimStyle.Render("No move plan yet. Run Pass 5 first.\n\n")
		s += DimStyle.Render("Navigation: Tab to continue | q to quit")
		return s
	}

	domains := make(map[string]int)
	for _, e := range m.plan {
		domain := e["domain"].(string)
		domains[domain]++
	}

	s += fmt.Sprintf("%d files to move across %d domains:\n\n", len(m.plan), len(domains))

	for _, e := range m.plan {
		domain := e["domain"].(string)
		source := e["source"].(string)
		target := e["target"].(string)
		confidence := e["confidence"].(float64)

		shortSource := basename(source)
		shortTarget := basename(target)

		confStyle := lipgloss.NewStyle().Foreground(ConfidenceColor(confidence))
		confLabel := ConfidenceLabel(confidence)

		s += fmt.Sprintf("[%s] %s → %s\n",
			confStyle.Render(confLabel),
			DomainColor(domain).Render(domain),
			DimStyle.Render(shortSource))
		s += fmt.Sprintf("         %s\n", DimStyle.Render("→ "+shortTarget))
	}

	s += "\n"

	if m.executed {
		s += SuccessStyle.Render("✓ Move plan executed.\n")
	} else {
		s += InfoStyle.Render("Press Enter to execute move plan (or --execute flag in batch mode).\n")
	}

	s += "\n" + DimStyle.Render("j/k: scroll | Enter: execute | q: quit")
	return s
}

func basename(path string) string {
	parts := strings.Split(path, "/")
	return parts[len(parts)-1]
}

type PlanLoadedMsg struct {
	Plan []map[string]any
}
