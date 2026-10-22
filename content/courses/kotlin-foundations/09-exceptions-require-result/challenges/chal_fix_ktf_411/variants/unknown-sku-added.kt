// Cho Xanh - the supplier price import.
//
// Suppliers send one line per product: SKU;PRICE (a price in whole VND, digits only).
// The current import "never fails": a price it cannot read becomes 0, a broken line is
// silently skipped, and an unknown SKU is added to the catalog. Last month one supplier
// wrote 18.500 instead of 18500 and 1,800 products were sold for 0 VND for 40 minutes.
//
// Fix importPrices (and parsePrice, or replace it) so that:
//   - a line is accepted only if it has the form SKU;PRICE, the PRICE is digits only,
//     between 1 and 100,000,000, and the SKU already exists in the catalog;
//   - a rejected line changes nothing and is reported with the FIRST reason that applies,
//     checked in this order:
//       missing price                  no ";" or nothing after it
//       invalid price "18.500"         anything but digits (the text without spaces around it)
//       price out of range: 0          outside 1..100,000,000
//       unknown sku RAU-99
//   - if MORE than half of the lines are rejected, nothing at all is applied (the file is
//     probably broken): report only the rejected lines, then "import aborted: R of T lines rejected".
//   - otherwise report every line in order and apply the accepted ones, then
//     "applied A of T lines".
// Report lines:
//   line 1: RAU-01 15000 -> 14000
//   line 2: rejected (invalid price "18.500")
//
// Input (stdin): one line per update (empty lines are ignored; line numbers count the others).
// The test runner starts from a fixed catalog, prints the report and then the catalog.

const val MAX_PRICE = 100_000_000L

data class PriceUpdate(val sku: String, val price: Long)

class RejectedLine(reason: String) : Exception(reason)

fun parseLine(line: String, catalog: Map<String, Long>): Result<PriceUpdate> = runCatching {
    val parts = line.split(";")
    if (parts.size < 2 || parts[1].isBlank()) throw RejectedLine("missing price")
    val sku = parts[0].trim()
    val text = parts[1].trim()
    val price = text.takeIf { t -> t.all { it.isDigit() } }?.toLongOrNull()
        ?: throw RejectedLine("invalid price \"$text\"")
    if (price !in 1..MAX_PRICE) throw RejectedLine("price out of range: $price")
    PriceUpdate(sku, price)
}

fun importPrices(lines: List<String>, catalog: MutableMap<String, Long>): List<String> {
    val results = lines.map { parseLine(it, catalog) }
    val rejected = results.count { it.isFailure }
    val report = mutableListOf<String>()
    if (rejected * 2 > lines.size) {
        results.forEachIndexed { i, r -> r.onFailure { report += "line ${i + 1}: rejected (${it.message})" } }
        report += "import aborted: $rejected of ${lines.size} lines rejected"
        return report
    }
    results.forEachIndexed { i, r ->
        r.onSuccess { u ->
            report += "line ${i + 1}: ${u.sku} ${catalog[u.sku]} -> ${u.price}"
            catalog[u.sku] = u.price
        }.onFailure { report += "line ${i + 1}: rejected (${it.message})" }
    }
    report += "applied ${lines.size - rejected} of ${lines.size} lines"
    return report
}

// ---------------------------------------------------------------- test runner (do not change)
fun main() {
    val catalog = mutableMapOf(
        "RAU-01" to 15_000L, "TRUNG-10" to 30_000L, "GAO-05" to 240_000L,
        "SUA-01" to 32_000L, "THIT-07" to 185_000L, "NUOC-MAM" to 85_000L,
    )
    val lines = generateSequence(::readLine).filter { it.isNotBlank() }.toList()
    importPrices(lines, catalog).forEach(::println)
    println("catalog: " + catalog.toSortedMap().entries.joinToString(", ") { "${it.key}=${it.value}" })
}
