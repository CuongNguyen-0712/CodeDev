// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Kotlin code uses ${...} templates, which a JS template literal would evaluate: write them as #{...}, kt() puts the $ back.
const kt = (strings, ...values) => String.raw(strings, ...values).replaceAll("#{", "${");

export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-ktf-4-2",
    title: "Mini project: a shopping cart summary",
    slug: { _type: "slug", current: "kotlin-mini-project-shopping-cart-summary" },
    description:
        "Cho Xanh is rewriting its checkout as a small Kotlin module shared by the Android app and the backend, and you write the core: a cart with stock checks, removals, one voucher modelled as a sealed interface, and a checkout summary with formatted money. Every rule in it comes from a bug earlier in this course. Plan the model, keep state private, reject bad input with clear messages, decide with exhaustive when, compute with collection operations, and format with extension functions.",
    estimatedTime: 30,

    scenario: {
        role: "Kotlin developer on the checkout team at Cho Xanh, a grocery delivery app in Hanoi",
        problem:
            "The old checkout summary is a 400-line function that has produced most of the incidents in this course: integer division, !! crashes, duplicated lines, shared lists, swallowed errors. The team is replacing it with a small module with one clear owner for every rule, and the first piece is the cart.",
    },

    content: [
        h2("1. The brief"),
        p("After a year of incidents, the Cho Xanh checkout team wrote down what the cart must do, and what it must never do again. The list reads like a summary of this course:"),
        bullets([
            "**Money is a `Long` in whole dong**, multiplied and summed without overflow, and shown as `1,250,000 VND` (lesson 1).",
            "**Missing things are explicit**: an unknown product or voucher is a clear rejection, never a crash and never a default (lessons 2 and 9).",
            "**Vouchers are a closed family** with an exhaustive `when` over them, so a new voucher type cannot be forgotten (lesson 3).",
            "**Products are values**, and the same product added twice is one line (lesson 4).",
            "**The cart owns its state**: nobody outside can change the lines or the saved voucher, and every rule is checked inside (lessons 5 and 6).",
            "**The summary is computed**, not accumulated by hand: sums, lines and totals come from collection operations (lesson 7), formatted by extension functions (lesson 8).",
        ]),

        h2("2. The requirements"),
        p("The full specification is in the starter file of the challenge. The parts that matter for the design:"),
        numbered([
            "**Catalog**: products with a SKU, a name, a price and a stock. The cart receives it as a read-only `Map<String, Product>`.",
            "**`add(sku, qty)`**: rejects a quantity below 1, an unknown product, and a quantity that, together with what is **already in the cart**, would exceed the stock. Otherwise it adds a line or increases the existing one.",
            "**`remove(sku)`**: removes the whole line, or explains that the product is not in the cart.",
            "**`applyVoucher(code)`**: saves one voucher. An unknown code is rejected and **keeps** the voucher that was saved before; a new valid code replaces the old one and says so.",
            "**`checkout()`**: the lines, the subtotal, the voucher line (discount, or 'not applied' with the minimum, or nothing for free shipping), the shipping and the total. Shipping is free from 300,000 VND, measured **before** the discount. An empty cart is just `cart is empty`.",
        ]),
        callout("tip", "Write the edge cases down before the code",
            "For each rule, list the input that sits exactly on its edge: a quantity of 0, a second add that reaches the stock exactly, a subtotal of exactly 300,000 VND, a voucher whose minimum is one dong away, an empty cart. The hidden tests of the challenge are built from that kind of list, and so are good unit tests."),

        h2("3. The model"),
        p("Start with the types, because they decide what the rest of the code can get wrong. Products and cart lines are data classes with `val`s. Vouchers are a sealed interface, because the checkout must treat each kind differently and the compiler should check that every kind is handled. Here is the voucher family with one small function over it, a label for the voucher picker (not part of the challenge):"),
        code("kotlin", kt`
sealed interface Voucher {
    val code: String

    data class PercentOff(override val code: String, val percent: Int, val maxDiscount: Long, val minSubtotal: Long) : Voucher
    data class AmountOff(override val code: String, val amount: Long, val minSubtotal: Long) : Voucher
    data class FreeShipping(override val code: String) : Voucher
}

fun Long.vnd(): String = toString().reversed().chunked(3).joinToString(",").reversed() + " VND"

fun Voucher.label(): String = when (this) {
    is Voucher.PercentOff -> "$percent% off, up to #{maxDiscount.vnd()}, from #{minSubtotal.vnd()}"
    is Voucher.AmountOff -> "#{amount.vnd()} off from #{minSubtotal.vnd()}"
    is Voucher.FreeShipping -> "free shipping"
}

fun main() {
    val vouchers = listOf(
        Voucher.PercentOff("TET10", percent = 10, maxDiscount = 50_000, minSubtotal = 200_000),
        Voucher.AmountOff("GIAM30K", amount = 30_000, minSubtotal = 300_000),
        Voucher.FreeShipping("FREESHIP"),
    )
    val byCode = vouchers.associateBy { it.code }
    for (code in listOf("TET10", "FREESHIP", "XYZ")) {
        println("$code: #{byCode[code]?.label() ?: "unknown voucher"}")
    }
}`, "vouchers.kt"),
        code("text", `
TET10: 10% off, up to 50,000 VND, from 200,000 VND
FREESHIP: free shipping
XYZ: unknown voucher`),
        bullets([
            "**`val code: String` in the interface**: every voucher has a code, so code that only needs the code does not care about the kind.",
            "**Named arguments** make the voucher list readable: `percent = 10, maxDiscount = 50_000` cannot be confused.",
            "**`associateBy { it.code }`** turns the list into a lookup table; `byCode[code]` is `null` for an unknown code, and the elvis decides what to say.",
            "**An extension with a `when (this)`** keeps the formatting out of the model. Your discount logic can follow the same pattern: a function of a voucher and a subtotal that returns the discount, or `null` when the voucher does not apply.",
        ]),

        h2("4. The cart"),
        image("cart-architecture", {
            alt: "Architecture of the mini project. Commands on the left (add RAU-01 2, add SUA-99 1, remove RAU-01, voucher TET10, checkout) each return a message, accepted or rejected with a reason (lessons 2 and 9), and go into class Cart(catalog). Inside the cart: catalog: Map<String, Product> with data class Product and a map lookup that may give null (lessons 2, 4, 6); private lines and private voucher that only add, remove and applyVoucher change (lessons 5, 6); sealed interface Voucher with PercentOff, AmountOff and FreeShipping and one when without else per decision (lesson 3); checkout(): List<String> with sumOf over the lines, Long money and a buildList of output lines without mutation (lessons 1, 7). The checkout summary on the right shows 2 x Rau muong 30,000 VND, 1 x Thit bo Uc 185,000 VND, subtotal 215,000 VND, discount TET10 -21,500 VND, shipping 15,000 VND, total 208,500 VND, formatted by the Long.vnd() extension (lessons 1, 8). A yellow box lists the rules the tests check: quantity already in the cart counts against stock, an unknown voucher keeps the saved one, percent discounts are capped, shipping uses the subtotal before the discount, an empty cart says cart is empty.",
            caption: "Every box is one lesson of this course. Every rule lives in exactly one place.",
        }),
        p("Some design decisions to make before you write the functions:"),
        bullets([
            "**How to store the lines.** A private `MutableList<CartLine>` in insertion order works; so does a `LinkedHashMap<String, CartLine>` keyed by SKU. Either way, nobody outside the class can see it. `checkout` returns new strings, never the list.",
            "**Where each rejection happens.** Check in the order the specification lists, and return the message as soon as one check fails, before changing anything (`val product = catalog[sku] ?: return \"rejected: ...\"`).",
            "**How to count stock.** The question is not \"is `qty` more than the stock?\" but \"is what will be in the cart after this add more than the stock?\". That needs the quantity already in the cart.",
            "**What the voucher decides.** Write one function that, for a voucher and a subtotal, gives the discount or `null` when the minimum is not reached. Free shipping gives a discount of 0 and changes the shipping line instead.",
            "**How to build the summary.** `buildList { add(...) }` with one `add` per output line reads like the specification. Compute the subtotal once with `sumOf`, and the shipping from the subtotal before the discount.",
        ]),
        callout("warning", "The traps from this course are all here",
            "qty * price is an Int times a Long; that is fine, but check what type each expression has. A ?.let { } ?: chain around the discount (lesson 8) can hide the difference between 'no voucher' and 'voucher not applied'. A percentage with integer division (lesson 1) must divide after multiplying. And an unknown voucher must not erase the saved one: read the value first, assign only when it is valid."),

        h2("5. Your turn"),
        p("Implement `Long.vnd()` and the `Cart` class. The test runner reads the catalog and the commands, sends them to your cart and prints every result. Work in small steps: `vnd` first, then `add` with each rejection, then `remove` and `applyVoucher`, and `checkout` last. Run the tests after each step; the messages in the visible tests show the exact formats."),
        challenge("chal_coding_ktf_421", "Get the first visible test passing end to end with the simplest code, then add one rule at a time. Keep the quantity already in the cart in mind for the stock check, read the voucher map before assigning, and compute shipping from the subtotal, not from the total after the discount."),

        h2("6. Review your solution"),
        p("When the tests pass, review your own code the way the Cho Xanh team reviews pull requests. Every 'no' is worth fixing even though the tests are green:"),
        bullets([
            "Is every property that holds state `private` (or `private set`)? Could a caller change the cart without going through `add`, `remove` or `applyVoucher`?",
            "Is there any `!!` left? Any `catch` that returns a default?",
            "Does every `when` over `Voucher` list all three kinds, without `else`?",
            "Is money a `Long` everywhere, and does any division happen before a multiplication?",
            "Could you add a fourth voucher kind (say, `BuyXGetY`) and have the compiler show you every place to change?",
            "Do the function and variable names say what the specification says (`subtotal`, `shipping`, `discount`), so a reader can check one against the other?",
        ]),

        h2("7. What you have learned"),
        bullets([
            "**Types and values**: `val` and `var`, inference, explicit number conversions, overflow, integer division, templates.",
            "**Null safety**: nullable types, `?.`, `?:` with `return` and `throw`, smart casts, and why `!!` almost never belongs in production code.",
            "**Modelling**: `when` as an exhaustive expression, enums, sealed interfaces with data classes and data objects, guard conditions.",
            "**Data classes**: equality, `copy` and its shallowness, destructuring, keys that must not change.",
            "**Classes**: constructors, `init` with `require`, `private set`, visibility, interfaces, abstract and open classes, objects.",
            "**Collections**: read-only versus immutable, views versus copies, and the operations `map`, `filter`, `groupBy`, `associateBy`, `fold`, `sortedWith`.",
            "**Idioms**: extension functions and the five scope functions, and when an `if` is clearer.",
            "**Errors**: exceptions, `require`, `check`, `Result`, and validating a whole batch before applying any of it.",
        ]),
        p("From here, the natural next steps are coroutines and Flow (asynchronous code in Android and on the server), and testing with JUnit and Kotest. Both build directly on everything in this course: suspending functions are still functions, a `Flow` is a collection that arrives over time, and a good test is a list of edge cases written as code."),
    ],
});
