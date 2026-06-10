package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/charmbracelet/bubbles/progress" // animated progress bar widget
	tea "github.com/charmbracelet/bubbletea"    // terminal UI framework (event loop + rendering)
	"github.com/charmbracelet/huh"              // interactive form/prompt components
	"github.com/charmbracelet/lipgloss"         // terminal styling (colors, bold, padding)
	"github.com/charmbracelet/lipgloss/table"   // bordered table renderer
)

// ── types ────────────────────────────────────────────────────────────────────

// keepChoice records which file in a pair the user wants to keep.
type keepChoice int

const (
	keepOriginal keepChoice = iota // keep the -1 or bare file (default)
	keepDupe                       // keep the -2/_2 file (chosen when it's larger)
)

// pair represents two files that appear to be versions of the same image:
// one named with a -2 or _2 suffix (dupe) and one without (original).
type pair struct {
	dupe         string     // full path to the -2/_2 file
	original     string     // full path to the -1/bare file
	dupeSize     int64      // byte size of the dupe file
	originalSize int64      // byte size of the original file
	keep         keepChoice // which file the user decided to keep
}

// sizesDiffer returns true when the two files have different byte sizes,
// meaning they are not bit-for-bit identical and the user should decide
// which one to keep.
func (p pair) sizesDiffer() bool { return p.dupeSize != p.originalSize }

// scanProgress is the message type sent from the background scan goroutine
// to the bubbletea event loop. Each message carries a batch of newly found
// pairs plus the running processed-file count.
type scanProgress struct {
	processed int    // total files examined so far
	pairs     []pair // any new pairs found in this batch
	done      bool   // true on the final message when the walk is complete
}

// ── bubbletea model (scan phase) ─────────────────────────────────────────────

// model is the bubbletea application state during the scanning phase.
// bubbletea follows the Elm architecture: Model holds state, Update handles
// events, View renders the UI. All three must be implemented.
type model struct {
	dir       string         // directory being scanned (shown in the UI)
	total     int            // total file count (from the pre-scan count)
	processed int            // files examined so far
	pairs     []pair         // pairs found so far
	progress  progress.Model // the animated progress bar widget
	ch        <-chan scanProgress // receive-only channel from the scan goroutine
	finishing bool           // true once the scan is done; we animate to 100% then quit
}

// Init is called once when the bubbletea program starts. It returns the first
// Cmd to run — here we start listening for the first message from the scanner.
func (m model) Init() tea.Cmd { return listenScan(m.ch) }

// listenScan returns a Cmd that blocks until the next scanProgress message
// arrives on the channel, then delivers it to Update. We call this again after
// each message to keep receiving — bubbletea Cmds are one-shot.
func listenScan(ch <-chan scanProgress) tea.Cmd {
	return func() tea.Msg { return <-ch }
}

// Update is called by bubbletea whenever a message arrives (from a Cmd or
// a key press). It returns the new model state and any follow-up Cmd to run.
func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {

	case scanProgress:
		// A batch of results arrived from the scan goroutine.
		m.processed = msg.processed
		m.pairs = append(m.pairs, msg.pairs...)

		if msg.done {
			// Scan finished — animate the bar to 100% before quitting.
			// We set finishing=true so the FrameMsg handler knows to quit
			// once the animation completes.
			m.finishing = true
			return m, m.progress.SetPercent(1.0)
		}

		// Calculate percentage and update the progress bar, then queue the
		// next channel read so we keep receiving scan results.
		pct := 0.0
		if m.total > 0 {
			pct = float64(m.processed) / float64(m.total)
		}
		return m, tea.Batch(m.progress.SetPercent(pct), listenScan(m.ch))

	case progress.FrameMsg:
		// The progress bar sends FrameMsgs to drive its own animation.
		// We pass them through to the progress widget and check whether
		// the animation has reached 100% so we know when to quit.
		pm, cmd := m.progress.Update(msg)
		m.progress = pm.(progress.Model)
		if m.finishing && m.progress.Percent() >= 1.0 {
			return m, tea.Quit // animation complete — exit the TUI
		}
		return m, cmd

	case tea.KeyMsg:
		// Allow the user to cancel the scan with Ctrl+C.
		if msg.Type == tea.KeyCtrlC {
			return m, tea.Quit
		}
	}
	return m, nil
}

