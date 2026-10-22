// Cho Xanh - checkout summary for one cart.
//
// Input (stdin): one cart line per line, fields separated by spaces:
//   SKU  QTY  UNIT_PRICE  NAME...
//   e.g. RAU-01 2 15000 Rau muong
//   QTY and UNIT_PRICE are whole numbers that fit in an Int; prices are whole dong (VND).
//   The NAME can contain spaces. An empty input is an empty cart.
//
// Write the three functions below. The test runner at the bottom prints:
//   2 x Rau muong: 30000 VND          one line per cart line: QTY x NAME: lineTotal VND
//   items: N                           the sum of all quantities
//   subtotal: S VND                    the sum of all line totals
//   shipping: F VND                    shippingFee(subtotal, items)
//   free shipping: P% (R VND to go)    P = progress with one decimal, R = what is still missing
//   free shipping: unlocked            instead, once the subtotal reaches the threshold
//   total: T VND                       subtotal + shipping
//
// Rules:
//   lineTotal(qty, unitPrice)    qty x unitPrice. Restaurants order wholesale:
//                                500 x 4,500,000 VND is 2,250,000,000 VND, more than an Int holds.
//   shippingFee(subtotal, items) 0 for an empty cart (nothing to deliver), 0 when the subtotal is
//                                at least FREE_SHIPPING_FROM, otherwise SHIPPING_FEE.
//   freeShippingProgress(s)      how far the subtotal is towards FREE_SHIPPING_FROM, in percent,
//                                as a Double. It is only called while the subtotal is below
//                                FREE_SHIPPING_FROM: 245,000 VND -> 81.66... (printed as 81.7).
//
// Example input:
//   RAU-01 2 15000 Rau muong
//   THIT-07 1 185000 Thit bo Uc
//   TRUNG-10 1 30000 Trung ga ta
// Expected output:
//   2 x Rau muong: 30000 VND
//   1 x Thit bo Uc: 185000 VND
//   1 x Trung ga ta: 30000 VND
//   items: 4
//   subtotal: 245000 VND
//   shipping: 15000 VND
//   free shipping: 81.7% (55000 VND to go)
//   total: 260000 VND

const val FREE_SHIPPING_FROM = 300_000
const val SHIPPING_FEE = 15_000

fun lineTotal(qty: Int, unitPrice: Int): Long {
    return qty.toLong() * unitPrice
}

fun shippingFee(subtotal: Long, items: Int): Int {
    return when {
        subtotal >= FREE_SHIPPING_FROM -> 0
        else -> SHIPPING_FEE
    }
}

fun freeShippingProgress(subtotal: Long): Double {
    return subtotal.toDouble() / FREE_SHIPPING_FROM * 100
}

// ---------------------------------------------------------------- test runner (do not change)
fun main() {
    var items = 0
    var subtotal = 0L
    for (line in generateSequence(::readLine)) {
        if (line.isBlank()) continue
        val parts = line.trim().split(Regex("\\s+"), limit = 4)
        val qty = parts[1].toInt()
        val total = lineTotal(qty, parts[2].toInt())
        println("$qty x ${parts[3]}: $total VND")
        items += qty
        subtotal += total
    }
    val shipping = shippingFee(subtotal, items)
    println("items: $items")
    println("subtotal: $subtotal VND")
    println("shipping: $shipping VND")
    if (subtotal >= FREE_SHIPPING_FROM) {
        println("free shipping: unlocked")
    } else {
        println("free shipping: ${"%.1f".format(freeShippingProgress(subtotal))}% (${FREE_SHIPPING_FROM - subtotal} VND to go)")
    }
    println("total: ${subtotal + shipping} VND")
}
