package tui

import (
	"fmt"

	"github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

type EscalationModel struct {
	classifications []Classification
	fps             []Fingerprint
	selectedIndex   int
	quitting        bool
}

func NewEscalationModel() EscalationModel {
	return EscalationModel{
		selectedIndex: 0,
	}
}

func (m EscalationModel) Init() tea.Cmd {
	return nil
}

func (m EscalationModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case EscalationLoadedMsg:
		m.classifications = msg.Classifications
		m.fps = msg.Fingerprints
	case tea.KeyMsg:
		switch msg.String() {
		case "ctrl+c", "q":
			m.quitting = true
			return m, tea.Quit
		case "j", "down":
			if m.selectedIndex < len(m.escalated())-1 {
				m.selectedIndex++
			}
		case "k", "up":
			if m.selectedIndex > 0 {
				m.selectedIndex--
			}
		case "r":
			m.selectedIndex = (m.selectedIndex + 1) % max(1, len(m.escalated()))
		}
	}
	return m, nil
}

func (m EscalationModel) escalated() []Classification {
	var esc []Classification
	for _, c := range m.classifications {
		if c.NeedsFullTextReview || c.Confidence < 0.75 {
			esc = append(esc, c)
		}
	}
	return esc
}

func (m EscalationModel) View() string {
	s := TitleStyle.Render("Pass 4: Escalation Review") + "\n\n"

	esc := m.escalated()
	if len(esc) == 0 {
		s += SuccessStyle.Render("No escalations. All classifications are confident (≥0.75).\n\n")
		s += DimStyle.Render("Navigation: Tab to continue | q to quit")
		return s
	}

	autoMove := 0
	review := 0
	for _, c := range m.classifications {
		if c.Confidence >= 0.90 {
			autoMove++
		} else {
			review++
		}
	}

	s += fmt.Sprintf("Auto-move (≥0.90): %s  |  Review needed: %s\n\n",
		SuccessStyle.Render(fmt.Sprintf("%d", autoMove)),
		InfoStyle.Render(fmt.Sprintf("%d", review)))

	s += fmt.Sprintf("Showing %d items requiring review:\n\n", len(esc))

	for i, c := range esc {
		sel := "  "
		if i == m.selectedIndex {
			sel = DimStyle.Render(">>")
		}

		confLabel := ConfidenceLabel(c.Confidence)

		reason := c.Reason
		if len(reason) > 60 {
			reason = reason[:59] + "…"
		}

		confStyle := lipgloss.NewStyle().Foreground(ConfidenceColor(c.Confidence))
		s += fmt.Sprintf("%s [%s] %-8s %s\n", sel, confStyle.Render(confLabel), DomainColor(c.PrimaryDomain).Render(c.PrimaryDomain), truncate(c.ID, 20))
		if i == m.selectedIndex && len(reason) > 0 {
			s += fmt.Sprintf("   %s\n", DimStyle.Render(reason))
		}
	}

	s += "\n" + DimStyle.Render("j/k: navigate | r: refresh | q: quit")
	return s
}

type EscalationLoadedMsg struct {
	Classifications []Classification
	Fingerprints    []Fingerprint
}