// View renders the current state as a string. bubbletea calls this after every
// Update and redraws the terminal with the result.
func (m model) View() string {
	return fmt.Sprintf(
		"\n  Scanning: %s\n\n  %s\n\n  %d / %d files  ·  %d pairs found\n\n",
		m.dir,
		m.progress.View(), // the animated bar e.g. "████░░░░ 42%"
		m.processed,
		m.total,
		len(m.pairs),
	)
}

// ── scan ─────────────────────────────────────────────────────────────────────

// countFiles does a quick recursive walk to count non-metadata files.
// This gives us the total needed to calculate progress bar percentages.
// macOS stores extended attributes in hidden "._filename" sidecar files —
// we skip those since they're not real images.
func countFiles(dir string) int {
	count := 0
	filepath.Walk(dir, func(path string, info os.FileInfo, err error) error { //nolint:errcheck
		if err == nil && !info.IsDir() && !strings.HasPrefix(filepath.Base(path), "._") {
			count++
		}
		return nil
	})
	return count
}

// startScan launches the file walk in a background goroutine and returns a
// channel that streams scanProgress batches to the bubbletea event loop.
// We use a context so the goroutine can be cancelled (e.g. on Ctrl+C).
func startScan(ctx context.Context, dir string, total int) <-chan scanProgress {
	// Buffer of 10 so the goroutine can stay slightly ahead of the UI
	// without blocking on every single send.
	ch := make(chan scanProgress, 10)

	go func() {
		defer close(ch) // signals the channel is done when the goroutine exits

		processed := 0
		var batch []pair // accumulates pairs between sends

		// send pushes the current batch to the channel, then clears it.
		// If the context is cancelled (Ctrl+C), we skip the send and let
		// the goroutine wind down naturally.
		send := func(done bool) {
			select {
			case ch <- scanProgress{processed: processed, pairs: batch, done: done}:
				batch = nil // reset so the next batch starts fresh
			case <-ctx.Done():
			}
		}

		filepath.Walk(dir, func(fpath string, info os.FileInfo, err error) error { //nolint:errcheck
			// Respect cancellation inside the walk so Ctrl+C stops quickly.
			select {
			case <-ctx.Done():
				return filepath.SkipAll // stop the entire walk
			default:
			}

			// Skip directories, errors, and macOS metadata sidecars.
			if err != nil || info.IsDir() || strings.HasPrefix(filepath.Base(fpath), "._") {
				return nil
			}

			processed++

			// Check whether this file has a numbered counterpart.
			if p := findPair(fpath); p != nil {
				batch = append(batch, *p)
			}

			// Send a progress update every 100 files to avoid flooding the
			// channel while still keeping the UI responsive.
			if processed%100 == 0 {
				send(false)
			}
			return nil
		})

		// Send any remaining files in the last partial batch, marked done=true
		// so the model knows the scan is complete.
		send(true)
	}()

	return ch
}

