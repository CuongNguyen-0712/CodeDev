// Cho Xanh - mini project: the cart and its checkout summary.
//
// Implement Long.vnd() and the Cart class. The test runner builds the catalog, sends the
// commands to your cart and prints what each function returns.
//
// Commands (stdin, one per line; the runner parses them):
//   product SKU PRICE STOCK NAME...   a catalog entry (all product lines come first)
//   add SKU QTY                       -> cart.add(sku, qty)
//   remove SKU                        -> cart.remove(sku)
//   voucher CODE                      -> cart.applyVoucher(code)
//   checkout                          -> cart.checkout(), one printed line per element
//
// add(sku, qty) returns, checking in this order:
//   "rejected: quantity must be at least 1"         qty < 1
//   "rejected: unknown product SUA-99"              sku not in the catalog
//   "rejected: only 30 x Trung ga ta in stock"      the quantity ALREADY in the cart plus qty
//                                                   would be more than the stock
//   "added 2 x Rau muong"                           otherwise; adding a product that is already
//                                                   in the cart increases that line's quantity
// remove(sku) returns "removed Rau muong", or "rejected: SUA-99 is not in the cart".
// applyVoucher(code) returns "rejected: unknown voucher XYZ" (the saved voucher stays),
//   "voucher TET10 saved", or "voucher GIAM30K saved (replaces TET10)". Only one voucher is kept;
//   whether it applies is decided at checkout.
// checkout() returns ["cart is empty"] for an empty cart, otherwise, in this order:
//   one line per cart line, in the order the products were first added:  "2 x Rau muong: 30,000 VND"
//   "subtotal: 215,000 VND"
//   the voucher line, if a voucher is saved:
//     PercentOff / AmountOff that apply:  "discount TET10: -21,500 VND"
//     PercentOff / AmountOff below their minimum subtotal:
//                                         "voucher GIAM30K not applied (minimum 300,000 VND)"
//     FreeShipping: no voucher line; the shipping line becomes "shipping: 0 VND (FREESHIP)"
//   "shipping: 15,000 VND" when the SUBTOTAL is below 300,000 VND, "shipping: 0 VND" otherwise
//   "total: 208,500 VND"                 subtotal - discount + shipping
// Discounts: PercentOff = subtotal * percent / 100 (rounded down), at most maxDiscount.
//            AmountOff = amount, but never more than the subtotal.
//            Both apply only when subtotal >= minSubtotal.
// Long.vnd(): 1250000 -> "1,250,000 VND", 0 -> "0 VND". Amounts here are never negative.

data class Product(val sku: String, val name: String, val price: Long, val stock: Int)

data class CartLine(val product: Product, val qty: Int)

sealed interface Voucher {
    val code: String

    data class PercentOff(override val code: String, val percent: Int, val maxDiscount: Long, val minSubtotal: Long) : Voucher
    data class AmountOff(override val code: String, val amount: Long, val minSubtotal: Long) : Voucher
    data class FreeShipping(override val code: String) : Voucher
}

val VOUCHERS: Map<String, Voucher> = listOf(
    Voucher.PercentOff("TET10", percent = 10, maxDiscount = 50_000, minSubtotal = 200_000),
    Voucher.PercentOff("BIG20", percent = 20, maxDiscount = 100_000, minSubtotal = 0),
    Voucher.AmountOff("GIAM30K", amount = 30_000, minSubtotal = 300_000),
    Voucher.FreeShipping("FREESHIP"),
).associateBy { it.code }

const val FREE_SHIPPING_FROM = 300_000L
const val SHIPPING_FEE = 15_000L

fun Long.vnd(): String = toString().reversed().chunked(3).joinToString(",").reversed() + " VND"

/** The discount of a voucher for this subtotal, or null when the subtotal is below its minimum. */
fun discountFor(v: Voucher, subtotal: Long): Long? = when (v) {
    is Voucher.PercentOff -> if (subtotal < v.minSubtotal) null else minOf(subtotal * v.percent / 100, v.maxDiscount)
    is Voucher.AmountOff -> if (subtotal < v.minSubtotal) null else minOf(v.amount, subtotal)
    is Voucher.FreeShipping -> 0
}

fun minimumOf(v: Voucher): Long = when (v) {
    is Voucher.PercentOff -> v.minSubtotal
    is Voucher.AmountOff -> v.minSubtotal
    is Voucher.FreeShipping -> 0
}

class Cart(private val catalog: Map<String, Product>) {
    private val lines = mutableListOf<CartLine>()
    private var voucher: Voucher? = null

    fun add(sku: String, qty: Int): String {
        if (qty < 1) return "rejected: quantity must be at least 1"
        val product = catalog[sku] ?: return "rejected: unknown product $sku"
        val index = lines.indexOfFirst { it.product.sku == sku }
        val inCart = if (index >= 0) lines[index].qty else 0
        if (inCart + qty > product.stock) return "rejected: only ${product.stock} x ${product.name} in stock"
        if (index >= 0) lines[index] = lines[index].copy(qty = inCart + qty) else lines += CartLine(product, qty)
        return "added $qty x ${product.name}"
    }

    fun remove(sku: String): String {
        val line = lines.find { it.product.sku == sku } ?: return "rejected: $sku is not in the cart"
        lines -= line
        return "removed ${line.product.name}"
    }

    fun applyVoucher(code: String): String {
        val new = VOUCHERS[code] ?: return "rejected: unknown voucher $code"
        val old = voucher
        voucher = new
        return if (old == null) "voucher $code saved" else "voucher $code saved (replaces ${old.code})"
    }

    fun checkout(): List<String> {
        if (lines.isEmpty()) return listOf("cart is empty")
        val subtotal = lines.sumOf { it.qty * it.product.price }
        val v = voucher
        val discount = if (v == null) 0L else discountFor(v, subtotal) ?: 0L
        val shipping = if (v is Voucher.FreeShipping || subtotal - discount >= FREE_SHIPPING_FROM) 0L else SHIPPING_FEE
        return buildList {
            for (line in lines) add("${line.qty} x ${line.product.name}: ${(line.qty * line.product.price).vnd()}")
            add("subtotal: ${subtotal.vnd()}")
            if (v != null && v !is Voucher.FreeShipping) {
                val d = discountFor(v, subtotal)
                add(if (d == null) "voucher ${v.code} not applied (minimum ${minimumOf(v).vnd()})" else "discount ${v.code}: -${d.vnd()}")
            }
            add(if (v is Voucher.FreeShipping) "shipping: 0 VND (${v.code})" else "shipping: ${shipping.vnd()}")
            add("total: ${(subtotal - discount + shipping).vnd()}")
        }
    }
}

// ---------------------------------------------------------------- test runner (do not change)
fun main() {
    val catalog = mutableMapOf<String, Product>()
    var cart: Cart? = null
    for (line in generateSequence(::readLine)) {
        val f = line.trim().split(" ")
        if (f[0] == "product") {
            catalog[f[1]] = Product(f[1], f.drop(4).joinToString(" "), f[2].toLong(), f[3].toInt())
            continue
        }
        val c = cart ?: Cart(catalog.toMap()).also { cart = it }
        when (f[0]) {
            "add" -> println(c.add(f[1], f[2].toInt()))
            "remove" -> println(c.remove(f[1]))
            "voucher" -> println(c.applyVoucher(f[1]))
            "checkout" -> c.checkout().forEach(::println)
        }
    }
}
