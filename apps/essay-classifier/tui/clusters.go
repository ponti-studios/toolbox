package tui

import (
	"fmt"
	"sort"

	"github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

type ClustersModel struct {
	results         []ClusterResult
	fps             []Fingerprint
	clusterMembers  map[int][]Fingerprint
	selectedCluster int
	selectedIndex   int
	quitting        bool
}

func NewClustersModel() ClustersModel {
	return ClustersModel{
		selectedCluster: 0,
		selectedIndex:   0,
		clusterMembers:  make(map[int][]Fingerprint),
	}
}

func (m ClustersModel) Init() tea.Cmd {
	return nil
}

func (m ClustersModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case ClustersLoadedMsg:
		m.results = msg.Results
		m.fps = msg.Fingerprints
		m.clusterMembers = msg.ClusterMembers
	case tea.KeyMsg:
		switch msg.String() {
		case "ctrl+c", "q":
			m.quitting = true
			return m, tea.Quit
		case "j", "down":
			if len(m.clusterKeys()) > 0 {
				cid := m.clusterKeys()[m.selectedCluster]
				if m.selectedIndex < len(m.clusterMembers[cid])-1 {
					m.selectedIndex++
				}
			}
		case "k", "up":
			if m.selectedIndex > 0 {
				m.selectedIndex--
			}
		case "tab":
			m.selectedCluster = (m.selectedCluster + 1) % len(m.clusterKeys())
			m.selectedIndex = 0
		case "right":
			if len(m.clusterKeys()) > 0 {
				cid := m.clusterKeys()[m.selectedCluster]
				if m.selectedIndex < len(m.clusterMembers[cid])-1 {
					m.selectedIndex++
				}
			}
		case "left":
			if m.selectedIndex > 0 {
				m.selectedIndex--
			}
		}
	}
	return m, nil
}

func (m ClustersModel) clusterKeys() []int {
	var keys []int
	for k := range m.clusterMembers {
		keys = append(keys, k)
	}
	sort.Ints(keys)
	return keys
}

func (m ClustersModel) View() string {
	s := TitleStyle.Render("Pass 3: Clusters") + "\n\n"

	keys := m.clusterKeys()
	if len(keys) == 0 {
		s += DimStyle.Render("No clusters yet. Run Pass 3 first.\n\n")
		s += DimStyle.Render("Navigation: Tab to continue | q to quit")
		return s
	}

	outliers := 0
	for _, r := range m.results {
		if r.IsOutlier {
			outliers++
		}
	}
	s += fmt.Sprintf("Clusters: %d | Outliers: %d\n\n", len(keys), outliers)

	for i, k := range keys {
		members := m.clusterMembers[k]
		sample := ""
		if len(members) > 0 {
			sample = truncate(members[0].Title, 38)
		}
		row := fmt.Sprintf("%-4d %-15s %-6d %s", k, DomainColor("cluster").Render("cluster"), len(members), sample)
		if i == m.selectedCluster {
			s += DimStyle.Render("> ") + row + "\n"
		} else {
			s += "  " + row + "\n"
		}

		if i == m.selectedCluster && len(members) > 0 {
			start := m.selectedIndex
			end := start + 3
			if end > len(members) {
				end = len(members)
			}
			for j := start; j < end; j++ {
				sel := "  "
				if j == m.selectedIndex {
					sel = DimStyle.Render(">>")
				}
				fp := members[j]
				title := truncate(fp.Title, 50)
				confStyle := lipgloss.NewStyle().Foreground(ConfidenceColor(0.85))
				s += fmt.Sprintf("%s   [%s] %s\n", sel, confStyle.Render("80%"), title)
			}
		}
	}

	if outliers > 0 {
		s += fmt.Sprintf("\n  %s: %d unclustered essays\n", DimStyle.Render("Outliers"), outliers)
	}

	s += "\n" + DimStyle.Render("j/k: navigate | Tab: switch cluster | q: quit")
	return s
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max-1] + "…"
}

type ClustersLoadedMsg struct {
	Results        []ClusterResult
	Fingerprints   []Fingerprint
	ClusterMembers map[int][]Fingerprint
}
