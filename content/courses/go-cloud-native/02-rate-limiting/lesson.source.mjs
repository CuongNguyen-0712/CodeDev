// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-gcn-1-2",
    title: "Per-client rate limiting with a token bucket",
    slug: { _type: "slug", current: "go-gateway-token-bucket-rate-limiting" },
    description:
        "A partner's batch job and a menu scraper pushed Rice Rocket's api to its limit while every other client slowed down. Learn the token bucket - rate, burst, refill, Retry-After - how to pick the client key safely behind a load balancer, and why per-pod limits multiply, then build the gateway's per-client limiter.",
    estimatedTime: 16,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "Partner restaurants sync menus through the api with API keys; the web shop and apps call it anonymously. One partner's nightly job and one scraper that rotated fake X-Forwarded-For values produced enough traffic to make checkout slow for everyone.",
    },

    content: [
        h2("Situation"),
        p("The api's request log at 07:00, grouped by client:"),
        code("text", `
client                        req/min   p99 latency (everyone)
key:rest-12 (partner sync)     12,400        2.8 s
ip:1.1.1.1 ... ip:9.9.9.9          38        (one scraper, a new fake address each request)
everyone else                   2,100`, "access-log summary"),
        bullets([
            "The partner job had no limit at all: whatever it sent, the api tried to serve.",
            "A first attempt keyed anonymous clients by the leftmost X-Forwarded-For entry; the scraper sent its own header and got a fresh allowance every time.",
            "With 4 gateway pods, a partner limited to 10 req/s still pushed 38 req/s through.",
        ]),

        h2("The core you need"),
        bullets([
            "**A token bucket per client.** The bucket holds at most `burst` tokens and refills at `rate` tokens per second. A request spends one token; with none left it is refused. Refill lazily on each request: `tokens = min(burst, tokens + elapsed x rate)`. The `min` is the important part: idle time never adds up to more than one burst.",
            "**Refuse politely.** Answer `429 Too Many Requests` with `Retry-After` in whole seconds, rounded up: the time until one token is back is `(1 - tokens) / rate`. Rounding down tells a client to retry after 0 s, and it will.",
            "**The key decides what is fair.** Prefer the API key; for anonymous traffic use the client address. Behind a load balancer the TCP peer is the load balancer, which appends the address it saw to `X-Forwarded-For`. Everything left of that entry was written by the client. Trust the header only when the peer is your load balancer, and take the entry it added.",
            "**Memory.** A map of buckets grows with every client ever seen. A bucket that has refilled completely behaves exactly like a new one, so evicting it changes nothing for the client.",
            "**Per pod or shared.** An in-memory limiter limits each process. With N replicas a client spread over them gets up to N times the rate. Use limit / N when an approximate limit is fine, or a shared store (Redis with an atomic script) when it must hold across pods; `golang.org/x/time/rate` is the standard in-process implementation.",
        ]),

        h2("Apply it in the project"),
        code("go", `
var loadBalancers = netip.MustParsePrefix("10.0.0.0/8")

func clientKey(r *http.Request) string {
	if key := r.Header.Get("X-Api-Key"); key != "" {
		return "key:" + key
	}
	peer := netip.MustParseAddrPort(r.RemoteAddr).Addr()
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" && loadBalancers.Contains(peer) {
		hops := strings.Split(xff, ",")
		return "ip:" + strings.TrimSpace(hops[len(hops)-1])
	}
	return "ip:" + peer.String()
}

func withRateLimit(l *Limiter, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ok, wait := l.Allow(clientKey(r), time.Now())
		if !ok {
			w.Header().Set("Retry-After", retryAfter(wait))
			http.Error(w, "rate limit exceeded", http.StatusTooManyRequests)
			return
		}
		next.ServeHTTP(w, r)
	})
}`, "cmd/gateway/ratelimit.go"),
        p("`Limiter.Allow` is the bucket itself (refill, take a token or compute the wait); a mutex around it is needed once real requests arrive on many goroutines. A ticker calls `Evict` every minute."),
        callout("info", "Partner limits per pod",
            "With the HPA keeping 3-12 gateway pods, Rice Rocket keeps partner limits in Redis (one counter per key per second) and leaves the anonymous limit in memory, where an approximate per-pod value is good enough."),

        h2("Verify"),
        code("bash", `
go test -run TestLimiter ./cmd/gateway/...
# 12 quick requests with a burst of 10:
for i in $(seq 12); do curl -s -o /dev/null -w '%{http_code} ' -H 'X-Api-Key: rest-12' localhost:8080/v1/menus; done; echo
# 200 200 200 200 200 200 200 200 200 200 429 429
curl -si -H 'X-Api-Key: rest-12' localhost:8080/v1/menus | grep -i retry-after
# Retry-After: 1`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**No cap on refill.** Without `min(burst, ...)` a client idle overnight can send thousands of requests at once. Test it: idle for an hour, then send burst + 2 requests and expect 2 refusals.",
            "**Trusting the client's X-Forwarded-For.** Keying on the leftmost entry or ignoring who the peer is lets anyone pick their own key. Look for many keys with one request each in the limiter's metrics.",
            "**Retry-After of 0.** Truncating a 0.4 s wait to 0 makes well-behaved clients retry at once and get refused again. Round up.",
        ]),

        challenge("chal_quiz_gcn_121"),
        p("Now build the limiter. The editor holds `main.go` with its key blocks missing, each marked by a `// [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces repeat the first attempt's mistakes on purpose. Run plays timed requests from several clients through your limiter, including a client that forges X-Forwarded-For, and prints each decision."),
        challenge("chal_coding_gcn_122"),
    ],
});
