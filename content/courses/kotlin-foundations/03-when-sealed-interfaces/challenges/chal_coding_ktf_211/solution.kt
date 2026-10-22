// Cho Xanh - the order tracking timeline.
//
// The backend sends the events of one order; the app shows one line per event and the
// current status. The events are modelled as a sealed interface (below). Write describe and
// status with `when` expressions that list every event type - no `else` branch - so that the
// compiler points at them the day someone adds a new event.
//
// Input (stdin): one event per line (the test runner parses it for you):
//   placed TOTAL                    Placed(total)
//   paid cash|card|wallet AMOUNT    Paid(method, amount)
//   picking                         Picking
//   out_for_delivery DRIVER...      OutForDelivery(driver)
//   delivered [RECEIVED_BY...]      Delivered(receivedBy), receivedBy is null when not given
//   refunded AMOUNT REASON...       Refunded(amount, reason)
//   cancelled customer|store        Cancelled(byCustomer)
//
// describe(event) - one timeline line:
//   Placed           "Order placed: 245000 VND"
//   Paid in CASH     "Cash on delivery: 245000 VND"
//   Paid otherwise   "Paid 245000 VND by card"  /  "Paid 245000 VND by wallet"
//   Picking          "Picking your groceries"
//   OutForDelivery   "Tuan is on the way"
//   Delivered        "Delivered"  or, with receivedBy, "Delivered to the guard"
//   Refunded         "Refunded 30000 VND (out of stock: Trung ga ta)"
//   Cancelled        "Cancelled by you" (byCustomer) or "Cancelled by Cho Xanh"
//
// status(events) - the label of the LAST event that is not a Refunded (refunds never change
// the status of an order):
//   Placed "Placed", Paid in CASH "Confirmed, pay on delivery", Paid otherwise "Confirmed",
//   Picking "Picking", OutForDelivery "On the way", Delivered "Delivered", Cancelled "Cancelled".
//   "No updates yet" when there is no such event (no events at all, or only refunds).
//
// The runner prints every describe(...) line, then "Status: " + status(events).

enum class PaymentMethod { CASH, CARD, WALLET }

sealed interface OrderEvent {
    data class Placed(val total: Long) : OrderEvent
    data class Paid(val method: PaymentMethod, val amount: Long) : OrderEvent
    data object Picking : OrderEvent
    data class OutForDelivery(val driver: String) : OrderEvent
    data class Delivered(val receivedBy: String?) : OrderEvent
    data class Refunded(val amount: Long, val reason: String) : OrderEvent
    data class Cancelled(val byCustomer: Boolean) : OrderEvent
}

fun describe(e: OrderEvent): String = when (e) {
    is OrderEvent.Placed -> "Order placed: ${e.total} VND"
    is OrderEvent.Paid if e.method == PaymentMethod.CASH -> "Cash on delivery: ${e.amount} VND"
    is OrderEvent.Paid -> "Paid ${e.amount} VND by ${e.method.name.lowercase()}"
    OrderEvent.Picking -> "Picking your groceries"
    is OrderEvent.OutForDelivery -> "${e.driver} is on the way"
    is OrderEvent.Delivered -> if (e.receivedBy == null) "Delivered" else "Delivered to ${e.receivedBy}"
    is OrderEvent.Refunded -> "Refunded ${e.amount} VND (${e.reason})"
    is OrderEvent.Cancelled -> if (e.byCustomer) "Cancelled by you" else "Cancelled by Cho Xanh"
}

fun status(events: List<OrderEvent>): String =
    when (val last = events.lastOrNull { it !is OrderEvent.Refunded }) {
        null, is OrderEvent.Refunded -> "No updates yet"
        is OrderEvent.Placed -> "Placed"
        is OrderEvent.Paid if last.method == PaymentMethod.CASH -> "Confirmed, pay on delivery"
        is OrderEvent.Paid -> "Confirmed"
        OrderEvent.Picking -> "Picking"
        is OrderEvent.OutForDelivery -> "On the way"
        is OrderEvent.Delivered -> "Delivered"
        is OrderEvent.Cancelled -> "Cancelled"
    }

// ---------------------------------------------------------------- test runner (do not change)
fun parse(line: String): OrderEvent {
    val parts = line.trim().split(" ")
    val rest = parts.drop(1)
    return when (parts[0]) {
        "placed" -> OrderEvent.Placed(rest[0].toLong())
        "paid" -> OrderEvent.Paid(PaymentMethod.valueOf(rest[0].uppercase()), rest[1].toLong())
        "picking" -> OrderEvent.Picking
        "out_for_delivery" -> OrderEvent.OutForDelivery(rest.joinToString(" "))
        "delivered" -> OrderEvent.Delivered(rest.joinToString(" ").ifEmpty { null })
        "refunded" -> OrderEvent.Refunded(rest[0].toLong(), rest.drop(1).joinToString(" "))
        "cancelled" -> OrderEvent.Cancelled(rest[0] == "customer")
        else -> error("unknown event: $line")
    }
}

fun main() {
    val events = generateSequence(::readLine).filter { it.isNotBlank() }.map(::parse).toList()
    for (e in events) println(describe(e))
    println("Status: ${status(events)}")
}
