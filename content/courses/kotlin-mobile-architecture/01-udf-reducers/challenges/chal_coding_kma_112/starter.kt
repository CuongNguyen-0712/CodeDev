// Rice Rocket courier app: the Deliveries screen as one immutable state and one pure reducer.
// DeliveriesViewModel calls `state.update { reduce(it, action) }`; the screen only reads the state.

data class Order(val id: String, val status: String)

data class DeliveriesState(
    val orders: List<Order> = emptyList(),
    val filter: String = "all",
    val loading: Boolean = false,
    val refreshing: Boolean = false,
    val error: String? = null,
)

sealed interface Action {
    data object Load : Action
    data object Refresh : Action
    data class Loaded(val orders: List<Order>) : Action
    data class LoadFailed(val message: String) : Action
    data class FilterChanged(val filter: String) : Action
    data class PickedUp(val orderId: String) : Action
}

fun reduce(state: DeliveriesState, action: Action): DeliveriesState = when (action) {
    // [ ] First load: show the spinner, drop an old error
    // [ ] Pull to refresh: keep the list on screen
    // [ ] Fresh orders arrived
    // [ ] The request failed
    // [ ] The courier picked a filter chip
    // [ ] The courier picked up one order
}

fun visibleOrders(state: DeliveriesState): List<Order> =
    if (state.filter == "all") state.orders else state.orders.filter { it.status == state.filter }

// ---------------------------------------------------------------- test runner (do not change)
// One action per line: load | refresh | loaded O1:new,O2:picked | failed <message> | filter <name> | picked <id>
// After each action it prints what the screen would show.
fun parse(line: String): Action {
    val parts = line.trim().split(" ", limit = 2)
    val arg = parts.getOrElse(1) { "" }
    return when (parts[0]) {
        "load" -> Action.Load
        "refresh" -> Action.Refresh
        "loaded" -> Action.Loaded(if (arg.isBlank()) emptyList() else arg.split(",").map {
            val (id, status) = it.split(":")
            Order(id, status)
        })
        "failed" -> Action.LoadFailed(arg)
        "filter" -> Action.FilterChanged(arg)
        "picked" -> Action.PickedUp(arg)
        else -> error("unknown action ${parts[0]}")
    }
}

fun main() {
    var state = DeliveriesState()
    for (line in generateSequence(::readLine)) {
        if (line.isBlank()) continue
        state = reduce(state, parse(line))
        val shown = visibleOrders(state).joinToString(",") { "${it.id}:${it.status}" }
        println("${line.trim()} -> spinner=${state.loading} refreshing=${state.refreshing} error=${state.error} filter=${state.filter} list=[$shown]")
    }
}
