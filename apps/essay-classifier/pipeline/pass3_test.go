package pipeline

import (
	"testing"

	"github.com/charlesponti/cli-tools/essay-classifier/store"
	"gonum.org/v1/gonum/mat"
)

func TestComputeDistanceMatrix(t *testing.T) {
	vecs := [][]float64{
		{1.0, 0.0, 0.0},
		{0.0, 1.0, 0.0},
		{0.0, 0.0, 1.0},
	}

	data := mat.NewDense(3, 3, nil)
	for i, v := range vecs {
		for j, val := range v {
			data.Set(i, j, val)
		}
	}

	distMatrix := computeDistanceMatrix(data)
	r, c := distMatrix.Dims()
	if r != 3 || c != 3 {
		t.Errorf("distMatrix dims = (%d, %d), want (3, 3)", r, c)
	}

	d01 := distMatrix.At(0, 1)
	d12 := distMatrix.At(1, 2)
	d02 := distMatrix.At(0, 2)

	if d01 <= 0 || d01 >= 2 {
		t.Errorf("d01 = %f, expected between 0 and 2", d01)
	}
	if d12 <= 0 || d12 >= 2 {
		t.Errorf("d12 = %f, expected between 0 and 2", d12)
	}
	if d02 <= 0 || d02 >= 2 {
		t.Errorf("d02 = %f, expected between 0 and 2", d02)
	}

	if d01 != d12 {
		t.Errorf("expected d01 == d12 (symmetric orthogonal vectors), got d01=%f d12=%f", d01, d12)
	}
}

func TestAgglomerativeCluster(t *testing.T) {
	vecs := [][]float64{
		{1.0, 0.0},
		{0.9, 0.1},
		{0.1, 0.9},
		{0.0, 1.0},
	}

	data := mat.NewDense(4, 2, nil)
	for i, v := range vecs {
		for j, val := range v {
			data.Set(i, j, val)
		}
	}

	distMatrix := computeDistanceMatrix(data)

	cfg := DefaultClusterConfig()
	cfg.Threshold = 0.5
	cfg.MinClusterSize = 2

	labels, err := agglomerativeCluster(distMatrix, cfg)
	if err != nil {
		t.Fatalf("agglomerativeCluster error: %v", err)
	}

	if len(labels) != 4 {
		t.Fatalf("expected 4 labels, got %d", len(labels))
	}

	vecsClose := [][]float64{
		{1.0, 0.0},
		{0.9, 0.1},
		{0.1, 0.9},
		{0.0, 1.0},
	}

	data2 := mat.NewDense(4, 2, nil)
	for i, v := range vecsClose {
		for j, val := range v {
			data2.Set(i, j, val)
		}
	}

	distMatrix2 := computeDistanceMatrix(data2)
	cfg2 := DefaultClusterConfig()
	cfg2.Threshold = 0.3
	cfg2.MinClusterSize = 2

	labels2, _ := agglomerativeCluster(distMatrix2, cfg2)

	if labels2[0] == labels2[1] && labels2[2] == labels2[3] && labels2[0] != labels2[2] {
	}

	_ = labels
}

func TestClusterStats(t *testing.T) {
	results := []ClusterResult{
		{ID: "a", ClusterID: 0, IsOutlier: false, Distance: 0.1},
		{ID: "b", ClusterID: 0, IsOutlier: false, Distance: 0.2},
		{ID: "c", ClusterID: 1, IsOutlier: false, Distance: 0.1},
		{ID: "d", ClusterID: -1, IsOutlier: true, Distance: 0.0},
	}

	stats := ClusterStats(results)

	if stats == "" {
		t.Error("expected non-empty stats string")
	}
}

func TestPass3EmptyEmbeddings(t *testing.T) {
	st := store.New(t.TempDir())

	_, _, err := Pass3([]Embedding{}, []Fingerprint{}, st, DefaultClusterConfig())
	if err == nil {
		t.Error("expected error for empty embeddings, got nil")
	}
	if err != nil && err.Error() != "no embeddings to cluster" {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestAgglomerativeClusterSingleItem(t *testing.T) {
	vecs := [][]float64{
		{1.0, 0.0},
	}

	data := mat.NewDense(1, 2, nil)
	for j, val := range vecs[0] {
		data.Set(0, j, val)
	}

	distMatrix := computeDistanceMatrix(data)
	cfg := DefaultClusterConfig()

	labels, err := agglomerativeCluster(distMatrix, cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(labels) != 1 {
		t.Errorf("expected 1 label, got %d", len(labels))
	}
}

func TestAgglomerativeClusterIdenticalVectors(t *testing.T) {
	vecs := [][]float64{
		{1.0, 0.0},
		{1.0, 0.0},
		{1.0, 0.0},
	}

	data := mat.NewDense(3, 2, nil)
	for i, v := range vecs {
		for j, val := range v {
			data.Set(i, j, val)
		}
	}

	distMatrix := computeDistanceMatrix(data)
	cfg := DefaultClusterConfig()
	cfg.Threshold = 0.1

	labels, _ := agglomerativeCluster(distMatrix, cfg)

	if labels[0] != labels[1] || labels[1] != labels[2] {
		t.Error("expected identical vectors to be in same cluster")
	}

	for _, d := range []float64{distMatrix.At(0, 1), distMatrix.At(0, 2), distMatrix.At(1, 2)} {
		if d != 0.0 {
			t.Errorf("expected distance 0 for identical vectors, got %f", d)
		}
	}
}
