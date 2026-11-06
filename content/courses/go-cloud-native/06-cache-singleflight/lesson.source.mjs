// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-gcn-2-3",
    title: "A TTL cache with single-flight",
    slug: { _type: "slug", current: "go-gateway-ttl-cache-singleflight" },
    description:
        "Rice Rocket's gateway cached restaurant menus for 60 seconds, and every time a popular entry expired at lunch, hundreds of requests missed together and knocked the menu service over. Learn TTL caching, cache stampedes, single-flight, why errors must not be cached, and stale-if-error, and build the gateway's menu cache.",
    estimatedTime: 16,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "Menus change a few times a day but are read thousands of times a minute, so the gateway caches them. The cache made normal traffic cheap and the peaks worse: an expiry at 11:58 sent 400 identical calls to the menu service in the same second, and while it was failing, the gateway cached its error page as the menu.",
    },

    content: [
        h2("Situation"),
        p("The menu service's request log around one expiry, and what customers saw a minute later:"),
        code("text", `
11:58:00.004 GET /restaurants/rr-118/menu  from=gateway-7c9f  200  180 ms
11:58:00.004 GET /restaurants/rr-118/menu  from=gateway-7c9f  200  185 ms
... 397 more identical requests in the same 40 ms ...
11:58:00.611 GET /restaurants/rr-118/menu  from=gateway-2d41  503  2 ms   (pool exhausted)

# 11:58 - 11:59, app: "This restaurant has no dishes right now"`, "menu service log"),
        bullets([
            "Every gateway goroutine that found the entry expired called the menu service itself: a **cache stampede**.",
            "One of those calls got a 503, and the gateway stored the empty result for the full 60 s TTL.",
            "During the outage the gateway had a perfectly good menu from one minute earlier and threw it away.",
        ]),

        h2("The core you need"),
        bullets([
            "**TTL cache.** An entry is fresh while `now - fetchedAt < ttl`; fresh entries are served without a call. Guard the map with a mutex (or use `sync.Map` for read-mostly keys).",
            "**Cache stampede.** The moment a hot entry expires, every concurrent request misses. Without coordination each miss becomes an upstream call, multiplying load exactly when the entry is most wanted.",
            "**Single-flight.** The first miss for a key starts the call and records it as in flight; later misses for the same key wait for that call and share its result. `golang.org/x/sync/singleflight` provides `Group.Do(key, fn)`; the core is a map of in-flight calls and a channel closed when the call ends.",
            "**Do not cache failures.** Store only successful results. A failed call is returned to the callers waiting on it, and the next request tries again.",
            "**Stale-if-error.** Keep the expired entry around: if the refresh fails, serve the old value (the same idea as the `stale-if-error` Cache-Control extension). A menu one minute old beats an error page.",
        ]),

        h2("Apply it in the project"),
        p("The menu handler goes through the cache; the cache shares one upstream call per restaurant:"),
        code("go", `
import "golang.org/x/sync/singleflight"

type MenuCache struct {
    mu      sync.Mutex
    entries map[string]entry
    group   singleflight.Group
    ttl     time.Duration
    fetch   func(ctx context.Context, restaurant string) (Menu, error)
}

func (c *MenuCache) Get(ctx context.Context, restaurant string) (Menu, error) {
    c.mu.Lock()
    e, ok := c.entries[restaurant]
    c.mu.Unlock()
    if ok && time.Since(e.fetchedAt) < c.ttl {
        return e.menu, nil
    }
    v, err, _ := c.group.Do(restaurant, func() (any, error) {
        // detach from one caller's cancellation: the result is shared
        m, err := c.fetch(context.WithoutCancel(ctx), restaurant)
        c.mu.Lock()
        defer c.mu.Unlock()
        if err != nil {
            if old, ok := c.entries[restaurant]; ok {
                return old.menu, nil // stale-if-error
            }
            return Menu{}, err // never cached
        }
        c.entries[restaurant] = entry{menu: m, fetchedAt: time.Now()}
        return m, nil
    })
    if err != nil {
        return Menu{}, err
    }
    return v.(Menu), nil
}`, "gateway/menucache.go"),
        callout("info", "Give the shared call its own deadline",
            "With single-flight, one caller's context decides for everyone: if the first request is cancelled, all waiters would fail. `context.WithoutCancel` plus a timeout of its own inside `fetch` keeps the shared call independent of any single client."),

        h2("Verify"),
        code("bash", `
# 300 concurrent requests right after the entry expires
hey -n 300 -c 300 https://gateway.staging.ricerocket.vn/restaurants/rr-118/menu
# [200] 300 responses
curl -s menu.staging.internal:9090/metrics | grep 'http_requests_total{path="/restaurants/{id}/menu"'
# went up by 1, not by 300
# stop the menu service and wait past the TTL: the gateway still answers 200 with the last menu
kubectl -n rice-rocket scale deploy/menu --replicas=0
curl -s -o /dev/null -w '%{http_code}\\n' https://gateway.staging.ricerocket.vn/restaurants/rr-118/menu   # 200`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**Forgetting to remove the finished call.** If the in-flight entry stays in the map, every later miss joins a call that ended long ago and gets its old result forever. Delete it under the same lock that stores the result.",
            "**Caching the error path.** Writing the entry before checking `err` turns a 2-second outage into a TTL-long one. Look for writes to the cache that are not inside the success branch.",
            "**All entries expiring together.** Entries filled at deploy time expire at the same second on every pod. Add jitter to the TTL (for example 60 s plus up to 10 s) so refreshes spread out.",
        ]),

        p("Now build the cache. The editor holds `menucache.go` with its key blocks missing, each marked by a `// [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces are wrong on purpose. Run sends bursts of up to 200 concurrent requests and counts how often the menu service is called."),
        challenge("chal_coding_gcn_162"),
    ],
});