// findPair checks whether fpath is a -2 or _2 versioned file and, if so,
// looks for its counterpart (-1, _1, or the bare name) in the same directory.
// Returns nil if fpath is not a versioned file or no counterpart exists.
func findPair(fpath string) *pair {
	base := filepath.Base(fpath)
	ext := filepath.Ext(base)                  // e.g. ".png"
	name := strings.TrimSuffix(base, ext)      // filename without extension
	dir := filepath.Dir(fpath)                 // parent directory

	var baseName string   // the shared root name, e.g. "photo" from "photo-2"
	var candidates []string // possible paths for the counterpart file

	switch {
	case strings.HasSuffix(name, "-2"):
		// e.g. "photo-2.png" → look for "photo-1.png" then "photo.png"
		baseName = strings.TrimSuffix(name, "-2")
		candidates = []string{
			filepath.Join(dir, baseName+"-1"+ext),
			filepath.Join(dir, baseName+ext),
		}
	case strings.HasSuffix(name, "_2"):
		// e.g. "photo_2.png" → look for "photo_1.png" then "photo.png"
		baseName = strings.TrimSuffix(name, "_2")
		candidates = []string{
			filepath.Join(dir, baseName+"_1"+ext),
			filepath.Join(dir, baseName+ext),
		}
	default:
		// Not a versioned file — nothing to do.
		return nil
	}

	// Stat the dupe file to get its size for the table display.
	info, err := os.Stat(fpath)
	if err != nil {
		return nil
	}

	// Try each candidate in order; return the first one that exists.
	// We don't require identical sizes — different exports of the same
	// screenshot can have different compression, so name pattern is enough.
	for _, candidate := range candidates {
		if cinfo, err := os.Stat(candidate); err == nil {
			return &pair{
				dupe:         fpath,
				original:     candidate,
				dupeSize:     info.Size(),
				originalSize: cinfo.Size(),
			}
		}
	}
	return nil
}

// ── display ──────────────────────────────────────────────────────────────────

// lipgloss styles — defined once and reused throughout rendering.
var (
	headerStyle  = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("99"))  // purple bold for table headers
	cellStyle    = lipgloss.NewStyle().Padding(0, 1)                                 // 1-char horizontal padding in cells
	dimStyle     = lipgloss.NewStyle().Foreground(lipgloss.Color("240"))             // grey for borders and secondary text
	boldStyle    = lipgloss.NewStyle().Bold(true)                                    // bold for summary counts
	warningStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("214"))             // amber for size-mismatch warning
)

// formatBytes converts a raw byte count to a human-readable string like "3.4 MB".
func formatBytes(b int64) string {
	const unit = 1024
	if b < unit {
		return fmt.Sprintf("%d B", b)
	}
	div, exp := int64(unit), 0
	for n := b / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(b)/float64(div), "KMGTPE"[exp])
}

// trunc shortens a string to max characters, appending "..." if truncated.
// Used to keep filenames from blowing out table columns.
func trunc(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max-3] + "..."
}

// renderTable builds a lipgloss bordered table showing all found pairs.
// Size-mismatched pairs are highlighted in amber. Capped at 50 rows to
// avoid flooding the terminal; a footer note shows how many were omitted.
func renderTable(pairs []pair) string {
	const maxRows = 50

	rows := make([][]string, 0, len(pairs))
	for _, p := range pairs {
		sizeCol := formatBytes(p.dupeSize)
		if p.sizesDiffer() {
			// Show both sizes with an arrow so the user can see the delta.
			sizeCol = warningStyle.Render(fmt.Sprintf("%s → %s",
				formatBytes(p.dupeSize), formatBytes(p.originalSize)))
		}
		rows = append(rows, []string{
			sizeCol,
			trunc(filepath.Base(p.dupe), 46),
			trunc(filepath.Base(p.original), 46),
		})
	}

	// Limit the rendered rows but remember how many were cut.
	shown, extra := rows, 0
	if len(rows) > maxRows {
		shown, extra = rows[:maxRows], len(rows)-maxRows
	}

	t := table.New().
		Border(lipgloss.NormalBorder()).
		BorderStyle(dimStyle).
		StyleFunc(func(row, _ int) lipgloss.Style {
			if row == table.HeaderRow {
				return headerStyle
			}
			return cellStyle
		}).
		Headers("SIZE (dupe → original)", "DUPLICATE  (-2 / _2)", "ORIGINAL").
		Rows(shown...)

	out := t.Render()
	if extra > 0 {
		out += fmt.Sprintf("\n  %s\n",
			dimStyle.Render(fmt.Sprintf("... and %d more pairs not shown", extra)))
	}
	return out
}

// ── confirmation ─────────────────────────────────────────────────────────────

