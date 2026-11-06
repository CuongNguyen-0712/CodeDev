// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-jrm-3-1",
    title: "Cache-aside and stampede protection",
    slug: { _type: "slug", current: "java-cache-aside-stampede-protection" },
    description:
        "At 11:30 the cached menu of Rice Rocket's busiest restaurant expired and 800 requests hit PostgreSQL at once. Learn what makes a cache-aside cache stampede - one key expiring under load, many keys expiring together, invalidation racing a commit - and the fixes in Spring Boot with Caffeine: one load per key, refresh ahead of expiry, jittered TTLs and eviction after commit. Then write the cache callbacks.",
    estimatedTime: 15,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "GET /restaurants/{id}/menu reads a menu that takes about 200 ms to assemble from PostgreSQL. It is cached for 60 seconds. At lunch the top menus get hundreds of requests per second, and the database is shared with checkout.",
    },

    content: [
        h2("Situation"),
        p("The cache as first written, and the database during the lunch peak:"),
        code("java", `
public Menu menu(long restaurantId) {
    Menu cached = cache.getIfPresent(restaurantId);
    if (cached != null) return cached;
    Menu menu = menus.load(restaurantId);          // ~200 ms
    cache.put(restaurantId, menu);                  // expires 60 s after write
    return menu;
}`, "MenuService.java"),
        code("text", `
11:30:00.412  pg_stat_activity: 812 active "SELECT ... FROM menu_items WHERE restaurant_id = 41"
11:30:01.090  checkout p99 3,140 ms (normally 180 ms)
12:30:00.000  deploy at 11:30 warmed 300 menus -> 300 menus expire together one hour later`, "observations"),
        bullets([
            "When menu 41 expired, every request in the next 200 ms missed and ran the same query: 812 copies at once.",
            "Menus warmed together expire together, so every hour the database gets a burst.",
            "After a price change the old price stayed for up to a minute on some pods.",
        ]),

        h2("The core you need"),
        bullets([
            "**Cache-aside**: read the cache, on a miss load from the database and put the result. Simple, and it stampedes: every concurrent miss for a hot key loads it again.",
            "**One load per key.** Concurrent misses for the same key must share one load. Caffeine's `AsyncLoadingCache` does this per JVM (all callers get the same future); `@Cacheable(sync = true)` asks the cache for the same per instance. Across pods, a short Redis lock (`SET key NX PX`) or accepting one load per pod keeps the database load bounded.",
            "**Refresh ahead.** Serve the cached copy while one background load replaces it, starting some time before expiry (Caffeine `refreshAfterWrite`), so a hot key never goes cold.",
            "**Jitter.** Add a random or per-key spread to the TTL (say 0 to 10 %) so keys loaded together do not expire together.",
            "**Evict after commit.** Drop the cached entry after the transaction commits; evicting first lets a request reload the old row before the new one is visible and cache it again. Spring's `TransactionAwareCacheManagerProxy` defers evictions until commit, or evict in an `@TransactionalEventListener(phase = AFTER_COMMIT)`.",
        ]),

        h2("Apply it in the project"),
        code("java", `
@Bean
AsyncLoadingCache<Long, Menu> menuCache(MenuRepository menus) {
    return Caffeine.newBuilder()
        .maximumSize(5_000)
        .expireAfter(new JitteredExpiry(Duration.ofSeconds(60), Duration.ofSeconds(6)))
        .refreshAfterWrite(Duration.ofSeconds(50))          // serve stale, reload in the background
        .recordStats()
        .buildAsync(menus::load);                           // concurrent misses share one load
}`, "CacheConfig.java"),
        code("java", `
@Transactional
public void changePrice(long restaurantId, long itemId, long price) {
    items.updatePrice(itemId, price);
    events.publishEvent(new MenuChanged(restaurantId));      // handled after commit
}

@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
void onMenuChanged(MenuChanged e) {
    menuCache.synchronous().invalidate(e.restaurantId());
}`, "MenuService.java"),
        callout("info", "Local cache, many pods",
            "With a per-pod Caffeine cache each pod loads a hot menu once: 6 pods, 6 loads instead of 800. If that is still too many, put a shared Redis cache behind it, with its own single-load lock."),

        h2("Verify"),
        code("bash", `
# 500 concurrent requests for one cold menu
hey -n 500 -c 500 http://localhost:8080/restaurants/41/menu
# then count the loads (a cache built as a bean shows up here once registered:
# CaffeineCacheMetrics.monitor(registry, menuCache, "menus"))
curl -s localhost:8080/actuator/metrics/cache.gets?tag=result:miss | jq '.measurements[0].value'   # 1
curl -s localhost:8080/actuator/metrics/cache.loads | jq '.measurements[0].value'                 # 1
# change a price and read it back within a second
curl -s -X PATCH localhost:8080/items/9001 -d '{"price":65000}' && curl -s localhost:8080/restaurants/41/menu | jq '.items[] | select(.id==9001).price'`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**`sync = true` with a cache that does not support it.** Some cache providers ignore or reject synchronized gets; check the provider's docs and the miss count under a concurrent test, not the annotation.",
            "**Caching failures.** If the loader throws, do not cache the exception for the full TTL; with Caffeine the failed future is removed, but hand-written caches often store `null` or the error.",
            "**Unbounded caches.** A cache without a size bound turns a traffic spike into an OutOfMemoryError. Set `maximumSize` and watch the eviction count.",
        ]),

        p("Now write the cache callbacks. The editor holds `Main.java` with its key blocks missing, each marked by a `// [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces repeat the first version's mistakes on purpose. Run replays request bursts and a price change on a timeline and reports how many times the database was asked."),
        challenge("chal_coding_jrm_172"),
    ],
});
