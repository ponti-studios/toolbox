package main

import (
	"flag"
	"fmt"
	"os"
	"strings"

	"github.com/charlesponti/cli-tools/essay-classifier/pipeline"
	"github.com/charlesponti/cli-tools/essay-classifier/store"
	"github.com/charlesponti/cli-tools/essay-classifier/tui"

	tea "github.com/charmbracelet/bubbletea"
)

var (
	flagDir              = flag.String("dir", "", "Directory containing markdown essays (required)")
	flagYes              = flag.Bool("yes", false, "Skip all confirmations (batch mode)")
	flagExecute          = flag.Bool("execute", false, "Execute the move plan")
	flagTUI              = flag.Bool("tui", false, "Launch interactive TUI mode")
	flagResume           = flag.Bool("resume", false, "Resume from highest completed pass")
	flagFromPass         = flag.Int("from-pass", 0, "Resume from a specific pass (1-5)")
	flagThreshold        = flag.Float64("threshold", 0.75, "Confidence threshold for auto-move")
	flagLLM              = flag.String("llm", "ollama", "LLM provider: ollama or openai")
	flagAPIKey           = flag.String("api-key", "", "OpenAI API key (or set OPENAI_API_KEY env var)")
	flagBaseURL          = flag.String("base-url", "", "Base URL for LLM API")
	flagModel            = flag.String("model", "", "Model name")
	flagCSV              = flag.String("csv", "", "Export move plan to CSV")
	flagClusterThreshold = flag.Float64("cluster-threshold", 0.75, "Clustering distance threshold")
)

func main() {
	flag.Parse()

	if *flagDir == "" {
		dir := os.Getenv("ESSAY_DIR")
		if dir == "" {
			fmt.Fprintln(os.Stderr, "Error: --dir is required")
			flag.Usage()
			os.Exit(1)
		}
		*flagDir = dir
	}

	dir := *flagDir
	info, err := os.Stat(dir)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: directory %s: %v\n", dir, err)
		os.Exit(1)
	}
	if !info.IsDir() {
		fmt.Fprintf(os.Stderr, "Error: %s is not a directory\n", dir)
		os.Exit(1)
	}

	st := store.New(dir)
	if err := st.Ensure(); err != nil {
		fmt.Fprintf(os.Stderr, "Error: creating state directory: %v\n", err)
		os.Exit(1)
	}

	if *flagTUI {
		runTUI(dir, st)
		return
	}

	if apiKey := os.Getenv("OPENAI_API_KEY"); apiKey != "" && *flagAPIKey == "" {
		*flagAPIKey = apiKey
	}

	resumeFrom := *flagFromPass
	if *flagResume && resumeFrom == 0 {
		resumeFrom = st.HighestPass()
	}

	cfg := pipeline.ClusterConfig{
		Threshold:      *flagClusterThreshold,
		MinClusterSize: 2,
		LinkageMethod:  "average",
	}

	llmCfg := pipeline.NewLLMConfig(*flagLLM, *flagBaseURL, *flagAPIKey, *flagModel)

	if *flagExecute {
		runExecute(dir, st)
		return
	}

	if resumeFrom >= 5 {
		fmt.Println("Pipeline complete through Pass 4. Use --execute to apply move plan.")
		return
	}

	fmt.Printf("Essay Classifier — targeting: %s\n", dir)
	fmt.Printf("LLM: %s | Threshold: %.2f | Confidence threshold: %.2f\n", *flagLLM, *flagClusterThreshold, *flagThreshold)

	var fps []pipeline.Fingerprint
	var classifications []pipeline.Classification

	if resumeFrom < 1 {
		fmt.Println("\n[Pass 1] Extracting fingerprints...")
		var err error
		fps, err = pipeline.Pass1(dir, st, *flagThreshold)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Pass 1 failed: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("  Parsed %d essays\n", len(fps))
	} else {
		var err error
		fps, err = pipeline.LoadFingerprints(st)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Loading fingerprints: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("Loaded %d fingerprints from Pass 1\n", len(fps))
	}

	var embedder pipeline.Embedder
	switch *flagLLM {
	case "openai":
		embedder = pipeline.NewOpenAIEmbedder(*flagAPIKey, "")
	default:
		embedder = pipeline.DetectEmbedder()
	}
	if embedder == nil {
		fmt.Println("No embedder detected. Install Ollama or provide OpenAI API key.")
		os.Exit(1)
	}

	var embeddings []pipeline.Embedding
	var results []pipeline.ClusterResult
	var clusterMembers map[int][]pipeline.Fingerprint

	if resumeFrom < 2 {
		fmt.Printf("\n[Pass 2] Generating embeddings (using %s)...\n", *flagLLM)
		embeddings, err = pipeline.Pass2(fps, st, embedder)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Pass 2 failed: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("  Embedded %d essays\n", len(embeddings))
	} else {
		embeddings, err = pipeline.LoadEmbeddings(st)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Loading embeddings: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("Loaded %d embeddings from Pass 2\n", len(embeddings))
	}

	if resumeFrom < 3 {
		fmt.Println("\n[Pass 3] Clustering...")
		results, clusterMembers, err = pipeline.Pass3(embeddings, fps, st, cfg)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Pass 3 failed: %v\n", err)
			os.Exit(1)
		}
	} else {
		results, err = pipeline.LoadClusters(st)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Loading clusters: %v\n", err)
			os.Exit(1)
		}
		clusterMembers = make(map[int][]pipeline.Fingerprint)
		for _, r := range results {
			clusterMembers[r.ClusterID] = append(clusterMembers[r.ClusterID], fps[r.ClusterID])
		}
	}
	stats := pipeline.ClusterStats(results)
	fmt.Printf("  %s\n", stats)
	for cid, members := range clusterMembers {
		if len(members) > 0 {
			fmt.Printf("  Cluster %d: %d essays (%s)\n", cid, len(members), members[0].Title)
		}
	}

	if resumeFrom <= 4 {
		fmt.Println("\n[Pass 4] Classifying with LLM...")
		classifications, err = pipeline.Pass4(fps, st, llmCfg, *flagThreshold)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Pass 4 failed: %v\n", err)
			os.Exit(1)
		}
	} else {
		classifications, err = pipeline.LoadClassifications(st)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Loading classifications: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("Loaded %d classifications from Pass 4\n", len(classifications))
	}

	autoMove := 0
	needsReview := 0
	for _, c := range classifications {
		if c.Confidence >= 0.90 {
			autoMove++
		} else {
			needsReview++
		}
	}
	fmt.Printf("  %d auto-move (≥0.90) | %d need review\n", autoMove, needsReview)

	fmt.Println("\n[Pass 5] Building move plan...")
	movePlan, err := pipeline.Pass5(dir, fps, classifications, st)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Pass 5 failed: %v\n", err)
		os.Exit(1)
	}
	_ = movePlan

	plan, _ := pipeline.LoadMovePlan(st)
	errors := pipeline.ValidatePlan(plan)
	if len(errors) > 0 {
		fmt.Printf("  WARNING: %d plan validation errors\n", len(errors))
		for _, e := range errors[:5] {
			fmt.Printf("    %s\n", e)
		}
	} else {
		fmt.Printf("  Move plan valid: %d entries\n", len(plan))
	}

	if *flagCSV != "" {
		if err := pipeline.ExportCSV(plan, *flagCSV); err != nil {
			fmt.Fprintf(os.Stderr, "CSV export failed: %v\n", err)
		} else {
			fmt.Printf("  Exported to %s\n", *flagCSV)
		}
	}

	fmt.Println("\nDone. Use --execute to apply the move plan, or --csv to export.")
}

