package store

import (
	"encoding/json"
	"os"
	"path/filepath"
)

type State struct {
	Pass     int    `json:"pass"`
	Dir      string `json:"dir"`
	OK       bool   `json:"ok"`
	StateDir string `json:"-"`
}

func New(dir string) *State {
	return &State{
		Dir:      dir,
		StateDir: filepath.Join(dir, ".essay-classifier"),
	}
}

func (s *State) Ensure() error {
	return os.MkdirAll(s.StateDir, 0755)
}

func (s *State) Path(name string) string {
	return filepath.Join(s.StateDir, name)
}

func (s *State) Write(name string, v any) error {
	f, err := os.Create(s.Path(name))
	if err != nil {
		return err
	}
	defer f.Close()
	enc := json.NewEncoder(f)
	enc.SetIndent("", "  ")
	return enc.Encode(v)
}

func (s *State) Read(name string, v any) error {
	f, err := os.Open(s.Path(name))
	if err != nil {
		return err
	}
	defer f.Close()
	return json.NewDecoder(f).Decode(v)
}

func (s *State) Exists(name string) bool {
	_, err := os.Stat(s.Path(name))
	return err == nil
}

func (s *State) HighestPass() int {
	passes := []string{
		"pass1_fingerprints.jsonl",
		"pass2_embeddings.json",
		"pass3_clusters.json",
		"pass4_classifications.json",
	}
	for i := len(passes) - 1; i >= 0; i-- {
		if s.Exists(passes[i]) {
			return i + 1
		}
	}
	return 0
}
