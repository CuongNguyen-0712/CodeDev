// Cho Xanh - carts and "share my cart".
//
// Two bugs reached production:
//   1. Tapping "+" twice on the same product gives two lines of 1 instead of one line of 2,
//      because every tap loads the product again from the API (a new Product object).
//   2. "Share my cart" gives a friend a copy of your cart to edit. When the friend removes
//      or adds something, your cart changes too.
// Fix the code so that equal products are merged into one line, and a shared cart is fully
// independent of the cart it was copied from (in both directions). Keep the output format.
//
// Input (stdin), one command per line (the test runner parses it):
//   add OWNER SKU PRICE NAME...   add one unit of the product to OWNER's cart (a new Product
//                                 object is created for every line, like an API response)
//   share OWNER FRIEND            FRIEND gets a copy of OWNER's cart
//   remove OWNER SKU              remove the line with that SKU from OWNER's cart
//   show OWNER                    print OWNER's cart
// Output of show:
//   Lan: 2 x Rau muong (30000 VND), 1 x Trung ga ta (30000 VND) | total 60000 VND
//   Lan: empty

data class Product(val sku: String, val name: String, val price: Long)

data class CartLine(val product: Product, val qty: Int)

data class Cart(val owner: String, val lines: MutableList<CartLine>)

fun add(cart: Cart, product: Product) {
    val i = cart.lines.indexOfFirst { it.product == product }
    if (i >= 0) {
        cart.lines[i] = cart.lines[i].copy(qty = cart.lines[i].qty + 1)
    } else {
        cart.lines += CartLine(product, 1)
    }
}

fun share(cart: Cart, friend: String): Cart = Cart(friend, cart.lines)

fun remove(cart: Cart, sku: String) {
    cart.lines.removeAll { it.product.sku == sku }
}

fun show(cart: Cart): String {
    if (cart.lines.isEmpty()) return "${cart.owner}: empty"
    val items = cart.lines.joinToString(", ") { "${it.qty} x ${it.product.name} (${it.qty * it.product.price} VND)" }
    val total = cart.lines.sumOf { it.qty * it.product.price }
    return "${cart.owner}: $items | total $total VND"
}

// ---------------------------------------------------------------- test runner (do not change)
fun main() {
    val carts = mutableMapOf<String, Cart>()
    fun cartOf(owner: String) = carts.getOrPut(owner) { Cart(owner, mutableListOf()) }
    for (line in generateSequence(::readLine)) {
        val f = line.trim().split(" ")
        when (f[0]) {
            "add" -> add(cartOf(f[1]), Product(f[2], f.drop(4).joinToString(" "), f[3].toLong()))
            "share" -> carts[f[2]] = share(cartOf(f[1]), f[2])
            "remove" -> remove(cartOf(f[1]), f[2])
            "show" -> println(show(cartOf(f[1])))
        }
    }
}
