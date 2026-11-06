package main

import (
	"encoding/json"
	"fmt"
	"math"
	"os"
	"sort"
	"strconv"
	"strings"
)

// Rice Rocket API gateway: request latency per route, the way a Prometheus histogram records it.
//
//   - Bounds are the buckets' upper bounds in seconds ("le"), ascending; a last bucket (+Inf) catches
//     everything above. A value equal to a bound belongs to that bound's bucket (le = "less or equal").
//   - Quantile(q) estimates like PromQL's histogram_quantile: rank = q * count, find the bucket that
//     holds the rank, interpolate linearly between its lower and upper bound (the first bucket starts
//     at 0). A rank in the +Inf bucket returns the highest finite bound.
//   - routeLabel turns a request path into the label: numeric ids become {id}, so /orders/1001 and
//     /orders/1002 are one time series, not one per order.

type Histogram struct {
	Bounds []float64 // upper bounds, ascending; +Inf is implicit
	Counts []uint64  // per bucket, len(Bounds)+1; the last one is +Inf
	Sum    float64
	Total  uint64
}

func NewHistogram(bounds []float64) *Histogram {
	return &Histogram{Bounds: bounds, Counts: make([]uint64, len(bounds)+1)}
}

func (h *Histogram) Observe(v float64) {
	// [ ] Pick the bucket: the first upper bound >= the value
	h.Counts[i]++
	h.Sum += v
	h.Total++
}

func (h *Histogram) Quantile(q float64) float64 {
	// [ ] Find the rank and the bucket that holds it
	// [ ] Interpolate inside the bucket like histogram_quantile
}

func routeLabel(path string) string {
	// [ ] Replace numeric ids in the path with {id}
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: {"bounds": [seconds...], "requests": [{"path": "/orders/1001", "seconds": 0.25}, ...]}.
// Output: the number of time series (route labels) and per route: count, cumulative buckets as
// Prometheus exposes them ("le" -> count), p50, p99 and the average, rounded to 3 decimals.
func main() {
	var in struct {
		Bounds   []float64 `json:"bounds"`
		Requests []struct {
			Path    string  `json:"path"`
			Seconds float64 `json:"seconds"`
		} `json:"requests"`
	}
	if err := json.NewDecoder(os.Stdin).Decode(&in); err != nil {
		fmt.Println(`{"error":"bad input"}`)
		return
	}
	round := func(x float64) float64 { return math.Round(x*1000) / 1000 }
	hists := map[string]*Histogram{}
	for _, r := range in.Requests {
		label := routeLabel(r.Path)
		if hists[label] == nil {
			hists[label] = NewHistogram(in.Bounds)
		}
		hists[label].Observe(r.Seconds)
	}
	type route struct {
		Count   uint64            `json:"count"`
		Buckets map[string]uint64 `json:"buckets"`
		P50     float64           `json:"p50"`
		P99     float64           `json:"p99"`
		Avg     float64           `json:"avg"`
	}
	out := struct {
		Series int              `json:"series"`
		Routes map[string]route `json:"routes"`
	}{Series: len(hists), Routes: map[string]route{}}
	for label, h := range hists {
		buckets := map[string]uint64{}
		var cum uint64
		for i, c := range h.Counts {
			cum += c
			le := "+Inf"
			if i < len(h.Bounds) {
				le = strconv.FormatFloat(h.Bounds[i], 'g', -1, 64)
			}
			buckets[le] = cum
		}
		out.Routes[label] = route{h.Total, buckets, round(h.Quantile(0.5)), round(h.Quantile(0.99)), round(h.Sum / float64(h.Total))}
	}
	data, _ := json.Marshal(out)
	fmt.Println(string(data))
}
