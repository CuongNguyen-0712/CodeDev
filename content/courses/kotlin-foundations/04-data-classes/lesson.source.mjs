// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Kotlin code uses ${...} templates, which a JS template literal would evaluate: write them as #{...}, kt() puts the $ back.
const kt = (strings, ...values) => String.raw(strings, ...values).replaceAll("#{", "${");

export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-ktf-2-2",
    title: "Data classes: equality, copy & destructuring",
    slug: { _type: "slug", current: "kotlin-data-classes-equality-copy-destructuring" },
    description:
        "After a refactoring, tapping + twice on the same product in the Cho Xanh app gave two cart lines of 1 instead of one line of 2, and the new 'Share my cart' feature let a friend's edits change your own cart. Both bugs were about what 'the same' means. Learn == and ===, what a data class generates and from which properties, why copy() is shallow, destructuring, and why objects used as map keys or set elements must not change.",
    estimatedTime: 18,

    scenario: {
        role: "Junior Android developer on the cart team at Cho Xanh, a grocery delivery app in Hanoi",
        problem:
            "A refactoring moved product loading into a repository that returns a fresh Product object for every request. Since then, carts show the same product on several lines, pickers in the warehouse pick it twice, and 'Share my cart', released the same week, gives friends a copy of the cart that is somehow still connected to the original.",
    },

    content: [
        h2("1. The incident"),
        p("The Cho Xanh cart groups products into lines: tap + on Rau muong twice and the cart shows `2 x Rau muong`. The cart is a map from product to quantity, so grouping comes for free: the same product is the same key."),
        p("In sprint 31 the team moved product loading into a repository. The product screen now asks the repository for the product every time it is shown, and the repository builds a new `Product` object from the API response each time. The same sprint shipped 'Share my cart': send your cart to a friend or family member, who gets their own copy to edit before ordering."),
        bullets([
            "**Carts grew duplicate lines.** Two taps on + gave `1 x Rau muong` twice. The warehouse app, which prints one pick line per cart line, sent pickers to the same shelf twice; some orders were packed with double quantities.",
            "**Shared carts were not copies.** A customer shared a cart with a sibling, who removed the eggs. The eggs disappeared from the original cart too, and the order that was placed did not have them.",
            "**Unit tests were green.** They added the same `val p = Product(...)` twice, which is one object, and never edited a shared cart after sharing.",
        ]),

        h2("2. Reproduce it"),
        code("kotlin", kt`
class Product(val sku: String, val name: String, val price: Long)

fun main() {
    val cart = mutableMapOf<Product, Int>()
    repeat(2) {
        // every tap on "+" loads the product again from the API
        val p = Product("RAU-01", "Rau muong", 15_000)
        cart[p] = (cart[p] ?: 0) + 1
    }
    for ((product, qty) in cart) println("$qty x #{product.name}")
    val a = Product("RAU-01", "Rau muong", 15_000)
    val b = Product("RAU-01", "Rau muong", 15_000)
    println(a == b)
    println(a === a)
    println(a)
}`, "cart.kt"),
        code("text", `
1 x Rau muong
1 x Rau muong
false
true
Product@279f2327`),
        p("Two objects with the same SKU, name and price are not equal, so the map treats them as two keys. The last line shows why nobody noticed in the logs: a plain class prints its class name and a hash code (the number differs on every run), not its contents."),

        h2("3. == and ==="),
        p("Kotlin has two equality operators, and they ask different questions:"),
        bullets([
            "**`a === b`** (referential equality): are `a` and `b` the **same object** in memory? Always true for `a === a`, always false for two objects created separately.",
            "**`a == b`** (structural equality): are they **equal**? It calls `a.equals(b)` (and handles `null` safely: `null == null` is true, `null == x` is false).",
        ]),
        p("The catch is the default `equals`. A plain `class` inherits it from `Any`, and that default only checks `===`. Two products loaded separately are therefore never `==`, whatever their properties say. Maps and sets use `equals` and `hashCode` to find keys, so they inherit the same blindness. That is what happened to the cart."),
        callout("info", "Strings and numbers are fine",
            "String, Int, Long, List, Map and the other standard types override equals, so == compares their contents: \"RAU-01\" == \"RAU-01\" is true, and two lists with the same elements are equal. Only your own classes start with identity equality."),

        h2("4. Data classes"),
        p("Add one word, `data`, and the compiler generates the functions a value type needs, from the properties declared in the **primary constructor**:"),
        code("kotlin", kt`
data class Product(val sku: String, val name: String, val price: Long)

fun main() {
    val a = Product("RAU-01", "Rau muong", 15_000)
    val b = Product("RAU-01", "Rau muong", 15_000)
    println(a == b)
    println(a === b)
    println(a.hashCode() == b.hashCode())
    println(a)
    val onSale = a.copy(price = 12_000)
    println(onSale)
    println(a == onSale)
    val (sku, name, price) = onSale
    println("$sku $name $price")
    val (_, label) = a
    println(label)
    println(setOf(a, b, onSale).size)
}`, "product.kt"),
        code("text", `
true
false
true
Product(sku=RAU-01, name=Rau muong, price=15000)
Product(sku=RAU-01, name=Rau muong, price=12000)
false
RAU-01 Rau muong 12000
Rau muong
2`),
        bullets([
            "**`equals` and `hashCode`** compare all constructor properties. Equal objects always have equal hash codes, which is what maps and sets rely on: `setOf(a, b, onSale)` has 2 elements.",
            "**`toString`** prints the class name and every constructor property: readable logs and test failures for free.",
            "**`copy(...)`** creates a new object with some properties changed, using named arguments. The original is untouched.",
            "**`component1()`, `component2()`, ...** power destructuring: `val (sku, name, price) = onSale`. Use `_` to skip a position.",
            "**Requirements**: the primary constructor needs at least one parameter, and every parameter must be a `val` or `var`.",
        ]),
        h3("Only the constructor counts"),
        p("A property declared in the class body is ignored by everything the compiler generates:"),
        code("kotlin", `
data class CartLine(val sku: String, val qty: Int) {
    var note: String = ""
}`),
        p("Two lines with the same SKU and quantity but different notes are equal, have the same hash code and print the same. Occasionally that is what you want (a cached value that should not affect equality). Usually it is a bug: put everything that defines the value in the constructor."),
        challenge("chal_quiz_ktf_221", "For the first question, list which properties the data class 'sees'. For the second, draw the objects: how many Order objects and how many lists exist after copy()?"),

        h2("5. copy() is shallow"),
        p("This is the second bug. `copy()` creates a new object, and each property of the new object gets the **same reference** as the original, unless you pass a new value. For a `String` or a `Long` that is harmless, because they cannot change. For a `MutableList` it means two objects share one list:"),
        code("kotlin", kt`
data class Order(val id: String, val items: MutableList<String>)

fun main() {
    val first = Order("CX-1", mutableListOf("Rau muong"))
    val second = first.copy(id = "CX-2")
    second.items += "Trung ga ta"
    println(first)
    println(second)
    println(first.items === second.items)
}`, "order.kt"),
        code("text", `
Order(id=CX-1, items=[Rau muong, Trung ga ta])
Order(id=CX-2, items=[Rau muong, Trung ga ta])
true`),
        image("equality-and-shallow-copy", {
            alt: "Two parts. Part 1, two products loaded from the API: object #1 and object #2 both have sku RAU-01 and price 15000. With class Product, == asks whether they are the same object, #1 == #2 is false, and the cart shows 1 x Rau muong twice. With data class Product, == asks whether the properties are the same, #1 == #2 is true, and the cart shows 2 x Rau muong. Notes: === always asks same object for every class, and only constructor properties count. Part 2, val friends = cart.copy(owner = \"Minh\"): Cart (mine) with owner Lan and Cart (friend's copy) with owner Minh both point their lines property at one MutableList of CartLine holding 1 x Rau muong and 1 x Trung ga ta. Minh removes Trung ga ta from the copy and it disappears from Lan's cart too, because there is only one list. Fix: cart.copy(owner = \"Minh\", lines = cart.lines.toMutableList()), or data class Cart(val owner: String, val lines: List<CartLine>).",
            caption: "Data classes fix the first bug on their own. The second needs you to decide who owns the list.",
        }),
        p("You have two ways out. Either copy the mutable parts yourself, `cart.copy(owner = \"Minh\", lines = cart.lines.toMutableList())`, which creates a new list with the same (immutable) `CartLine` objects. Or, better, do not put mutable collections in data classes at all: with `val lines: List<CartLine>`, nobody can change the list in place, so sharing it is safe, and every change creates a new `Cart` with `copy`."),

        h2("6. Keys must not change"),
        p("A `HashMap` or `HashSet` files each key under its hash code when it is inserted. If the key changes afterwards, its hash code changes too, and the set looks for it in the wrong place:"),
        code("kotlin", `
data class Slot(var day: String, val hour: Int)

fun main() {
    val booked = hashSetOf(Slot("Mon", 9))
    val s = booked.first()
    s.day = "Tue"
    println(booked)
    println(booked.contains(Slot("Tue", 9)))
    println(booked.contains(s))
}`, "slots.kt"),
        code("text", `
[Slot(day=Tue, hour=9)]
false
false`),
        p("The set prints the slot, but cannot find it, not even with the object it holds. This is why data classes should use `val`. A `var` in a data class is legal, but every change to it changes `equals` and `hashCode`, so the object must never be a key in a map or an element of a set at that moment."),

        h2("7. Destructuring, carefully"),
        p("Destructuring is positional: `val (sku, name, price) = product` means `component1()`, `component2()`, `component3()`, in the order of the constructor. It reads well in loops over maps and pairs, `for ((product, qty) in cart)`, and for small results such as `val (paid, refunded) = totals(events)`."),
        p("Positional also means fragile. If someone reorders the constructor to `Product(val sku: String, val price: Long, val name: String)`, every `val (sku, name, price) = ...` swaps silently where the types happen to match (two `String`s, two `Long`s) and fails to compile where they do not. Destructure small, stable types, and use the property names (`product.price`) everywhere else."),

        h2("8. The fix"),
        p("The team made `Product` a data class and changed `Cart` into an immutable value: every change returns a new cart, so sharing a cart can never connect two of them."),
        code("kotlin", kt`
data class Product(val sku: String, val name: String, val price: Long)
data class CartLine(val product: Product, val qty: Int)

data class Cart(val owner: String, val lines: List<CartLine> = emptyList()) {
    fun add(p: Product): Cart {
        val existing = lines.find { it.product == p }
        val newLines = if (existing == null) lines + CartLine(p, 1)
            else lines.map { if (it == existing) it.copy(qty = it.qty + 1) else it }
        return copy(lines = newLines)
    }

    fun remove(sku: String): Cart = copy(lines = lines.filterNot { it.product.sku == sku })
}

fun main() {
    var lan = Cart("Lan")
    repeat(2) { lan = lan.add(Product("RAU-01", "Rau muong", 15_000)) }
    lan = lan.add(Product("TRUNG-10", "Trung ga ta", 30_000))
    val minh = lan.copy(owner = "Minh").remove("TRUNG-10")
    println(lan)
    println(minh)
}`, "cart.kt"),
        code("text", `
Cart(owner=Lan, lines=[CartLine(product=Product(sku=RAU-01, name=Rau muong, price=15000), qty=2), CartLine(product=Product(sku=TRUNG-10, name=Trung ga ta, price=30000), qty=1)])
Cart(owner=Minh, lines=[CartLine(product=Product(sku=RAU-01, name=Rau muong, price=15000), qty=2)])`),
        numbered([
            "**`data class Product`**: two products with the same SKU, name and price are equal, so `find { it.product == p }` finds the existing line.",
            "**`lines + CartLine(p, 1)`** returns a new list; **`map`** and **`filterNot`** build new lists too (lesson 7 covers them). The old list is never modified.",
            "**`copy(lines = newLines)`** returns a new `Cart`. `lan.copy(owner = \"Minh\")` can now share the list safely, because nobody can change it in place.",
            "**The tests** now build products separately for every tap, like the repository does, and edit a shared cart after sharing.",
        ]),

        h2("9. Your turn"),
        p("The production code is still the mutable version from before the refactoring. Fix it with as little change as possible: equal products must merge into one line, and a shared cart must be independent of the original in both directions. The test runner reads `add`, `share`, `remove` and `show` commands and prints the carts."),
        challenge("chal_fix_ktf_222", "There are two separate bugs. For the duplicates, ask what == means for Product. For sharing, ask how many lists exist after copy(), and what the friend's cart needs so that it has its own."),

        h2("10. Pitfalls and checklist"),
        bullets([
            "**A plain class as a map key or set element**: two equal-looking objects are two keys. Use a data class, or a key that is already a value (`product.sku`).",
            "**Mutable collections inside data classes**: `copy()` shares them. Prefer `List`, `Set` and `Map`; if you must keep a `MutableList`, copy it explicitly.",
            "**`var` properties in data classes**: changing one changes `hashCode`, and a set or map that holds the object can no longer find it.",
            "**Properties in the class body**: invisible to `equals`, `hashCode`, `toString` and `copy`.",
            "**Tests that reuse one object**: `val p = Product(...)` added twice proves nothing about equality. Build each value separately, the way production does.",
            "**Checklist**: value types are data classes with `val` properties and read-only collections; identity (`===`) is only used when you really mean 'this exact object'.",
        ]),
        p("Next lesson: classes, interfaces and visibility. A screen changed a wallet balance directly, and a customer paid for groceries with money they did not have."),
    ],
});