// resolveChoices handles the two-phase confirmation:
//  1. A single yes/no prompt covers all same-size pairs (they're unambiguous).
//  2. Each size-mismatched pair gets its own select prompt so the user can
//     pick which version to keep; the larger file is listed first as the default.
//
// Returns the resolved pairs and false if the user aborted.
func resolveChoices(pairs []pair, dupesDir string) ([]pair, bool) {
	// Split pairs into same-size and different-size groups.
	var same, diff []pair
	for _, p := range pairs {
		if p.sizesDiffer() {
			diff = append(diff, p)
		} else {
			same = append(same, p)
		}
	}

	// ── same-size pairs: single bulk confirm ──────────────────────────────
	if len(same) > 0 {
		var confirm bool
		form := huh.NewForm(huh.NewGroup(
			huh.NewConfirm().
				Title(fmt.Sprintf(
					"Move %d same-size duplicate(s) to '%s' and strip -1/_1 from originals?",
					len(same), dupesDir,
				)).
				Affirmative("Yes, clean up").
				Negative("No, abort").
				Value(&confirm),
		))
		if err := form.Run(); err != nil || !confirm {
			return nil, false // user said no or hit Ctrl+C
		}
		// Same-size pairs always keep the original; no further choice needed.
		for i := range same {
			same[i].keep = keepOriginal
		}
	}

	// ── size-mismatched pairs: one prompt per pair ────────────────────────
	for i := range diff {
		p := &diff[i]

		// Build option labels that include the filename and size.
		origLabel := fmt.Sprintf("Keep original  %s  (%s)",
			trunc(filepath.Base(p.original), 40), formatBytes(p.originalSize))
		dupeLabel := fmt.Sprintf("Keep duplicate  %s  (%s)",
			trunc(filepath.Base(p.dupe), 40), formatBytes(p.dupeSize))

		var choice string

		// Put the larger file first in the list so it's the natural default.
		var opts []huh.Option[string]
		if p.dupeSize > p.originalSize {
			opts = []huh.Option[string]{
				huh.NewOption(dupeLabel+" ✦ larger", "dupe"),
				huh.NewOption(origLabel, "original"),
			}
		} else {
			opts = []huh.Option[string]{
				huh.NewOption(origLabel+" ✦ larger", "original"),
				huh.NewOption(dupeLabel, "dupe"),
			}
		}

		form := huh.NewForm(huh.NewGroup(
			huh.NewSelect[string]().
				Title(fmt.Sprintf(
					"Size mismatch — which file to keep?\n  dupe: %s\n  orig: %s",
					filepath.Base(p.dupe), filepath.Base(p.original),
				)).
				Options(opts...).
				Value(&choice),
		))
		if err := form.Run(); err != nil {
			return nil, false
		}

		// Record the user's decision on the pair for the cleanup step.
		if choice == "dupe" {
			p.keep = keepDupe
		} else {
			p.keep = keepOriginal
		}
	}

	// Merge both groups back into a single slice for cleanup.
	return append(same, diff...), true
}

// ── cleanup ──────────────────────────────────────────────────────────────────

// cleanup executes the file operations for all resolved pairs:
//   - moves the unwanted file to dupesDir
//   - renames the kept file to its bare name (strips the -1/_1/-2/_2 suffix)
func cleanup(pairs []pair, dupesDir string) (moved, renamed, skipped int) {
	for _, p := range pairs {
		// Decide which file to discard and which to keep based on the
		// user's earlier choice (keepOriginal is the default).
		var toMove, toKeep string
		if p.keep == keepDupe {
			toMove, toKeep = p.original, p.dupe // user picked the dupe
		} else {
			toMove, toKeep = p.dupe, p.original // user picked the original (default)
		}

		// Move the discarded file into the duplicates directory.
		dest := filepath.Join(dupesDir, filepath.Base(toMove))
		if err := os.Rename(toMove, dest); err == nil {
			moved++
		}

		// Strip the version suffix from the kept file so it has a clean name.
		// e.g. "photo-1.png" → "photo.png", "photo_2.png" → "photo.png"
		base := filepath.Base(toKeep)
		ext := filepath.Ext(base)
		name := strings.TrimSuffix(base, ext)
		dir := filepath.Dir(toKeep)

		var bare string
		switch {
		case strings.HasSuffix(name, "-1"):
			bare = strings.TrimSuffix(name, "-1")
		case strings.HasSuffix(name, "_1"):
			bare = strings.TrimSuffix(name, "_1")
		case strings.HasSuffix(name, "-2"):
			bare = strings.TrimSuffix(name, "-2")
		case strings.HasSuffix(name, "_2"):
			bare = strings.TrimSuffix(name, "_2")
		}

		if bare != "" {
			newPath := filepath.Join(dir, bare+ext)
			// Only rename if the target name doesn't already exist —
			// otherwise we'd silently overwrite a different file.
			if _, err := os.Stat(newPath); os.IsNotExist(err) {
				if err := os.Rename(toKeep, newPath); err == nil {
					renamed++
				}
			} else {
				skipped++ // target exists; leave the file as-is
			}
		}
	}
	return
}

