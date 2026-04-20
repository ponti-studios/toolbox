package pipeline

import (
	"fmt"
	"io"
	"math"
	"sort"
	"strings"

	"github.com/charlesponti/cli-tools/essay-classifier/store"
	"gonum.org/v1/gonum/mat"
)

type ClusterResult struct {
	ID        string  `json:"id"`
	ClusterID int     `json:"cluster_id"`
	IsOutlier bool    `json:"is_outlier"`
	Distance  float64 `json:"distance"`
}

type ClusterConfig struct {
	Threshold      float64
	MinClusterSize int
	LinkageMethod  string
}

func DefaultClusterConfig() ClusterConfig {
	return ClusterConfig{
		Threshold:      0.75,
		MinClusterSize: 2,
		LinkageMethod:  "average",
	}
}

func Pass3(embeddings []Embedding, fps []Fingerprint, st *store.State, cfg ClusterConfig) ([]ClusterResult, map[int][]Fingerprint, error) {
	if len(embeddings) == 0 {
		return nil, nil, fmt.Errorf("no embeddings to cluster")
	}

	dim := len(embeddings[0].Vector)
	data := mat.NewDense(len(embeddings), dim, nil)
	idToIdx := make(map[string]int)
	for i, e := range embeddings {
		for j, v := range e.Vector {
			data.Set(i, j, v)
		}
		idToIdx[e.ID] = i
	}

	distMatrix := computeDistanceMatrix(data)
	clusters, err := agglomerativeCluster(distMatrix, cfg)
	if err != nil {
		return nil, nil, fmt.Errorf("agglomerative clustering: %w", err)
	}

	results := make([]ClusterResult, len(embeddings))
	fpMap := make(map[string]Fingerprint)
	for _, fp := range fps {
		fpMap[fp.ID] = fp
	}

	clusterMembers := make(map[int][]Fingerprint)
	for i, e := range embeddings {
		cid := clusters[i]
		isOutlier := cid == -1
		if isOutlier {
			cid = -1
		}
		results[i] = ClusterResult{
			ID:        e.ID,
			ClusterID: cid,
			IsOutlier: isOutlier,
			Distance:  0.0,
		}
		if !isOutlier {
			if fp, ok := fpMap[e.ID]; ok {
				clusterMembers[cid] = append(clusterMembers[cid], fp)
			}
		}
	}

	if err := st.Write("pass3_clusters.json", results); err != nil {
		return results, clusterMembers, fmt.Errorf("writing clusters: %w", err)
	}
	return results, clusterMembers, nil
}

func computeDistanceMatrix(data *mat.Dense) *mat.Dense {
	r, c := data.Dims()
	dists := mat.NewSymDense(r, nil)
	for i := 0; i < r; i++ {
		for j := i + 1; j < r; j++ {
			var sum float64
			for k := 0; k < c; k++ {
				vi := data.At(i, k)
				vj := data.At(j, k)
				diff := vi - vj
				sum += diff * diff
			}
			cosineDist := 1 - math.Sqrt(sum)/math.Sqrt(float64(c))
			dists.SetSym(i, j, 1-cosineDist)
		}
	}
	return mat.DenseCopyOf(dists)
}

func agglomerativeCluster(distMatrix *mat.Dense, cfg ClusterConfig) ([]int, error) {
	r, _ := distMatrix.Dims()
	if r == 0 {
		return nil, nil
	}

	n := r
	labels := make([]int, n)
	for i := range labels {
		labels[i] = i
	}
	active := make([]bool, n)
	for i := range active {
		active[i] = true
	}
	mergeCount := 0

	for mergeCount < n-1 {
		bestI, bestJ := -1, -1
		bestDist := math.MaxFloat64

		for i := 0; i < n; i++ {
			if !active[i] {
				continue
			}
			for j := i + 1; j < n; j++ {
				if !active[j] {
					continue
				}
				d := distMatrix.At(i, j)
				if d < bestDist {
					bestDist = d
					bestI, bestJ = i, j
				}
			}
		}

		if bestI == -1 || bestDist > cfg.Threshold {
			break
		}

		ci, cj := labels[bestI], labels[bestJ]
		if ci != cj {
			for i := 0; i < n; i++ {
				if labels[i] == cj {
					labels[i] = ci
				}
			}
			mergeCount++
		}

		active[bestJ] = false
	}

	labelMap := make(map[int]int)
	nextLabel := 0
	for i := 0; i < n; i++ {
		if labels[i] >= n {
			continue
		}
		if _, exists := labelMap[labels[i]]; !exists {
			labelMap[labels[i]] = nextLabel
			nextLabel++
		}
		labels[i] = labelMap[labels[i]]
	}

	clusterCounts := make(map[int]int)
	for i := 0; i < n; i++ {
		clusterCounts[labels[i]]++
	}

	finalLabels := make([]int, n)
	outlierLabel := -1
	for i := 0; i < n; i++ {
		if clusterCounts[labels[i]] < cfg.MinClusterSize {
			finalLabels[i] = outlierLabel
		} else {
			finalLabels[i] = labels[i]
		}
	}

	return finalLabels, nil
}

func LoadClusters(st *store.State) ([]ClusterResult, error) {
	var results []ClusterResult
	err := st.Read("pass3_clusters.json", &results)
	if err == io.EOF {
		return []ClusterResult{}, nil
	}
	if err != nil {
		return nil, err
	}
	return results, nil
}

func ClusterStats(results []ClusterResult) string {
	clusterCounts := make(map[int]int)
	outliers := 0
	for _, r := range results {
		if r.IsOutlier {
			outliers++
		} else {
			clusterCounts[r.ClusterID]++
		}
	}

	var sizes []int
	for _, c := range clusterCounts {
		sizes = append(sizes, c)
	}
	sort.Sort(sort.Reverse(sort.IntSlice(sizes)))

	var sb strings.Builder
	fmt.Fprintf(&sb, "Clusters: %d, Outliers: %d\n", len(clusterCounts), outliers)
	fmt.Fprintf(&sb, "Top cluster sizes: ")
	for i := 0; i < len(sizes) && i < 5; i++ {
		fmt.Fprintf(&sb, "%d ", sizes[i])
	}
	return sb.String()
}
