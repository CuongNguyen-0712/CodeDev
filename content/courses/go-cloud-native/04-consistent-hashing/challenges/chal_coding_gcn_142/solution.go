// Rice Rocket API gateway: picks the courier-matcher instance for a restaurant id, so each
// restaurant's requests keep landing on the instance that has its prep-time model cached.
// A hash ring with virtual nodes: adding or removing an instance moves only its share of keys.
package main

import (
	"encoding/json"
	"fmt"
	"hash/fnv"
	"os"
	"sort"
	"strconv"
)

// hash places a string on the ring. FNV-1a alone leaves keys that differ only in their last
// characters (restaurant-101, restaurant-102) close together; the final mixing step from
// MurmurHash3 (fmix64) spreads them over the whole ring.
func hash(s string) uint64 {
	h := fnv.New64a()
	h.Write([]byte(s))
	x := h.Sum64()
	x ^= x >> 33
	x *= 0xff51afd7ed558ccd
	x ^= x >> 33
	x *= 0xc4ceb9fe1a85ec53
	x ^= x >> 33
	return x
}

type Ring struct {
	vnodes int
	points []uint64          // positions on the ring, sorted
	owner  map[uint64]string // position -> upstream
}

func NewRing(upstreams []string, vnodes int) *Ring {
	r := &Ring{vnodes: vnodes, owner: map[uint64]string{}}
	for _, u := range upstreams {
		r.Add(u)
	}
	return r
}

// Add places the upstream's virtual nodes on the ring.
func (r *Ring) Add(upstream string) {
	// @piece add-points: One point per virtual node, then keep the points sorted
	for i := 0; i < r.vnodes; i++ {
		p := hash(upstream + "#" + strconv.Itoa(i))
		r.points = append(r.points, p)
		r.owner[p] = upstream
	}
	sort.Slice(r.points, func(a, b int) bool { return r.points[a] < r.points[b] })
	// @end
}

// Remove takes all of the upstream's points off the ring.
func (r *Ring) Remove(upstream string) {
	// @piece remove-points: Drop every point the upstream owns
	kept := r.points[:0]
	for _, p := range r.points {
		if r.owner[p] == upstream {
			delete(r.owner, p)
		} else {
			kept = append(kept, p)
		}
	}
	r.points = kept
	// @end
}

// Get returns the upstream for key: the owner of the first point at or after hash(key),
// skipping upstreams that are down and wrapping around at the end of the ring.
func (r *Ring) Get(key string, down map[string]bool) string {
	if len(r.points) == 0 {
		return ""
	}
	h := hash(key)
	// @piece first-point: Find the first point at or after the key's hash
	i := sort.Search(len(r.points), func(j int) bool { return r.points[j] >= h })
	// @end
	// @piece walk-clockwise: Walk clockwise past upstreams that are down, wrapping around
	for n := 0; n < len(r.points); n++ {
		if u := r.owner[r.points[(i+n)%len(r.points)]]; !down[u] {
			return u
		}
	}
	return ""
	// @end
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: {"upstreams", "vnodes", "keys": N, "add", "remove", "down": [...]}. Assigns
// restaurant-1 ... restaurant-N before and after the change (add / remove / down) and prints
// {"before": {upstream: keys}, "after": {upstream: keys}, "moved": keys whose upstream changed}.
func main() {
	var in struct {
		Upstreams []string `json:"upstreams"`
		VNodes    int      `json:"vnodes"`
		Keys      int      `json:"keys"`
		Add       string   `json:"add"`
		Remove    string   `json:"remove"`
		Down      []string `json:"down"`
	}
	if err := json.NewDecoder(os.Stdin).Decode(&in); err != nil {
		fmt.Println("bad input:", err)
		return
	}
	ring := NewRing(in.Upstreams, in.VNodes)
	assign := func(down map[string]bool) ([]string, map[string]int) {
		owners := make([]string, in.Keys)
		counts := map[string]int{}
		for k := 0; k < in.Keys; k++ {
			owners[k] = ring.Get("restaurant-"+strconv.Itoa(k+1), down)
			counts[owners[k]]++
		}
		return owners, counts
	}
	beforeOwners, before := assign(nil)
	if in.Add != "" {
		ring.Add(in.Add)
	}
	if in.Remove != "" {
		ring.Remove(in.Remove)
	}
	down := map[string]bool{}
	for _, d := range in.Down {
		down[d] = true
	}
	afterOwners, after := assign(down)
	moved := 0
	for k := range beforeOwners {
		if beforeOwners[k] != afterOwners[k] {
			moved++
		}
	}
	b, _ := json.Marshal(struct {
		Before map[string]int `json:"before"`
		After  map[string]int `json:"after"`
		Moved  int            `json:"moved"`
	}{before, after, moved})
	fmt.Println(string(b))
}
