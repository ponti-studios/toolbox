package pipeline

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/charlesponti/cli-tools/essay-classifier/store"
)

type MovePlan struct {
	Source     string  `json:"source"`
	Target     string  `json:"target"`
	Domain     string  `json:"domain"`
	Confidence float64 `json:"confidence"`
	ID         string  `json:"id"`
}

type MoveResult struct {
	ID     string `json:"id"`
	Source string `json:"source"`
	Target string `json:"target"`
	OK     bool   `json:"ok"`
	Error  string `json:"error,omitempty"`
}

func Pass5(sourceDir string, fps []Fingerprint, classifications []Classification, st *store.State) (*MovePlan, error) {
	plan := &MovePlan{}
	planEntries := make([]map[string]any, 0, len(fps))

	classMap := make(map[string]Classification)
	for _, c := range classifications {
		classMap[c.ID] = c
	}

	for _, fp := range fps {
		c, ok := classMap[fp.ID]
		if !ok {
			c = Classification{
				PrimaryDomain: "unclear",
				Confidence:    0.0,
				Reason:        "no classification found",
			}
		}

		domain := c.PrimaryDomain
		if domain == "" {
			domain = "unclear"
		}

		target := filepath.Join(sourceDir, domain, fp.Filename)
		rel, _ := filepath.Rel(sourceDir, target)

		planEntries = append(planEntries, map[string]any{
			"id":         fp.ID,
			"source":     fp.RelativePath,
			"target":     rel,
			"domain":     domain,
			"confidence": c.Confidence,
			"reason":     c.Reason,
		})
	}

	if err := st.Write("move_plan.json", planEntries); err != nil {
		return nil, fmt.Errorf("writing move plan: %w", err)
	}
	return plan, nil
}

func LoadMovePlan(st *store.State) ([]map[string]any, error) {
	var plan []map[string]any
	err := st.Read("move_plan.json", &plan)
	if err == io.EOF {
		return []map[string]any{}, nil
	}
	if err != nil {
		return nil, err
	}
	return plan, nil
}

func ExecuteMovePlan(sourceDir string, plan []map[string]any, dryRun bool) ([]MoveResult, error) {
	results := make([]MoveResult, 0, len(plan))

	for _, entry := range plan {
		id := entry["id"].(string)
		source := filepath.Join(sourceDir, entry["source"].(string))
		target := filepath.Join(sourceDir, entry["target"].(string))

		result := MoveResult{
			ID:     id,
			Source: source,
			Target: target,
		}

		if dryRun {
			result.OK = true
			results = append(results, result)
			continue
		}

		targetDir := filepath.Dir(target)
		if err := os.MkdirAll(targetDir, 0755); err != nil {
			result.Error = fmt.Sprintf("mkdir: %v", err)
			result.OK = false
			results = append(results, result)
			continue
		}

		if err := os.Rename(source, target); err != nil {
			result.Error = fmt.Sprintf("rename: %v", err)
			result.OK = false
			results = append(results, result)
			continue
		}

		result.OK = true
		results = append(results, result)
	}

	return results, nil
}

func ExportCSV(plan []map[string]any, path string) error {
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()

	fmt.Fprintf(f, "id,source,target,domain,confidence,reason\n")
	for _, entry := range plan {
		id := entry["id"].(string)
		source := entry["source"].(string)
		target := entry["target"].(string)
		domain := entry["domain"].(string)
		confidence := entry["confidence"].(float64)
		reason := entry["reason"].(string)
		reason = strings.ReplaceAll(reason, "\"", "\"\"")
		fmt.Fprintf(f, "\"%s\",\"%s\",\"%s\",\"%s\",%.2f,\"%s\"\n",
			id, source, target, domain, confidence, reason)
	}
	return nil
}

func ValidatePlan(plan []map[string]any) []string {
	var errors []string
	seen := make(map[string]bool)
	for _, entry := range plan {
		target := entry["target"].(string)
		if seen[target] {
			errors = append(errors, fmt.Sprintf("duplicate target: %s", target))
		}
		seen[target] = true

		source := entry["source"].(string)
		if source == "" {
			errors = append(errors, fmt.Sprintf("empty source for id: %s", entry["id"]))
		}
		if target == "" {
			errors = append(errors, fmt.Sprintf("empty target for id: %s", entry["id"]))
		}
	}
	return errors
}
