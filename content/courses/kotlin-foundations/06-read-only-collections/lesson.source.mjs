// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Kotlin code uses ${...} templates, which a JS template literal would evaluate: write them as #{...}, kt() puts the $ back.
const kt = (strings, ...values) => String.raw(strings, ...values).replaceAll("#{", "${");

export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-ktf-3-1",
    title: "Lists, sets & maps: read-only is not immutable",
    slug: { _type: "slug", current: "kotlin-lists-sets-maps-read-only" },
    description:
        "Release 4.16 of the Cho Xanh app added Undo to the cart. From then on the cart screen stopped redrawing after the first item, and Undo emptied the whole cart. The store handed out its MutableList as a read-only List and saved that same list as every snapshot. Learn List, Set and Map and their mutable versions, what read-only really guarantees, views versus copies, the operations that return new collections, and how to change a collection safely.",
    estimatedTime: 18,

    scenario: {
        role: "Junior Android developer on the cart team at Cho Xanh, a grocery delivery app in Hanoi",
        problem:
            "The cart screen observes a CartStore and redraws when the cart it receives differs from the one it drew last. After release 4.16 it froze after the first item: the badge said 1 while the customer added five things. Tapping Undo then removed everything. QA had tested Undo on a cart with one item, where 'remove everything' and 'go back one step' look the same.",
    },

    content: [
        h2("1. The incident"),
        p("The cart screen in the Cho Xanh app follows a common Android pattern: a store (a ViewModel, in the real app) holds the state, and the screen observes it. To avoid redrawing for nothing, the screen compares the new cart with the last cart it drew and redraws only when they differ. Kotlin's `StateFlow` does exactly this comparison for you, with `==`."),
        p("Release 4.16 added Undo. The developer kept a history of carts: before each change, the store saved the current cart, and Undo restored the last saved one. It was code-reviewed, tested by QA and released on Thursday."),
        bullets([
            "**The screen froze** after the first item: the cart badge showed 1, the list showed one product, while customers kept tapping +. The real cart had everything; checkout showed the right total, which made it worse.",
            "**Undo emptied the cart.** One tap, every item gone. Support received screenshots of empty carts with 'I only wanted to remove the milk'.",
            "**Conversion dropped 9%** on Thursday and Friday, until a hotfix on Saturday.",
        ]),

        h2("2. Reproduce it"),
        code("kotlin", kt`
class CartStore {
    private val items = mutableListOf<String>()
    private val history = mutableListOf<List<String>>()

    val current: List<String> get() = items

    fun add(item: String) {
        history += items
        items += item
    }

    fun undo() {
        if (history.isEmpty()) return
        val previous = history.removeAt(history.lastIndex)
        items.clear()
        items += previous
    }
}

fun main() {
    val store = CartStore()
    var lastRendered: List<String>? = null
    fun render() {
        val state = store.current
        if (state != lastRendered) {
            println("render: $state")
            lastRendered = state
        }
    }
    store.add("Rau muong"); render()
    store.add("Trung ga ta"); render()
    store.add("Sua tuoi"); render()
    store.undo(); render()
    println("cart: #{store.current}")
}`, "cart_store.kt"),
        code("text", `
render: [Rau muong]
cart: []`),
        p("The types look careful: `items` is private, `current` is a read-only `List<String>`, and the history holds `List<String>` too. But there is only **one list** in this program. `current` returns it, the screen keeps it as `lastRendered`, and every `history += items` stores another reference to it. A read-only type did not make anything immutable; it only hid the `add` button."),

        h2("3. Collections in Kotlin"),
        p("Kotlin's standard library has three main collection types, each in two flavours:"),
        bullets([
            "**`List<T>`**: ordered, may contain duplicates, accessed by index. `listOf(...)`, `mutableListOf(...)`.",
            "**`Set<T>`**: each element at most once. `setOf(...)` and `mutableSetOf(...)` keep insertion order.",
            "**`Map<K, V>`**: keys to values, each key once. `mapOf(\"RAU-01\" to 15_000)`, `mutableMapOf()`. `a to b` creates a `Pair`.",
            "**The read-only interfaces** (`List`, `Set`, `Map`) have only reading functions: `size`, `get`, `contains`, iteration. **The mutable interfaces** (`MutableList`, ...) add `add`, `remove`, `set`, `clear`.",
        ]),
        code("kotlin", kt`
fun main() {
    val prices = mutableMapOf("RAU-01" to 15_000, "TRUNG-10" to 30_000)
    prices["SUA-01"] = 32_000
    prices["RAU-01"] = 14_000
    println(prices)
    println(prices["GAO-05"])
    println(prices.getOrDefault("GAO-05", 0))
    for ((sku, price) in prices) print("$sku=$price ")
    println()
    val tags = mutableSetOf("organic", "local")
    println(tags.add("organic"))
    println(tags.add("fresh"))
    println(tags)
    println("organic" in tags)
    println(prices.values.sum())
}`, "collections.kt"),
        code("text", `
{RAU-01=14000, TRUNG-10=30000, SUA-01=32000}
null
0
RAU-01=14000 TRUNG-10=30000 SUA-01=32000
false
true
[organic, local, fresh]
true
76000`),
        bullets([
            "**`map[key]`** gives `null` for a missing key (lesson 2); `getOrDefault` and `?:` choose a fallback. `map[key] = value` adds or replaces.",
            "**`Set.add`** returns `false` when the element was already there, which is a cheap 'have I seen this?' check.",
            "**`in`** calls `contains`: `\"organic\" in tags`, `\"RAU-01\" in prices` (for a map, `in` checks the keys).",
            "**Destructuring a map entry**: `for ((sku, price) in prices)`.",
        ]),

        h2("4. Read-only is not immutable"),
        p("This is the heart of the incident. `List<String>` is an **interface** with only reading functions. It promises what *you* can do through that reference, not what the object behind it is:"),
        code("kotlin", kt`
fun main() {
    val stock = mutableListOf("Rau muong", "Trung ga ta")
    val visible: List<String> = stock
    stock += "Sua tuoi"
    println(visible)
    val snapshot = stock.toList()
    stock.removeAt(0)
    println(snapshot)
    println(stock)
    val a = listOf(1, 2)
    val b = a + 3
    println("$a $b")
    println(runCatching { (listOf(1, 2) as MutableList<Int>).add(3) })
}`, "views.kt"),
        code("text", `
[Rau muong, Trung ga ta, Sua tuoi]
[Rau muong, Trung ga ta, Sua tuoi]
[Trung ga ta, Sua tuoi]
[1, 2] [1, 2, 3]
Failure(java.lang.UnsupportedOperationException)`),
        bullets([
            "**`val visible: List<String> = stock`** is a second name for the same list, a **view**. When `stock` changes, `visible` changes.",
            "**`stock.toList()`** is a **copy**: a new list with the same elements. Later changes to `stock` do not reach it. (`toSet()`, `toMap()`, `toMutableList()` work the same way.)",
            "**`a + 3`** returns a new list and leaves `a` alone. `+`, `-`, `filter`, `map`, `sorted` all return new collections.",
            "**A cast back to `MutableList`** compiles, because on the JVM every list is a `java.util.List`. Whether `add` works depends on the object: the list behind `listOf(1, 2)` cannot grow and throws `UnsupportedOperationException`; an `ArrayList` handed out as `List` can be changed by anyone who casts it.",
        ]),
        image("one-list-many-names", {
            alt: "Two parts. Left, release 4.16, one list with four names: store.items, store.current (List), screen.lastRendered and history[0], history[1] all point at one ArrayList holding Rau muong and Trung ga ta. current != lastRendered compares the list with itself, so it is always equal and the screen never redraws; undo calls items.clear(), which also clears every snapshot, so going back one step restores an empty cart. Right, the fix: hand out and keep copies. store.items points at the live list, items.toList() at its own copy [Rau muong, Trung ga ta], history[1] at [Rau muong] and history[0] at an empty list. Each snapshot is its own list frozen when it was taken; a new cart is a new list so != sees the difference and undo restores exactly the previous step. Alternative: keep a var items: List<String> and replace it with items = items + item, so nothing is changed in place.",
            caption: "Read-only describes the reference you hold, not the object. A snapshot must be a copy.",
        }),
        challenge("chal_quiz_ktf_311", "For the first question, count the lists that exist, not the variables. For the second, ask for each line whether it creates a new collection, changes an existing one, or only looks."),

        h2("5. Changing collections safely"),
        h3("Do not modify a list while you loop over it"),
        code("kotlin", `
val m = mutableListOf(1, 2, 3, 4)
for (x in m) if (x % 2 == 0) m.remove(x)   // ConcurrentModificationException
m.removeAll { it % 2 == 0 }                 // fine: [1, 3]
val odd = m.filter { it % 2 != 0 }          // fine: a new list`),
        p("The `for` loop uses an iterator, and Java's collections detect that the list changed behind the iterator's back. Use `removeAll { }`, `retainAll { }`, or build a new list with `filter` (lesson 7)."),
        h3("Build, then expose read-only"),
        p("A good pattern for code that hands collections to other code:"),
        bullets([
            "**Build with a mutable collection** locally, or with `buildList { add(...) }` / `buildMap { put(...) }`, which give you a mutable list inside the block and return a read-only one.",
            "**Expose `List`, `Set` or `Map`**, never the `Mutable` type.",
            "**Hand out a copy** (`toList()`) if you keep changing the original, or keep the state in a `var` of a read-only type and **replace** it on every change, so the old value is never touched again.",
        ]),
        callout("info", "Truly immutable collections",
            "The standard library's List is read-only, not immutable. The kotlinx.collections.immutable library adds PersistentList and ImmutableList, which really cannot change and make copies cheap; Jetpack Compose treats them as stable. For most code, the replace-don't-mutate pattern below is enough."),

        h2("6. The fix"),
        p("The hotfix kept the state as a read-only list in a `var` with a private setter, and replaced it on every change. Nothing is ever modified in place, so a list that was handed out or saved in the history stays exactly as it was:"),
        code("kotlin", kt`
class CartStore {
    var current: List<String> = emptyList()
        private set
    private val history = mutableListOf<List<String>>()

    fun add(item: String) {
        history += current
        current = current + item
    }

    fun undo() {
        if (history.isEmpty()) return
        current = history.removeAt(history.lastIndex)
    }
}

fun main() {
    val store = CartStore()
    var lastRendered: List<String>? = null
    fun render() {
        val state = store.current
        if (state != lastRendered) {
            println("render: $state")
            lastRendered = state
        }
    }
    store.add("Rau muong"); render()
    store.add("Trung ga ta"); render()
    store.add("Sua tuoi"); render()
    store.undo(); render()
    println("cart: #{store.current}")
}`, "cart_store.kt"),
        code("text", `
render: [Rau muong]
render: [Rau muong, Trung ga ta]
render: [Rau muong, Trung ga ta, Sua tuoi]
render: [Rau muong, Trung ga ta]
cart: [Rau muong, Trung ga ta]`),
        numbered([
            "**`current + item`** creates a new list. The old one is untouched, so saving it in `history` is a real snapshot.",
            "**`var current` with `private set`**: callers read the newest list; only the store replaces it (lesson 5).",
            "**Undo** puts an old list back. Since nobody can change lists after they are created, there is nothing to clear and nothing to copy.",
            "**QA's new test** adds three items and undoes twice, checking the cart and the number of redraws after every step.",
        ]),

        h2("7. Your turn"),
        p("The production `CartStore` still uses a `MutableList` inside. Fix it without rewriting the test runner: every change must make the screen redraw, Undo must go back exactly one step, and nothing the store hands out may change later. Removing an item that is not in the cart is not a change and not an undo step."),
        challenge("chal_fix_ktf_312", "Find every place where the store's own list leaves the store: the getter and each history entry. Each one needs its own copy (toList()), or switch to a read-only list that you replace instead of modifying."),

        h2("8. Pitfalls"),
        bullets([
            "**Returning a `MutableList` as `List`**: the caller cannot change it, but you still can, and the caller sees every change.",
            "**Saving a mutable collection as a snapshot**: all snapshots are the same object. Copy, or never mutate.",
            "**Comparing a collection with itself**: `==` on the same instance is always true; change detection (`StateFlow`, `DiffUtil`, your own `!=`) never fires.",
            "**Casting `List` to `MutableList`**: compiles, then either corrupts someone else's state or throws `UnsupportedOperationException`.",
            "**Modifying a list inside a `for` loop over it**: `ConcurrentModificationException`. Use `removeAll` or `filter`.",
            "**Assuming `map[key]` is never null**: missing keys give `null`.",
        ]),

        h2("9. Checklist"),
        bullets([
            "Public APIs expose `List`, `Set` and `Map`, never their `Mutable` versions.",
            "State that others observe is replaced, not modified, or handed out as a copy.",
            "Snapshots, caches of 'the previous value' and undo histories hold copies or immutable values.",
            "Loops that remove elements use `removeAll` or build a new collection.",
            "Tests check behaviour after several changes, not just one.",
        ]),
        p("Next lesson: `map`, `filter`, `groupBy` and `fold`. The daily sales report counted refunded orders twice, inside three nested loops."),
    ],
});
