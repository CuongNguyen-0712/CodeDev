// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-kma-2-1",
    title: "Repositories and cache policies",
    slug: { _type: "slug", current: "kotlin-repositories-cache-policies" },
    description:
        "Every screen of the courier app went to the network on every open, and the one screen that cached did it forever. Learn the repository as the single source of truth over Room and the network, and three cache policies - cache-first with a TTL, stale-while-revalidate and network-first with a staleness limit - then implement them.",
    estimatedTime: 17,

    scenario: {
        role: "Android developer on the Rice Rocket courier app",
        problem:
            "Couriers work on 3G between buildings and in parking basements. The order list took 4-8 s to appear every time, showed a blank error offline although the same list had loaded five minutes earlier, and the menu screen, the only one with a cache, quoted prices from last week.",
    },

    content: [
        h2("Situation"),
        code("kotlin", `
class OrdersRepository(private val api: OrdersApi) {
    suspend fun orders(): List<Order> = api.assigned()          // every open, every screen
}

class MenuRepository(private val api: MenuApi, private val dao: MenuDao) {
    suspend fun menu(id: String): Menu =
        dao.get(id) ?: api.menu(id).also { dao.insert(it) }      // cached once, never refreshed
}`, "Repositories.kt"),
        bullets([
            "Orders: 4-8 s of spinner on every open, and a full-screen error in a basement.",
            "Menus: fast, but a price change on Monday was still not visible on Friday.",
            "Payout amounts: shown from the network only, so a courier offline at the end of a shift saw nothing.",
        ]),

        h2("The core you need"),
        bullets([
            "**The repository is the single source of truth.** Screens never call the API. The repository reads Room (the local database) and decides when to ask the network; the network writes into Room, and the UI observes Room through a `Flow`. Offline then means 'old data', not 'no data'.",
            "**Freshness is per entry.** Store `fetchedAt` next to the data. An entry is fresh while `now - fetchedAt < TTL`; the TTL depends on how fast the data changes and how much a stale value costs.",
            "**Cache-first (menus).** Fresh entry: return it and skip the network. Otherwise fetch; if the fetch fails, return the stale entry with an error the UI can show as a notice.",
            "**Stale-while-revalidate (order list).** Emit the cached entry at once (marked stale if old), then, only if it is stale or missing, fetch and emit the new value. The screen is never blank when data exists.",
            "**Network-first with a limit (money).** Ask the network first; when offline, fall back only to an entry younger than a maximum staleness, because an old payout amount is worse than an honest 'offline'.",
            "**Only successes update the cache.** A failed fetch must not rewrite the entry or its time, or old data starts to look fresh.",
        ]),

        h2("Apply it in the project"),
        code("kotlin", `
@Entity data class CachedOrders(@PrimaryKey val key: String, val json: String, val fetchedAt: Long)

class OrdersRepository(
    private val api: OrdersApi,
    private val dao: CacheDao,
    private val clock: () -> Long,
) {
    fun orders(): Flow<Resource<List<Order>>> = flow {
        val cached = dao.get("orders")
        if (cached != null) emit(Resource.Data(cached.decode(), stale = !isFresh(cached)))
        if (cached == null || !isFresh(cached)) {
            runCatching { api.assigned() }
                .onSuccess { dao.upsert(CachedOrders("orders", it.encode(), clock())); emit(Resource.Data(it, stale = false)) }
                .onFailure { if (cached == null) emit(Resource.Error("offline")) }
        }
    }

    private fun isFresh(entry: CachedOrders) = clock() - entry.fetchedAt < TTL_MS
}`, "OrdersRepository.kt"),
        p("The ViewModel collects the flow into its state (lesson 1) and shows `stale` as a small 'Updated 12 min ago' label instead of a spinner."),
        callout("info", "Store's and Paging's versions of this",
            "Libraries such as Store or the Paging `RemoteMediator` implement the same policies with more features (request deduplication, invalidation). The decisions you write here are the ones you configure there."),

        h2("Verify"),
        code("kotlin", `
@Test fun failedRefreshKeepsTheOldTimestamp() = runTest {
    var now = 0L
    val api = FakeOrdersApi(online = false)
    val repo = OrdersRepository(api, FakeCacheDao(seed = CachedOrders("orders", "[]", 0)), clock = { now })
    now = 15 * 60_000
    repo.orders().toList()                       // offline: stale data, no new timestamp
    api.online = true
    now = 16 * 60_000
    assertTrue(repo.orders().toList().last() is Resource.Data)   // fetched again, not served as fresh
}`, "OrdersRepositoryTest.kt"),
        p("On a device, the order list must appear immediately after the second launch in airplane mode, with its 'updated ... ago' label."),

        h2("Pitfalls"),
        bullets([
            "**Using the device clock for TTL across reboots.** `System.currentTimeMillis()` jumps when the user changes the time; for short TTLs inject a clock, and treat entries 'from the future' as stale.",
            "**One TTL for everything.** Menus, order lists and payouts change at different speeds and cost different amounts when wrong. Choose the policy and TTL per data type.",
            "**Swallowing the offline error.** Stale-while-revalidate must still tell the UI that the refresh failed when there was no data; otherwise the screen waits forever.",
        ]),

        p("Implement the policies. The editor holds the repository with its blocks missing, each marked by a `// [ ]` line; some pieces are wrong on purpose. Click a piece to fill a line, or drag it onto one. Run plays a timeline of network changes and reads, and prints what each read returned and what the cache holds."),
        challenge("chal_coding_kma_142"),
    ],
});
