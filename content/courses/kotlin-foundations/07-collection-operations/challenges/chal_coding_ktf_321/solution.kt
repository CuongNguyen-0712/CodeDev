// Cho Xanh - the daily sales report of all stores.
//
// The order export logs every status change, so the same order id can appear on several
// lines: an order delivered in the morning and refunded in the afternoon has two lines.
// Only the LAST line of each order id counts (its store, category, amount and status).
//
// Write summarize with collection operations (associateBy, filter, groupBy, sumOf,
// sortedWith, maxWithOrNull, ...) - no index loops needed. Rules:
//   countsByStatus  number of orders (after keeping the last line per id) per status
//   revenue         sum of the amounts of DELIVERED orders only
//   byStore         revenue per store, delivered orders only, highest revenue first;
//                   on equal revenue, store names in alphabetical order.
//                   A store without delivered orders is not listed.
//   byCategory      the same, per category
//   topOrder        the delivered order with the largest amount; on equal amounts, the one
//                   whose id comes first alphabetically. null when nothing was delivered.
//   averageBasket   revenue / number of delivered orders, rounded down; null when nothing
//                   was delivered.
//
// Input (stdin): one line per status change: ORDER_ID STORE CATEGORY AMOUNT STATUS
//   STATUS is delivered, refunded or cancelled. e.g. CX-1001 kim-ma meat 245000 delivered
// The test runner prints the report.

data class Order(val id: String, val store: String, val category: String, val amount: Long, val status: String)

data class Report(
    val countsByStatus: Map<String, Int>,
    val revenue: Long,
    val byStore: List<Pair<String, Long>>,
    val byCategory: List<Pair<String, Long>>,
    val topOrder: Order?,
    val averageBasket: Long?,
)

fun revenueBy(delivered: List<Order>, key: (Order) -> String): List<Pair<String, Long>> =
    delivered.groupBy(key)
        .map { (name, orders) -> name to orders.sumOf { it.amount } }
        .sortedWith(compareByDescending<Pair<String, Long>> { it.second }.thenBy { it.first })

fun summarize(lines: List<Order>): Report {
    val orders = lines.associateBy { it.id }.values.toList()
    val delivered = orders.filter { it.status == "delivered" }
    val revenue = delivered.sumOf { it.amount }
    return Report(
        countsByStatus = orders.groupingBy { it.status }.eachCount(),
        revenue = revenue,
        byStore = revenueBy(delivered) { it.store },
        byCategory = revenueBy(delivered) { it.category },
        topOrder = delivered.maxWithOrNull(compareBy<Order> { it.amount }.thenByDescending { it.id }),
        averageBasket = if (delivered.isEmpty()) null else revenue / delivered.size,
    )
}

// ---------------------------------------------------------------- test runner (do not change)
fun main() {
    val lines = generateSequence(::readLine).filter { it.isNotBlank() }.map { line ->
        val f = line.trim().split(" ")
        Order(f[0], f[1], f[2], f[3].toLong(), f[4])
    }.toList()
    val r = summarize(lines)
    val c = r.countsByStatus
    println("orders: ${c.values.sum()} (delivered ${c["delivered"] ?: 0}, refunded ${c["refunded"] ?: 0}, cancelled ${c["cancelled"] ?: 0})")
    println("revenue: ${r.revenue} VND")
    for ((store, amount) in r.byStore) println("store $store: $amount VND")
    for ((category, amount) in r.byCategory) println("category $category: $amount VND")
    println("top order: ${r.topOrder?.let { "${it.id} ${it.store} ${it.amount} VND" } ?: "none"}")
    println("average basket: ${r.averageBasket?.let { "$it VND" } ?: "n/a"}")
}
