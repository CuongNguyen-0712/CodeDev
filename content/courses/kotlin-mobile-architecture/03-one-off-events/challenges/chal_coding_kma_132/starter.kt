// Rice Rocket courier app: one-off messages ("New order", "Order cancelled") as state the UI acknowledges.
// The screen shows currentMessage(state); when the courier dismisses it, it calls messageShown(state, id).

data class UserMessage(val id: Long, val text: String)

data class CourierState(
    val orders: List<String> = emptyList(),
    val messages: List<UserMessage> = emptyList(),
    val nextId: Long = 1,
)

// [ ] Queue a message with its own id

fun orderAssigned(state: CourierState, orderId: String): CourierState =
    withMessage(state.copy(orders = state.orders + orderId), "New order $orderId")

// [ ] Drop the order and tell the courier, in one change

// [ ] The message the screen shows now

// [ ] The courier dismissed one message

// ---------------------------------------------------------------- test runner (do not change)
// Lines: assigned <id> | cancelled <id> | background | foreground | rotate | tap | tap-twice
// The simulated screen shows a message while it is visible and acknowledges it on tap
// ("tap-twice": the acknowledgement arrives twice, as after a fast double tap or a resent ack).
fun main() {
    var state = CourierState()
    var visible = true
    var showing: UserMessage? = null
    for (line in generateSequence(::readLine)) {
        if (line.isBlank()) continue
        val p = line.trim().split(" ", limit = 2)
        when (p[0]) {
            "assigned" -> state = orderAssigned(state, p[1])
            "cancelled" -> state = orderCancelled(state, p[1])
            "background" -> { visible = false; showing = null }
            "foreground" -> visible = true
            "rotate" -> showing = null
            "tap", "tap-twice" -> showing?.let { shown ->
                state = messageShown(state, shown.id)
                if (p[0] == "tap-twice") state = messageShown(state, shown.id)
                showing = null
            }
            else -> error("unknown line ${p[0]}")
        }
        if (visible && showing == null) showing = currentMessage(state)
        val shownText = showing?.let { "#${it.id} ${it.text}" } ?: "nothing"
        println("${line.trim()} -> showing $shownText | orders=${state.orders} | queued=${state.messages.size}")
    }
}
