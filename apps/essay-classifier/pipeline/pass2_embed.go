package pipeline

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"sync"

	"github.com/charlesponti/cli-tools/essay-classifier/store"
)

type Embedding struct {
	ID     string    `json:"id"`
	Vector []float64 `json:"vector"`
}

type Embedder interface {
	Embed(text string) ([]float64, error)
}

type OllamaEmbedder struct {
	BaseURL string
	Model   string
	Once    sync.Once
}

type OllamaResponse struct {
	Embedding []float64 `json:"embedding"`
}

func NewOllamaEmbedder(baseURL, model string) *OllamaEmbedder {
	if baseURL == "" {
		baseURL = "http://localhost:11434"
	}
	if model == "" {
		model = "nomic-embed-text"
	}
	return &OllamaEmbedder{BaseURL: baseURL, Model: model}
}

func (o *OllamaEmbedder) Embed(text string) ([]float64, error) {
	payload := map[string]any{
		"model":  o.Model,
		"prompt": text,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequest("POST", o.BaseURL+"/api/embeddings", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("ollama request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("ollama status %d: %s", resp.StatusCode, string(bodyBytes))
	}

	var result OllamaResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	return result.Embedding, nil
}

func (o *OllamaEmbedder) Ping() bool {
	resp, err := http.Get(o.BaseURL + "/api/tags")
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == 200
}

type OpenAIEmbedder struct {
	BaseURL   string
	APIKey    string
	Model     string
	BatchSize int
}

type OpenAIResponse struct {
	Data []struct {
		Embedding []float64 `json:"embedding"`
	} `json:"data"`
}

func NewOpenAIEmbedder(apiKey, model string) *OpenAIEmbedder {
	if model == "" {
		model = "text-embedding-3-small"
	}
	return &OpenAIEmbedder{
		BaseURL:   "https://api.openai.com/v1",
		APIKey:    apiKey,
		Model:     model,
		BatchSize: 100,
	}
}

func (o *OpenAIEmbedder) Embed(text string) ([]float64, error) {
	payload := map[string]any{
		"model": o.Model,
		"input": text,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequest("POST", o.BaseURL+"/embeddings", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+o.APIKey)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("openai request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("openai status %d: %s", resp.StatusCode, string(bodyBytes))
	}

	var result OpenAIResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	if len(result.Data) == 0 {
		return nil, fmt.Errorf("no embedding returned")
	}
	return result.Data[0].Embedding, nil
}

func Pass2(fps []Fingerprint, st *store.State, embedder Embedder) ([]Embedding, error) {
	embeddings := make([]Embedding, 0, len(fps))

	for i, fp := range fps {
		text := buildEmbeddingText(fp)
		vec, err := embedder.Embed(text)
		if err != nil {
			continue
		}
		embeddings = append(embeddings, Embedding{ID: fp.ID, Vector: vec})

		if i%20 == 0 && i > 0 {
			fd, _ := os.Create(st.Path("pass2_progress.tmp"))
			if fd != nil {
				fmt.Fprintf(fd, "%d/%d", i, len(fps))
				fd.Close()
			}
		}
	}

	if err := st.Write("pass2_embeddings.json", embeddings); err != nil {
		return embeddings, fmt.Errorf("writing embeddings: %w", err)
	}
	return embeddings, nil
}

func buildEmbeddingText(fp Fingerprint) string {
	var sb strings.Builder
	sb.WriteString(fp.Filename)
	sb.WriteString(" ")
	sb.WriteString(fp.Title)
	sb.WriteString(" ")
	for _, h := range fp.Headings {
		sb.WriteString(h)
		sb.WriteString(" ")
	}
	sb.WriteString(fp.IntroExcerpt)
	sb.WriteString(" ")
	sb.WriteString(fp.ClosingExcerpt)
	sb.WriteString(" ")
	for _, k := range fp.Keywords {
		sb.WriteString(k)
		sb.WriteString(" ")
	}
	return sb.String()
}

func LoadEmbeddings(st *store.State) ([]Embedding, error) {
	var embeddings []Embedding
	err := st.Read("pass2_embeddings.json", &embeddings)
	if err == io.EOF {
		return []Embedding{}, nil
	}
	if err != nil {
		return nil, err
	}
	return embeddings, nil
}

func DetectEmbedder() Embedder {
	ollama := NewOllamaEmbedder("", "")
	if ollama.Ping() {
		return ollama
	}
	return nil
}

type EmbedderConfig struct {
	Provider string
	Ollama   OllamaConfig
	OpenAI   OpenAIConfig
}

type OllamaConfig struct {
	BaseURL string
	Model   string
}

type OpenAIConfig struct {
	APIKey string
	Model  string
}
