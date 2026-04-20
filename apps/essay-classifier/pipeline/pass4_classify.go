package pipeline

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"

	"github.com/charlesponti/cli-tools/essay-classifier/store"
)

type Classification struct {
	ID                  string  `json:"id"`
	PrimaryDomain       string  `json:"primary_domain"`
	SecondaryDomain     string  `json:"secondary_domain,omitempty"`
	Confidence          float64 `json:"confidence"`
	Reason              string  `json:"reason"`
	NeedsFullTextReview bool    `json:"needs_full_text_review"`
}

type LLMConfig struct {
	Provider  string
	BaseURL   string
	APIKey    string
	Model     string
	BatchSize int
}

func NewLLMConfig(provider, baseURL, apiKey, model string) LLMConfig {
	if provider == "openai" {
		if baseURL == "" {
			baseURL = "https://api.openai.com/v1"
		}
		if model == "" {
			model = "gpt-4o-mini"
		}
	} else {
		if baseURL == "" {
			baseURL = "http://localhost:11434"
		}
		if model == "" {
			model = "gemma3:latest"
		}
	}
	return LLMConfig{
		Provider:  provider,
		BaseURL:   baseURL,
		APIKey:    apiKey,
		Model:     model,
		BatchSize: 5,
	}
}

var taxonomyList = `Allowed domains:
- ai
- technology
- philosophy
- politics
- economics
- culture
- science
- history
- design
- business
- product
- engineering
- writing
- personal
- health
- education
- ethics
- religion
- psychology
- sociology
- law
- media
- art
- environment
- career
- unclear

Rules:
- Choose exactly one primary domain from the allowed list.
- Choose one optional secondary domain only if clearly justified.
- Prefer consistency over creativity. Do not invent new domains.
- Mark needs_full_text_review=true only if the metadata is insufficient to classify.
- Return valid JSON only, an array of classification objects.`

func Pass4(fps []Fingerprint, st *store.State, cfg LLMConfig, threshold float64) ([]Classification, error) {
	classifications := make([]Classification, 0, len(fps))
	escalate := make([]Fingerprint, 0)

	batches := batchFingerprints(fps, cfg.BatchSize)
	for batchIdx, batch := range batches {
		records := buildMetadataRecords(batch)
		classified, err := classifyBatch(records, cfg)
		if err != nil {
			for _, fp := range batch {
				classifications = append(classifications, Classification{
					ID:                  fp.ID,
					PrimaryDomain:       "unclear",
					Confidence:          0.0,
					Reason:              fmt.Sprintf("batch classification failed: %v", err),
					NeedsFullTextReview: true,
				})
			}
			continue
		}
		for _, c := range classified {
			classifications = append(classifications, c)
			if c.NeedsFullTextReview || c.Confidence < threshold {
				for _, fp := range batch {
					if fp.ID == c.ID {
						escalate = append(escalate, fp)
						break
					}
				}
			}
		}

		if batchIdx%10 == 0 && batchIdx > 0 {
			fd, _ := os.Create(st.Path("pass4_progress.tmp"))
			if fd != nil {
				fmt.Fprintf(fd, "%d/%d", batchIdx, len(batches))
				fd.Close()
			}
		}
	}

	if err := st.Write("pass4_classifications.json", classifications); err != nil {
		return classifications, fmt.Errorf("writing classifications: %w", err)
	}
	return classifications, nil
}

func batchFingerprints(fps []Fingerprint, batchSize int) [][]Fingerprint {
	var batches [][]Fingerprint
	for i := 0; i < len(fps); i += batchSize {
		end := i + batchSize
		if end > len(fps) {
			end = len(fps)
		}
		batches = append(batches, fps[i:end])
	}
	return batches
}

func buildMetadataRecords(fps []Fingerprint) []map[string]any {
	records := make([]map[string]any, len(fps))
	for i, fp := range fps {
		records[i] = map[string]any{
			"id":              fp.ID,
			"filename":        fp.Filename,
			"title":           fp.Title,
			"headings":        fp.Headings,
			"intro_excerpt":   fp.IntroExcerpt,
			"closing_excerpt": fp.ClosingExcerpt,
			"keywords":        fp.Keywords,
			"word_count":      fp.WordCount,
		}
	}
	return records
}