// ── main ─────────────────────────────────────────────────────────────────────

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintf(os.Stderr, "Usage: %s <directory> [duplicates-dir]\n", os.Args[0])
		os.Exit(1)
	}

	// Resolve the scan directory to an absolute path so display and file ops
	// are consistent regardless of where the binary is invoked from.
	dir, err := filepath.Abs(os.Args[1])
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}
	if _, err := os.Stat(dir); os.IsNotExist(err) {
		fmt.Fprintf(os.Stderr, "error: '%s' does not exist\n", dir)
		os.Exit(1)
	}

	// Default duplicates destination is a "duplicates" subfolder inside the
	// scanned directory. A second CLI argument overrides this.
	dupesDir := filepath.Join(dir, "duplicates")
	if len(os.Args) >= 3 {
		dupesDir, _ = filepath.Abs(os.Args[2])
	}

	// Pre-count files so the progress bar can show an accurate percentage.
	fmt.Printf("Counting files in %s...\n", dimStyle.Render(dir))
	total := countFiles(dir)
	fmt.Printf("Found %s files\n\n", boldStyle.Render(fmt.Sprintf("%d", total)))

	// Create a cancellable context so Ctrl+C stops the background goroutine.
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Start the background scan and wire it into the bubbletea model.
	ch := startScan(ctx, dir, total)
	m := model{
		dir:      dir,
		total:    total,
		ch:       ch,
		progress: progress.New(progress.WithDefaultGradient()),
	}

	// Run the bubbletea TUI until the scan completes (or user hits Ctrl+C).
	prog := tea.NewProgram(m)
	result, err := prog.Run()
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}
	cancel() // stop the scan goroutine if it's still running

	pairs := result.(model).pairs
	if len(pairs) == 0 {
		fmt.Println("No duplicate pairs found.")
		return
	}

	// Print the results table.
	fmt.Printf("\n%s\n\n", renderTable(pairs))

	// Show a summary line so the user knows how many need manual review.
	sameCnt, diffCnt := 0, 0
	for _, p := range pairs {
		if p.sizesDiffer() {
			diffCnt++
		} else {
			sameCnt++
		}
	}
	fmt.Printf("  %s  same-size pairs  ·  %s  size-mismatched pairs\n\n",
		boldStyle.Render(fmt.Sprintf("%d", sameCnt)),
		warningStyle.Render(fmt.Sprintf("%d", diffCnt)),
	)

	// Ask the user to confirm and resolve any size-mismatched pairs.
	resolved, ok := resolveChoices(pairs, dupesDir)
	if !ok {
		fmt.Println("Aborted.")
		return
	}

	// Ensure the duplicates directory exists before moving files into it.
	if err := os.MkdirAll(dupesDir, 0755); err != nil {
		fmt.Fprintf(os.Stderr, "error creating duplicates dir: %v\n", err)
		os.Exit(1)
	}

	moved, renamed, skipped := cleanup(resolved, dupesDir)

	fmt.Printf("\n%s\n", boldStyle.Render("Done:"))
	fmt.Printf("  %d  moved to %s\n", moved, dupesDir)
	fmt.Printf("  %d  renamed (suffix stripped)\n", renamed)
	fmt.Printf("  %d  skipped (target already exists)\n", skipped)
}