func runTUI(dir string, st *store.State) {
	app := tui.NewAppModel()

	if st.Exists("pass1_fingerprints.jsonl") {
		fps, err := pipeline.LoadFingerprintsFromJSONL(st)
		if err == nil {
			app.SetFingerprints(fps)
		}
	}

	if st.Exists("pass2_embeddings.json") {
		embs, err := pipeline.LoadEmbeddings(st)
		if err == nil {
			app.SetEmbeddings(embs)
		}
	}

	if st.Exists("pass3_clusters.json") {
		results, err := pipeline.LoadClusters(st)
		if err == nil {
			app.SetClusterResults(results)
		}
	}

	if st.Exists("pass4_classifications.json") {
		cls, err := pipeline.LoadClassifications(st)
		if err == nil {
			app.SetClassifications(cls)
		}
	}

	if st.Exists("move_plan.json") {
		plan, err := pipeline.LoadMovePlan(st)
		if err == nil {
			app.SetMovePlan(plan)
		}
	}

	program := tea.NewProgram(&app)
	if err := program.Start(); err != nil {
		fmt.Fprintf(os.Stderr, "TUI error: %v\n", err)
		os.Exit(1)
	}
}

func runExecute(dir string, st *store.State) {
	plan, err := pipeline.LoadMovePlan(st)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Loading move plan: %v\n", err)
		os.Exit(1)
	}
	if len(plan) == 0 {
		fmt.Println("No move plan found. Run the full pipeline first.")
		os.Exit(1)
	}
	fmt.Printf("Executing move plan: %d files\n", len(plan))

	confirm := os.Getenv("CONFIRM") != ""
	if !*flagYes && !confirm {
		fmt.Print("Execute? [y/N] ")
		var response string
		fmt.Scanln(&response)
		if !strings.EqualFold(response, "y") && !strings.EqualFold(response, "yes") {
			fmt.Println("Aborted.")
			os.Exit(0)
		}
	}

	results, err := pipeline.ExecuteMovePlan(dir, plan, false)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Execute failed: %v\n", err)
		os.Exit(1)
	}

	moved := 0
	failed := 0
	for _, r := range results {
		if r.OK {
			moved++
		} else {
			failed++
			fmt.Printf("  FAILED: %s → %s: %s\n", r.Source, r.Target, r.Error)
		}
	}
	fmt.Printf("Done: %d moved, %d failed\n", moved, failed)
}
