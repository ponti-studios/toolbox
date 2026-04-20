package tui

import (
	"github.com/charmbracelet/bubbletea"
)

type Screen int

const (
	ScreenHome Screen = iota
	ScreenScan
	ScreenClusters
	ScreenEscalation
	ScreenPlan
)

type AppModel struct {
	currentScreen Screen
	width         int
	height        int

	fps             []Fingerprint
	embeddings      []Embedding
	clusterResults  []ClusterResult
	classifications []Classification
	movePlan        []map[string]any

	scanModel       ScanModel
	clustersModel   ClustersModel
	escalationModel EscalationModel
	planModel       PlanModel
}

func NewAppModel() AppModel {
	return AppModel{
		currentScreen:   ScreenHome,
		scanModel:       NewScanModel(),
		clustersModel:   NewClustersModel(),
		escalationModel: NewEscalationModel(),
		planModel:       NewPlanModel(),
	}
}

func (m *AppModel) SetFingerprints(fps []Fingerprint)         { m.fps = fps }
func (m *AppModel) SetEmbeddings(embs []Embedding)            { m.embeddings = embs }
func (m *AppModel) SetClusterResults(results []ClusterResult) { m.clusterResults = results }
func (m *AppModel) SetClassifications(cls []Classification)   { m.classifications = cls }
func (m *AppModel) SetMovePlan(plan []map[string]any)         { m.movePlan = plan }

func (m AppModel) Init() tea.Cmd {
	return nil
}

func (m AppModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		return m, nil
	case tea.KeyMsg:
		switch msg.String() {
		case "ctrl+c", "q":
			return m, tea.Quit
		case "tab":
			if m.currentScreen < ScreenPlan {
				m.currentScreen++
			}
			return m, nil
		case "shift+tab":
			if m.currentScreen > ScreenHome {
				m.currentScreen--
			}
			return m, nil
		}
	}

	switch m.currentScreen {
	case ScreenScan:
		sm, cmd := m.scanModel.Update(msg)
		if s, ok := sm.(ScanModel); ok {
			m.scanModel = s
		}
		return m, cmd
	case ScreenClusters:
		cm, cmd := m.clustersModel.Update(msg)
		if c, ok := cm.(ClustersModel); ok {
			m.clustersModel = c
		}
		return m, cmd
	case ScreenEscalation:
		em, cmd := m.escalationModel.Update(msg)
		if e, ok := em.(EscalationModel); ok {
			m.escalationModel = e
		}
		return m, cmd
	case ScreenPlan:
		pm, cmd := m.planModel.Update(msg)
		if p, ok := pm.(PlanModel); ok {
			m.planModel = p
		}
		return m, cmd
	}

	return m, nil
}

func (m AppModel) View() string {
	switch m.currentScreen {
	case ScreenHome:
		return m.homeView()
	case ScreenScan:
		return m.scanModel.View()
	case ScreenClusters:
		return m.clustersModel.View()
	case ScreenEscalation:
		return m.escalationModel.View()
	case ScreenPlan:
		return m.planModel.View()
	}
	return ""
}

func (m AppModel) homeView() string {
	s := TitleStyle.Render("Essay Classifier") + "\n\n"
	s += DimStyle.Render("A two-pass pipeline for classifying markdown essays.\n\n")
	s += "  [1] " + InfoStyle.Render("Scan") + "      — Extract semantic fingerprints from markdown files\n"
	s += "  [2] " + InfoStyle.Render("Embed") + "     — Generate vector embeddings via Ollama/OpenAI\n"
	s += "  [3] " + InfoStyle.Render("Cluster") + "   — Agglomerative clustering with gonum\n"
	s += "  [4] " + InfoStyle.Render("Classify") + "  — LLM batch classification with confidence scoring\n"
	s += "  [5] " + InfoStyle.Render("Plan") + "      — Generate and review move plan\n\n"
	s += DimStyle.Render("Navigation: Tab/Shift+Tab to move between screens\n")
	s += DimStyle.Render("Press q or Ctrl+C to quit\n\n")
	s += InfoStyle.Render("Ready. Press Tab to begin scanning.")
	return s
}
