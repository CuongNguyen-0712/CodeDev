// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Kotlin code uses ${...} templates, which a JS template literal would evaluate: write them as #{...}, kt() puts the $ back.
const kt = (strings, ...values) => String.raw(strings, ...values).replaceAll("#{", "${");

export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-ktf-3-2",
    title: "map, filter, groupBy & fold",
    slug: { _type: "slug", current: "kotlin-map-filter-groupby-fold" },
    description:
        "For a month, Cho Xanh's daily sales report showed revenue 6-12% higher than the bank. Orders refunded in the afternoon were still counted from the morning's 'delivered' line, inside one loop that mixed every concern. Learn the collection operations Kotlin developers use every day: map, filter, sumOf, count, any and all, first and firstOrNull, sorting with comparators, associateBy, groupBy, groupingBy, partition, fold, and when to use a sequence.",
    estimatedTime: 18,

    scenario: {
        role: "Junior backend developer on the data team at Cho Xanh, a grocery delivery app in Hanoi",
        problem:
            "Every night a Kotlin job reads the day's order export and writes revenue per store and per category to the management dashboard. Store bonuses depend on it. At the end of the month, finance found the dashboard 6-12% above the money that actually arrived: refunded orders had been counted as revenue all month.",
    },

    content: [
        h2("1. The incident"),
        p("The order export is a log: every time an order changes status, the system writes a new line with the order id, the store, the category, the amount and the new status. An order delivered at 10:00 and refunded at 15:20 (the eggs were broken) has two lines, one `delivered` and one `refunded`."),
        p("The nightly report job was written as a single loop: for each line, if the status is `delivered`, add the amount to the total and to the store's running sum. It had worked for a year, because refunds used to be rare and were processed the next day, in the next day's export. In September, Cho Xanh started same-day refunds through the app."),
        bullets([
            "**Revenue on the dashboard** was 6-12% higher than the bank deposits for the whole of September.",
            "**Store bonuses** were calculated from the dashboard. The Kim Ma store, which has the most same-day refunds, was paid the largest bonus it had ever received.",
            "**The fix in the loop** was attempted twice: first by subtracting refund lines (which broke for orders refunded and then delivered again), then by tracking a set of 'seen' ids, which double-counted again for orders that changed status three times.",
        ]),

        h2("2. Reproduce it"),
        code("kotlin", kt`
data class Line(val id: String, val store: String, val amount: Long, val status: String)

fun main() {
    val export = listOf(
        Line("CX-2001", "kim-ma", 300_000, "delivered"),
        Line("CX-2002", "long-bien", 240_000, "delivered"),
        Line("CX-2001", "kim-ma", 300_000, "refunded"),   // the same order, refunded at 15:20
    )
    val revenueByStore = mutableMapOf<String, Long>()
    var total = 0L
    for (line in export) {
        if (line.status == "delivered") {
            total += line.amount
            revenueByStore[line.store] = (revenueByStore[line.store] ?: 0) + line.amount
        }
    }
    println("revenue: $total")
    println(revenueByStore)
}`, "report.kt"),
        code("text", `
revenue: 540000
{kim-ma=300000, long-bien=240000}`),
        p("The real revenue is 240,000 VND: CX-2001 ended the day refunded. The loop answers the wrong question (\"was this order ever delivered?\") and the right question (\"what is the order's status now?\") cannot be added without rewriting it, because one loop is doing four jobs at once: picking the current line of each order, choosing which orders count, grouping by store and adding up. Collection operations let you write each job as its own step."),

        h2("3. Transforming and filtering"),
        p("Kotlin's collections have dozens of functions that take a **lambda**: a small function in braces. Inside a lambda with one parameter, that parameter is called `it`. Each function returns a new value and leaves the original collection untouched (lesson 6)."),
        code("kotlin", kt`
data class Order(val id: String, val store: String, val category: String, val amount: Long, val status: String)

val orders = listOf(
    Order("CX-1001", "kim-ma", "meat", 245_000, "delivered"),
    Order("CX-1002", "kim-ma", "vegetables", 60_000, "delivered"),
    Order("CX-1003", "cau-giay", "dairy", 120_000, "delivered"),
    Order("CX-1004", "cau-giay", "meat", 185_000, "cancelled"),
)

fun main() {
    val delivered = orders.filter { it.status == "delivered" }
    println(delivered.map { it.id })
    println(delivered.sumOf { it.amount })
    println(orders.count { it.status == "cancelled" })
    println(orders.any { it.amount > 200_000 })
    println(orders.all { it.amount > 0 })
    println(orders.firstOrNull { it.store == "tay-ho" })
    println(orders.map { it.store }.distinct())
    println(delivered.sortedByDescending { it.amount }.take(2).joinToString { "#{it.id}=#{it.amount}" })
    println(delivered.maxByOrNull { it.amount }?.id)
}`, "operations.kt"),
        code("text", `
[CX-1001, CX-1002, CX-1003]
425000
1
true
true
null
[kim-ma, cau-giay]
CX-1001=245000, CX-1003=120000
CX-1001`),
        bullets([
            "**`filter { }`** keeps the elements for which the lambda is true; `filterNot` the others.",
            "**`map { }`** turns every element into something else: a list of orders into a list of ids.",
            "**`sumOf { }`**, **`count { }`**: add up or count, with the lambda choosing the value or the condition. `sumOf` returns a `Long` when the lambda returns a `Long`.",
            "**`any`, `all`, `none`** answer yes/no questions and stop at the first element that decides.",
            "**`first { }`** throws when nothing matches; **`firstOrNull { }`** returns `null` (lesson 2). The same pair exists for `last`, `single`, `maxBy`, `minBy`.",
            "**`sortedBy`, `sortedByDescending`, `take`, `distinct`, `joinToString`** read like the sentence they implement.",
        ]),
        callout("tip", "Name the steps",
            "A chain like orders.filter { ... }.map { ... }.sumOf { ... } reads top to bottom as a list of decisions. When a chain gets long, give the intermediate results names (val delivered = ...): it costs nothing and makes the code explain itself."),

        h2("4. Grouping, indexing and folding"),
        code("kotlin", kt`
// Order and orders as in operations.kt
fun main() {
    val byStore: Map<String, List<Order>> = orders.groupBy { it.store }
    println(byStore.mapValues { (_, list) -> list.map { it.id } })
    println(orders.groupingBy { it.status }.eachCount())
    println(orders.associateBy { it.id }.keys)
    val (big, small) = orders.partition { it.amount >= 150_000 }
    println("#{big.size} big, #{small.size} small")
    println(orders.fold(0L) { sum, o -> if (o.status == "delivered") sum + o.amount else sum })
    val ranking = orders.groupBy { it.category }
        .map { (category, list) -> category to list.sumOf { it.amount } }
        .sortedWith(compareByDescending<Pair<String, Long>> { it.second }.thenBy { it.first })
    println(ranking)
    val latest = listOf("CX-1" to "delivered", "CX-2" to "delivered", "CX-1" to "refunded").associate { it }
    println(latest)
}`, "grouping.kt"),
        code("text", `
{kim-ma=[CX-1001, CX-1002], cau-giay=[CX-1003, CX-1004]}
{delivered=3, cancelled=1}
[CX-1001, CX-1002, CX-1003, CX-1004]
2 big, 2 small
425000
[(meat, 430000), (dairy, 120000), (vegetables, 60000)]
{CX-1=refunded, CX-2=delivered}`),
        bullets([
            "**`groupBy { key }`** builds a `Map<Key, List<T>>`: every element goes into the list of its key. The map keeps the order in which keys first appeared.",
            "**`groupingBy { key }.eachCount()`** counts per key without building the lists.",
            "**`associateBy { key }`** builds a `Map<Key, T>` with **one** element per key. When several elements have the same key, **the last one wins**. That is exactly 'the current line of each order'.",
            "**`partition { }`** splits into a `Pair` of lists, matching and not matching, which destructures nicely.",
            "**`fold(initial) { acc, element -> ... }`** carries an accumulator through the collection. Use it when no ready-made function (`sumOf`, `count`, `groupBy`) fits; when one fits, it says more.",
            "**`sortedWith(compareBy...)`** sorts by several keys: `compareByDescending { revenue }.thenBy { name }` gives a stable, predictable ranking even when two stores earn the same.",
        ]),
        image("report-pipeline", {
            alt: "Top: the report as a pipeline of four boxes. The export has 3 lines: CX-2001 kim-ma 300000 delivered, CX-2002 long-bien 240000 delivered, and in red CX-2001 kim-ma 300000 refunded. associateBy { it.id } keeps one entry per id, the last line wins: CX-2001 refunded and CX-2002 delivered. filter { delivered } keeps CX-2002 long-bien 240000. groupBy { it.store } gives long-bien -> [CX-2002], and mapValues { sumOf } gives long-bien -> 240000. Bottom left, in red, the old loop: for each line, if the status is delivered, add to the total and to the store's sum; it counts CX-2001's morning line and reports revenue 540000. Bottom right, in green, the pipeline with one decision per step: which line describes the order now (associateBy), which orders earn money (filter), per store (groupBy + sumOf), in which order (sortedWith compareBy); revenue 240000.",
            caption: "Each step answers one question. The bug was a missing step, and in the pipeline it is one line.",
        }),

        h2("5. Lambdas, it and destructuring"),
        bullets([
            "**`{ it.amount }`** is short for `{ order -> order.amount }`. Name the parameter when `it` would be unclear, especially in nested lambdas.",
            "**Destructuring in lambdas**: `.map { (category, list) -> ... }` takes a map entry or a `Pair` apart (lesson 4). Use `_` for a part you do not need: `{ (_, list) -> ... }`.",
            "**Trailing lambdas**: when the last parameter is a function, the lambda goes outside the parentheses, and the parentheses disappear when it is the only one: `orders.filter { ... }`.",
            "**Function references**: `.map(Order::id)` is the same as `.map { it.id }`; `generateSequence(::readLine)` passes the function `readLine` itself.",
        ]),
        h3("Sequences for long chains on big data"),
        p("Each list operation builds a complete intermediate list. For a few thousand orders that is irrelevant. For a 10-million-line export, `export.asSequence().filter { ... }.map { ... }.take(100).toList()` processes elements one at a time and stops early, without the intermediate lists. Start with lists; switch to a sequence when profiling says so."),

        h2("6. The fix"),
        code("kotlin", kt`
// Line as in the first version of report.kt
fun main() {
    val export = listOf(
        Line("CX-2001", "kim-ma", 300_000, "delivered"),
        Line("CX-2002", "long-bien", 240_000, "delivered"),
        Line("CX-2001", "kim-ma", 300_000, "refunded"),
    )
    val delivered = export
        .associateBy { it.id }          // last line per order id wins
        .values
        .filter { it.status == "delivered" }
    val revenueByStore = delivered
        .groupBy { it.store }
        .mapValues { (_, lines) -> lines.sumOf { it.amount } }
    println("revenue: #{delivered.sumOf { it.amount }}")
    println(revenueByStore)
}`, "report.kt"),
        code("text", `
revenue: 240000
{long-bien=240000}`),
        numbered([
            "**`associateBy { it.id }`** answers \"what is each order's status now?\": the export is in time order, and the last line per id wins. Orders refunded and then delivered again, or cancelled and then delivered, come out right without special cases.",
            "**`.values.filter { ... }`** decides which orders earn money, separately from how the money is grouped.",
            "**`groupBy` + `mapValues { sumOf }`** groups and adds up. Adding a 'per category' report is one more `groupBy`, not another branch in the loop.",
            "**Finance** recalculated September from the corrected job; the data team added a test with one order per tricky history (refunded, refunded then re-delivered, cancelled then delivered).",
        ]),

        h2("7. Your turn"),
        p("Write the full daily report: order counts per status, revenue, revenue per store and per category (highest first, ties alphabetical), the top order and the average basket. Only the last line of each order counts, and a day without delivered orders has no top order and no average."),
        challenge("chal_coding_ktf_321", "Start with associateBy to get one order per id, then filter the delivered ones and reuse that list for everything that is about money. A small helper that groups, sums and sorts by any key saves writing the ranking twice. For the top order, compareBy { amount } plus a tie-breaker on the id gives a deterministic answer."),

        h2("8. Pitfalls"),
        bullets([
            "**Counting events instead of entities**: a log has several lines per order. Decide which line represents the order (usually the last) before you count anything.",
            "**`first { }` on data that may not match**: it throws `NoSuchElementException`. Use `firstOrNull` and decide what nothing means.",
            "**`associateBy` silently dropping duplicates**: that is the point when you want the last value, and a bug when you expected every element. Use `groupBy` to keep them all.",
            "**Sorting without a tie-breaker**: equal values keep their input order, so the ranking changes when the input order changes. Add `thenBy`.",
            "**Average of an empty list**: `sum / size` with a size of 0 throws for integers. Check `isEmpty()` first and return `null` or a text.",
            "**`fold` for everything**: it works, but `sumOf`, `count` and `groupingBy` say what you mean.",
        ]),

        h2("9. Checklist"),
        bullets([
            "Reports first reduce events to entities (`associateBy`, `groupBy`), then filter, then aggregate.",
            "Each step in a chain does one thing, and long chains have named intermediate values.",
            "Rankings use `sortedWith` with an explicit tie-breaker.",
            "`OrNull` variants are used wherever 'nothing' is possible, and empty input has a defined output.",
            "Tests cover the histories that broke the loop: refunded, re-delivered, cancelled then delivered.",
        ]),
        p("Next lesson: extension functions and scope functions. A `?.let { } ?: run { }` sent customers a push notification and an SMS for the same order."),
    ],
});
