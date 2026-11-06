// Rice Rocket courier app: one repository, three cache policies.
// Menus use CACHE_FIRST, the order list STALE_WHILE_REVALIDATE, payout amounts NETWORK_FIRST.
// Time is in minutes. load() returns what the screen receives, in order.

data class Entry(val value: String, val fetchedAt: Int)

enum class Policy { CACHE_FIRST, STALE_WHILE_REVALIDATE, NETWORK_FIRST }

const val TTL = 10            // an entry younger than this is fresh
const val MAX_STALE = 60      // NETWORK_FIRST may fall back to an entry at most this old

class Repository(private val fetch: (String) -> String?) {      // fetch returns null when offline
    val cache = mutableMapOf<String, Entry>()

    // [ ] Is a cached entry still fresh?

    // [ ] Fetch; keep the answer only when it arrived

    fun label(entry: Entry, now: Int) = "cache:${entry.value}" + if (isFresh(entry, now)) "" else " (stale)"

    fun load(key: String, policy: Policy, now: Int): List<String> {
        val cached = cache[key]
        val out = mutableListOf<String>()
        when (policy) {
            // [ ] CACHE_FIRST: the network only when the cache is not fresh
            // [ ] STALE_WHILE_REVALIDATE: show the cache now, refresh if old
            // [ ] NETWORK_FIRST: the network, then a recent cache entry
        }
        return out
    }
}

// ---------------------------------------------------------------- test runner (do not change)
// Lines: at <minute> | net up <value> | net down | seed <key> <value> <fetchedAt> | get <key> <cache_first|swr|network_first>
fun main() {
    var now = 0
    var netValue: String? = null
    val repo = Repository { _ -> netValue }
    for (line in generateSequence(::readLine)) {
        if (line.isBlank()) continue
        val p = line.trim().split(" ")
        when (p[0]) {
            "at" -> now = p[1].toInt()
            "net" -> netValue = if (p[1] == "up") p[2] else null
            "seed" -> repo.cache[p[1]] = Entry(p[2], p[3].toInt())
            "get" -> {
                val policy = when (p[2]) {
                    "cache_first" -> Policy.CACHE_FIRST
                    "swr" -> Policy.STALE_WHILE_REVALIDATE
                    else -> Policy.NETWORK_FIRST
                }
                val got = repo.load(p[1], policy, now)
                val entry = repo.cache[p[1]]?.let { "${it.value}@${it.fetchedAt}" } ?: "none"
                println("@$now get ${p[1]} ${p[2]} -> $got cache=$entry")
            }
            else -> error("unknown line ${p[0]}")
        }
    }
}
