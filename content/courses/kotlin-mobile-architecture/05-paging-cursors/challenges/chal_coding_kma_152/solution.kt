// Rice Rocket courier app: the delivery history list, paged with server cursors.
// The server returns orders newest first; `next` is the cursor for the following page (null at the end).

data class Page(val ids: List<Int>, val next: Int?)
data class Request(val key: Int?, val gen: Int)

class Pager(private val pageSize: Int, private val prefetch: Int) {
    val ids = mutableListOf<Int>()
    var nextKey: Int? = null
    var endReached = false
    var loading = false
    var generation = 0
    val pending = ArrayDeque<Request>()

    private fun request(key: Int?) {
        loading = true
        pending.addLast(Request(key, generation))
    }

    // @piece refresh: Start over from the newest orders
    fun refresh() {
        generation++
        nextKey = null
        endReached = false
        request(null)
    }
    // @end

    fun onScroll(lastVisible: Int) {
        // @piece should-append: Ask for the next page near the end, once
        if (!loading && !endReached && lastVisible >= ids.size - prefetch) request(nextKey)
        // @end
    }

    fun onPage(req: Request, page: Page) {
        // @piece drop-stale: Pages requested before the last refresh change nothing
        if (req.gen != generation) return
        // @end
        // @piece apply-page: Replace on refresh, append otherwise, remember the cursor
        if (req.key == null) { ids.clear() }
        ids += page.ids
        nextKey = page.next
        endReached = page.next == null
        loading = false
        // @end
    }
}

// ---------------------------------------------------------------- test runner (do not change)
// Lines: refresh | scroll <last visible index> | deliver (the server answers the oldest pending request)
//        | insert <n> (n new orders arrive on the server)
// The server starts with orders 1000 down to 989; page size 5, prefetch distance 2.
fun main() {
    val server = (1000 downTo 989).toMutableList()
    fun serve(key: Int?, limit: Int): Page {
        val from = if (key == null) 0 else server.indexOfFirst { it < key }.let { if (it < 0) server.size else it }
        val ids = server.drop(from).take(limit)
        val more = from + ids.size < server.size
        return Page(ids, if (more) ids.last() else null)
    }
    val pager = Pager(pageSize = 5, prefetch = 2)
    for (line in generateSequence(::readLine)) {
        if (line.isBlank()) continue
        val p = line.trim().split(" ")
        when (p[0]) {
            "refresh" -> pager.refresh()
            "scroll" -> pager.onScroll(p[1].toInt())
            "deliver" -> pager.pending.removeFirstOrNull()?.let { pager.onPage(it, serve(it.key, 5)) }
            "insert" -> repeat(p[1].toInt()) { server.add(0, server.first() + 1) }
            else -> error("unknown line ${p[0]}")
        }
        val shown = if (pager.ids.isEmpty()) "[]" else "[${pager.ids.first()}..${pager.ids.last()}]"
        val dupes = pager.ids.size - pager.ids.toSet().size
        println("${line.trim()} -> items=${pager.ids.size} $shown next=${pager.nextKey} end=${pager.endReached} loading=${pager.loading} pending=${pager.pending.size} dupes=$dupes")
    }
}