func classifyBatch(records []map[string]any, cfg LLMConfig) ([]Classification, error) {
	systemPrompt := "You are organizing markdown essays into a fixed folder taxonomy.\n" + taxonomyList

	recordsJSON, _ := json.Marshal(records)
	userPrompt := fmt.Sprintf("Classify each essay. Return a JSON array of classification objects:\n%s", string(recordsJSON))

	var endpoint string
	if cfg.Provider == "openai" {
		endpoint = "/chat/completions"
	} else {
		endpoint = "/api/chat"
	}

	payload := map[string]any{
		"model": cfg.Model,
		"messages": []map[string]string{
			{"role": "system", "content": systemPrompt},
			{"role": "user", "content": userPrompt},
		},
		"temperature": 0.1,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("marshal payload: %w", err)
	}

	req, err := http.NewRequest("POST", cfg.BaseURL+endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if cfg.APIKey != "" {
		req.Header.Set("Authorization", "Bearer "+cfg.APIKey)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("status %d: %s", resp.StatusCode, string(bodyBytes))
	}

	var content string
	if cfg.Provider == "openai" {
		var result struct {
			Choices []struct {
				Message struct {
					Content string `json:"content"`
				} `json:"message"`
			} `json:"choices"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
			return nil, fmt.Errorf("decode: %w", err)
		}
		if len(result.Choices) == 0 {
			return nil, fmt.Errorf("no choices returned")
		}
		content = result.Choices[0].Message.Content
	} else {
		var result struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
			return nil, fmt.Errorf("decode: %w", err)
		}
		content = result.Message.Content
	}
	content = strings.TrimSpace(content)
	if strings.HasPrefix(content, "```json") {
		content = strings.TrimPrefix(content, "```json")
	}
	if strings.HasPrefix(content, "```") {
		content = strings.TrimPrefix(content, "```")
	}
	if strings.HasSuffix(content, "```") {
		content = strings.TrimSuffix(content, "```")
	}
	content = strings.TrimSpace(content)

	var classifications []Classification
	if err := json.Unmarshal([]byte(content), &classifications); err != nil {
		return nil, fmt.Errorf("unmarshal: %w (content: %s)", err, content[:min(200, len(content))])
	}
	return classifications, nil
}

func ClassifyFullText(fp Fingerprint, fullText string, cfg LLMConfig) (Classification, error) {
	records := []map[string]any{{
		"id":            fp.ID,
		"filename":      fp.Filename,
		"title":         fp.Title,
		"full_text":     fullText[:min(len(fullText), 4000)],
		"intro_excerpt": fp.IntroExcerpt,
		"keywords":      fp.Keywords,
	}}
	classified, err := classifyBatch(records, cfg)
	if err != nil {
		return Classification{}, err
	}
	if len(classified) == 0 {
		return Classification{}, fmt.Errorf("no classification returned")
	}
	return classified[0], nil
}

func LoadClassifications(st *store.State) ([]Classification, error) {
	var classifications []Classification
	err := st.Read("pass4_classifications.json", &classifications)
	if err == io.EOF {
		return []Classification{}, nil
	}
	if err != nil {
		return nil, err
	}
	return classifications, nil
}

func ClassifyOllamaBatch(records []map[string]any, cfg LLMConfig) ([]Classification, error) {
	recordsJSON, _ := json.Marshal(records)
	payload := map[string]any{
		"model": cfg.Model,
		"messages": []map[string]string{
			{"role": "system", "content": "You are organizing markdown essays into a fixed folder taxonomy. " + taxonomyList},
			{"role": "user", "content": fmt.Sprintf("Classify each essay. Return a JSON array of classification objects:\n%s", string(recordsJSON))},
		},
		"stream": false,
	}
	body, _ := json.Marshal(payload)
	req, err := http.NewRequest("POST", cfg.BaseURL+"/api/chat", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("ollama status %d: %s", resp.StatusCode, string(bodyBytes))
	}

	var result struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	content := strings.TrimSpace(result.Message.Content)
	if strings.HasPrefix(content, "```json") {
		content = strings.TrimPrefix(content, "```json")
	}
	content = strings.TrimPrefix(content, "```")
	content = strings.TrimSuffix(content, "```")
	content = strings.TrimSpace(content)

	var classifications []Classification
	if err := json.Unmarshal([]byte(content), &classifications); err != nil {
		return nil, fmt.Errorf("unmarshal ollama response: %w", err)
	}
	return classifications, nil
}
