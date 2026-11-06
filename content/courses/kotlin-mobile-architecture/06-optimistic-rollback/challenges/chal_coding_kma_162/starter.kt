// Rice Rocket courier app: the order list shows a courier's tap at once (optimistic) and falls
// back to the server's state when the api refuses the change.
//
// Status flow per order: ASSIGNED -> PICKED_UP -> DELIVERED. A tap asks for the next status.
// Every change that is sent carries a client mutation id, the idempotency key the api dedupes on.
// The screen shows the last server snapshot with the pending changes applied on top, in order.

enum class Status { ASSIGNED, PICKED_UP, DELIVERED }

data class Pending(val id: String, val orderId: String, val to: Status)

class OrderStore {
    private val server = sortedMapOf<String, Status>()
    private val pending = mutableListOf<Pending>()

    /** What the courier sees: the server state with every pending change applied on top. */
    fun visible(): Map<String, Status> {
        // [ ] Server snapshot with the pending changes on top
    }

    fun isPending(orderId: String) = pending.any { it.orderId == orderId }

    /** A push or a refresh from the api: the new truth for that order. */
    fun onServer(orderId: String, status: Status) {
        // [ ] Take the server's status, keep the pending changes
    }

    /** The courier tapped a step. Returns the change to send, or null when the tap is ignored. */
    fun onTap(mutationId: String, orderId: String, to: Status): Pending? {
        // [ ] Accept only the next step of what the courier sees
    }

    /** The api accepted the change: it becomes part of the server state. */
    fun onAck(mutationId: String, status: Status) {
        // [ ] Make the accepted change server state
    }

    /** The api refused the change (or it failed for good). Returns the message for the courier. */
    fun onFail(mutationId: String, reason: String): String? {
        // [ ] Drop the failed change and the ones queued after it
    }
}

// ---------------------------------------------------------------- test runner (do not change)
// One command per line: server <order> <STATUS> | tap <mutation> <order> <STATUS> |
// ack <mutation> <STATUS> | fail <mutation> <reason...> | show
fun main() {
    val store = OrderStore()
    for (raw in generateSequence(::readLine)) {
        val line = raw.trim()
        if (line.isEmpty()) continue
        val p = line.split(" ")
        when (p[0]) {
            "server" -> store.onServer(p[1], Status.valueOf(p[2]))
            "tap" -> {
                val sent = store.onTap(p[1], p[2], Status.valueOf(p[3]))
                println(if (sent == null) "ignored ${p[1]}" else "send ${sent.id} ${sent.orderId} ${sent.to}")
            }
            "ack" -> store.onAck(p[1], Status.valueOf(p[2]))
            "fail" -> println(store.onFail(p[1], p.drop(2).joinToString(" ")) ?: "unknown ${p[1]}")
            "show" -> println(store.visible().entries.joinToString(" ") { (id, s) -> "$id=$s" + if (store.isPending(id)) "*" else "" })
            else -> error("unknown command: $line")
        }
    }
}
