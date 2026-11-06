// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-gcn-2-1",
    title: "Consistent hashing for upstream selection",
    slug: { _type: "slug", current: "go-gateway-consistent-hashing" },
    description:
        "Scaling Rice Rocket's courier-matcher from 4 to 5 instances sent 80% of restaurants to a cold cache and doubled database load at dinner time. Learn why `hash % n` reshuffles almost everything, how a hash ring with virtual nodes moves only the new instance's share, and how it routes around instances that are down, then build the gateway's ring.",
    estimatedTime: 16,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "courier-matcher keeps each restaurant's preparation-time model in memory, built from the database on first use. The gateway sends all requests for a restaurant to the same instance so the model stays warm. That worked until the HPA added a fifth instance during the dinner peak.",
    },

    content: [
        h2("Situation"),
        p("The router and what happened when the fifth instance came up at 18:05:"),
        code("go", `
func pick(restaurantID string, instances []string) string {
	return instances[fnv32(restaurantID)%uint32(len(instances))]
}`, "cmd/gateway/route.go (first version)"),
        code("text", `
18:05  courier-matcher replicas 4 -> 5
18:05  model cache hit rate      94% -> 19%
18:06  orders-db CPU             41% -> 97%,  p99 /v1/match 180 ms -> 2.4 s
18:20  hit rate back to 90%`, "dashboard"),
        bullets([
            "With `% 4` and then `% 5`, a key keeps its instance only when both remainders agree: about 1 key in 5. The other 80% moved to an instance without their model.",
            "When one instance was restarted, every restaurant moved twice: once when it left, once when it came back.",
        ]),

        h2("The core you need"),
        bullets([
            "**The ring.** Hash every instance to points on a circle of 2^64 positions, sorted. A key belongs to the first point at or after the key's hash; past the last point it wraps to the first.",
            "**Why it moves little.** A new instance takes over only the arcs just before its own points. With n instances it takes about 1/(n+1) of the keys, all from the others, and nothing else changes. Removing an instance gives only its keys to their next neighbours.",
            "**Virtual nodes.** One point per instance makes arcs very uneven (one instance may own 60%). Give each instance 100-200 points (`instance#0`, `instance#1`, ...): the shares even out and a removed instance's keys spread over all the others instead of one neighbour.",
            "**A hash that spreads.** Similar keys (`restaurant-101`, `restaurant-102`) must land far apart. Fast non-cryptographic hashes like FNV-1a need a final mixing step for that; libraries use CRC32, xxHash or a finalizer.",
            "**Unhealthy instances.** Keep the ring stable and skip points whose instance is down while walking clockwise. When the instance recovers, its keys come straight back, with no reshuffle of the rest.",
            "**Where else you see it.** Nginx `hash $key consistent;` (ketama), Envoy's ring hash and Maglev load balancers, and Redis Cluster's fixed hash slots solve the same problem.",
        ]),

        h2("Apply it in the project"),
        code("go", `
type Ring struct {
	vnodes int
	points []uint64
	owner  map[uint64]string
}

func (r *Ring) Get(key string, down map[string]bool) string {
	h := hash(key)
	i := sort.Search(len(r.points), func(j int) bool { return r.points[j] >= h })
	for n := 0; n < len(r.points); n++ {
		if u := r.owner[r.points[(i+n)%len(r.points)]]; !down[u] {
			return u
		}
	}
	return ""
}

// The proxy picks the upstream per request; the ring is rebuilt when the
// endpoints of the courier-matcher Service change.
proxy := &httputil.ReverseProxy{Rewrite: func(pr *httputil.ProxyRequest) {
	upstream := ring.Get(pr.In.PathValue("restaurantID"), health.Down())
	pr.SetURL(&url.URL{Scheme: "http", Host: upstream})
}}`, "cmd/gateway/ring.go"),
        callout("info", "Concurrency",
            "Requests read the ring on many goroutines while the endpoint watcher replaces it. Build a new Ring and swap it in with `atomic.Pointer[Ring]` instead of locking every lookup."),

        h2("Verify"),
        code("bash", `
go test -run TestRingMoves ./cmd/gateway/...
# 4 -> 5 instances: moved 2144 of 10000 keys (21.4%)      hash % n would move ~80%
# matcher-3 down:   moved 2551 keys, all of them matcher-3's
kubectl -n rice-rocket scale deployment/courier-matcher --replicas=5
# dashboard: model cache hit rate dips to ~75% for a minute instead of 19%`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**Forgetting to sort after adding points.** `sort.Search` on an unsorted slice returns nonsense quietly. A test that compares owners before and after an add catches it as a huge move count.",
            "**No wrap-around.** Keys hashing past the last point get no instance (or an index panic). Include a key whose hash is above every point in the tests.",
            "**Too few virtual nodes.** With 1-10 points per instance the shares are lopsided, and one instance runs hot while others idle. Check the per-instance counts, not only the moved count.",
        ]),

        p("Now build the ring. The editor holds `main.go` with its key blocks missing, each marked by a `// [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces repeat the first router's mistakes on purpose. Run assigns 10,000 restaurants before and after adding, removing or losing an instance and counts how many moved."),
        challenge("chal_coding_gcn_142"),
    ],
});
