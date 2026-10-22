// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Kotlin code uses ${...} templates, which a JS template literal would evaluate: write them as #{...}, kt() puts the $ back.
const kt = (strings, ...values) => String.raw(strings, ...values).replaceAll("#{", "${");

export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-ktf-2-1",
    title: "when expressions & sealed interfaces",
    slug: { _type: "slug", current: "kotlin-when-expressions-sealed-interfaces" },
    description:
        "Cho Xanh launched click-and-collect, the backend started sending a new order status, and the app showed a grey 'Unknown' badge on 12% of orders for a week. Nobody had forgotten anything: an else branch had silently absorbed the new value. Learn when as a statement and as an expression, conditions with ranges and types, enums and entries, sealed interfaces with data classes and data objects, smart casts and guard conditions, and why exhaustive when without else lets the compiler find the places a new case must be handled.",
    estimatedTime: 20,

    scenario: {
        role: "Junior Kotlin developer on the order tracking team at Cho Xanh, a grocery delivery app in Hanoi",
        problem:
            "Click-and-collect launched on Monday: customers order online and pick up at a store with a code. The backend sends status READY_FOR_PICKUP for those orders. The app, released two weeks earlier, showed them as 'Unknown' with no pickup code, and customers queued at the store counter without knowing their code.",
    },

    content: [
        h2("1. The incident"),
        p("The order tracking screen is the most visited screen in the Cho Xanh app after the home page: customers open it every few minutes while they wait. It maps the status string sent by the backend to a label, an icon and a colour."),
        p("On Monday, Cho Xanh launched click-and-collect in four Hanoi stores. The backend team added a new status, `READY_FOR_PICKUP`, with the store and a four-digit pickup code. The app team had been told and had planned the screen for the next release, but click-and-collect orders were possible from day one, with the app version already installed on customers' phones."),
        bullets([
            "**12% of orders** that week were click-and-collect. Their tracking screen showed a grey 'Unknown' badge and no pickup code.",
            "**Store staff** had to look up codes by phone number at the counter; queues reached 15 minutes at the Kim Ma store on Saturday.",
            "**The next app release** added the new status. Review found two more `when` blocks over the same status strings (the notification icon and the 'help' menu) that would have shown the same problem: they also ended with `else`.",
        ]),

        h2("2. Reproduce it"),
        code("kotlin", kt`
fun statusLabel(status: String): String = when (status) {
    "PLACED" -> "Placed"
    "PICKING" -> "Picking your groceries"
    "OUT_FOR_DELIVERY" -> "On the way"
    "DELIVERED" -> "Delivered"
    else -> "Unknown"
}

fun main() {
    for (s in listOf("PICKING", "DELIVERED", "READY_FOR_PICKUP")) {
        println("$s -> #{statusLabel(s)}")
    }
}`, "status.kt"),
        code("text", `
PICKING -> Picking your groceries
DELIVERED -> Delivered
READY_FOR_PICKUP -> Unknown`),
        p("Nothing about this code is wrong in isolation. The trouble is the `else`: it answers every value nobody has thought about yet with \"Unknown\", forever, and the compiler cannot warn you because you told it that every other value is handled. This lesson is about writing `when` so that a new case is a compile error in your code instead of a grey badge on a customer's phone."),

        h2("3. when: Kotlin's switch, and more"),
        p("`when` compares a value (the **subject**) with a list of branches and runs the first one that matches. Unlike Java's old `switch`, there is no fall-through and no `break`. A branch can test more than equality:"),
        code("kotlin", kt`
fun deliveryWindow(hour: Int): String = when (hour) {
    in 7..10 -> "morning"
    in 11..13, 17 -> "lunch or early evening"
    in 14..16 -> "afternoon"
    else -> "closed"
}

fun fee(subtotal: Long, member: Boolean): Int = when {
    subtotal >= 300_000 -> 0
    member -> 10_000
    else -> 15_000
}

fun describe(x: Any): String = when (x) {
    is Int -> "an Int, plus one is #{x + 1}"
    is String -> "a String of length #{x.length}"
    else -> "something else"
}

fun main() {
    println(deliveryWindow(8))
    println(deliveryWindow(17))
    println(deliveryWindow(22))
    println(fee(120_000, member = true))
    println(describe(41))
    println(describe("Rau muong"))
}`, "when.kt"),
        code("text", `
morning
lunch or early evening
closed
10000
an Int, plus one is 42
a String of length 9`),
        bullets([
            "**Several values per branch** are separated by commas: `in 11..13, 17 ->`.",
            "**`in` and `!in`** test ranges and collections; `7..10` includes both ends.",
            "**`when` without a subject** is a cleaner `if / else if` chain: each branch is a Boolean condition.",
            "**`is Type`** checks the type, and inside the branch the value is **smart-cast**: `x + 1` compiles because `x` is known to be an `Int` there.",
            "**Named arguments** like `member = true` make Boolean parameters readable at the call site.",
        ]),
        h3("when is an expression"),
        p("Like `if`, `when` gives a value, which is how `= when (...) { ... }` works as a function body. **When `when` is used as an expression, it must be exhaustive**: every possible value of the subject must reach a branch. For an `Int` or a `String` there are billions of values, so you need `else`. For a type with a known, fixed set of values, you do not. That is where enums and sealed types come in."),

        h2("4. Enums: a fixed set of values"),
        code("kotlin", kt`
enum class OrderStatus { PLACED, PICKING, OUT_FOR_DELIVERY, DELIVERED, READY_FOR_PICKUP }

fun label(s: OrderStatus): String = when (s) {
    OrderStatus.PLACED -> "Placed"
    OrderStatus.PICKING -> "Picking your groceries"
    OrderStatus.OUT_FOR_DELIVERY -> "On the way"
    OrderStatus.DELIVERED -> "Delivered"
}`, "status.kt"),
        code("text", `
error: 'when' expression must be exhaustive. Add the 'READY_FOR_PICKUP' branch or an 'else' branch.`),
        p("With an enum and no `else`, adding `READY_FOR_PICKUP` to the enum breaks the build at every `when` that does not handle it. That is exactly the list the review had to find by hand. Enums also give you `entries` (all values, in declaration order), `name` and `ordinal`."),
        p("One trap remains: turning the backend's string into an enum. `OrderStatus.valueOf(\"READY_FOR_PICKUP\")` throws if the app version does not know that value yet:"),
        code("kotlin", `
enum class OrderStatus { PLACED, PICKING, OUT_FOR_DELIVERY, DELIVERED }

fun main() {
    println(OrderStatus.entries)
    println(OrderStatus.entries.find { it.name == "READY_FOR_PICKUP" })
    println(OrderStatus.valueOf("READY_FOR_PICKUP"))
}`, "parse.kt"),
        code("text", `
[PLACED, PICKING, OUT_FOR_DELIVERY, DELIVERED]
null
Exception in thread "main" java.lang.IllegalArgumentException: No enum constant OrderStatus.READY_FOR_PICKUP`),
        callout("warning", "Old app versions never go away",
            "Customers update apps slowly; a release from six months ago is still on thousands of phones. Data from a server will always, eventually, contain values the installed app has never heard of. Parse them into an explicit Unknown case (entries.find { ... } ?: Unknown), never with valueOf, and give Unknown a useful screen: 'Update the app to see this status'."),

        h2("5. Sealed interfaces: a fixed set of types"),
        p("An enum constant cannot carry its own data: every `OUT_FOR_DELIVERY` is the same object, with nowhere to put the driver's name. Click-and-collect needs a store and a pickup code; delivery needs a driver and an arrival time. A **sealed interface** describes a closed family of types, each with its own properties:"),
        code("kotlin", kt`
sealed interface OrderStatus {
    data object Placed : OrderStatus
    data object Picking : OrderStatus
    data class OutForDelivery(val driver: String, val etaMinutes: Int) : OrderStatus
    data class ReadyForPickup(val store: String, val code: String) : OrderStatus
    data class Delivered(val receivedBy: String?) : OrderStatus
    data object Unknown : OrderStatus
}

fun parseStatus(json: Map<String, String>): OrderStatus = when (json["status"]) {
    "PLACED" -> OrderStatus.Placed
    "PICKING" -> OrderStatus.Picking
    "OUT_FOR_DELIVERY" -> OrderStatus.OutForDelivery(json["driver"] ?: "Your driver", json["eta"]?.toIntOrNull() ?: 30)
    "READY_FOR_PICKUP" -> OrderStatus.ReadyForPickup(json["store"] ?: "the store", json["code"] ?: "----")
    "DELIVERED" -> OrderStatus.Delivered(json["receivedBy"])
    else -> OrderStatus.Unknown
}

fun label(s: OrderStatus): String = when (s) {
    OrderStatus.Placed -> "Placed"
    OrderStatus.Picking -> "Picking your groceries"
    is OrderStatus.OutForDelivery if s.etaMinutes <= 5 -> "#{s.driver} is almost there"
    is OrderStatus.OutForDelivery -> "#{s.driver} arrives in about #{s.etaMinutes} min"
    is OrderStatus.ReadyForPickup -> "Ready at #{s.store}, pickup code #{s.code}"
    is OrderStatus.Delivered -> if (s.receivedBy == null) "Delivered" else "Delivered to #{s.receivedBy}"
    OrderStatus.Unknown -> "Update the app to see this status"
}

fun main() {
    val responses = listOf(
        mapOf("status" to "OUT_FOR_DELIVERY", "driver" to "Tuan", "eta" to "12"),
        mapOf("status" to "OUT_FOR_DELIVERY", "driver" to "Tuan", "eta" to "3"),
        mapOf("status" to "READY_FOR_PICKUP", "store" to "Cho Xanh Kim Ma", "code" to "4821"),
        mapOf("status" to "DELIVERED"),
        mapOf("status" to "RETURNED_TO_STORE"),
    )
    for (r in responses) println(label(parseStatus(r)))
    println(OrderStatus.Picking)
    println(OrderStatus.OutForDelivery("Tuan", 12))
}`, "tracking.kt"),
        code("text", `
Tuan arrives in about 12 min
Tuan is almost there
Ready at Cho Xanh Kim Ma, pickup code 4821
Delivered
Update the app to see this status
Picking
OutForDelivery(driver=Tuan, etaMinutes=12)`),
        bullets([
            "**`sealed`** means every implementation is known at compile time: they must be declared in the same module and package (here, nested inside the interface). No other code can add a subtype later.",
            "**`data class`** for cases with data, **`data object`** for cases without. A `data object` is a single instance with a readable `toString()` (`Picking`, not `OrderStatus$Picking@1b6d3586`).",
            "**`is OrderStatus.OutForDelivery ->`** for classes, and the plain name for objects (`OrderStatus.Placed ->`), because there is only one of each.",
            "**Smart casts**: inside `is OrderStatus.ReadyForPickup ->`, `s.store` and `s.code` are available without a cast.",
            "**Guard conditions** (stable since Kotlin 2.2): `is OutForDelivery if s.etaMinutes <= 5 ->` adds a condition to a type branch. Branches are tried top to bottom, so the more specific one goes first.",
            "**The parsing `when` has an `else`**, and should: strings are open-ended. The rendering `when` has none, and should not: `OrderStatus` is closed.",
        ]),
        image("else-vs-exhaustive", {
            alt: "Two panels. The red left panel, String status + else, shows a when over the status strings PLACED, PICKING, OUT_FOR_DELIVERY and DELIVERED ending with else -> \"Unknown\"; an arrow takes the new value \"READY_FOR_PICKUP\" straight into the else branch. Below: compiles, ships and runs without an error, the new status falls into else and 12% of orders show a grey Unknown badge; found by customers calling support. The green right panel, sealed interface + when without else, shows a when over Placed, Picking, is OutForDelivery and is Delivered with the comment no else, and a compiler error: 'when' expression must be exhaustive, add the 'is ReadyForPickup' branch or an 'else' branch. Below: every when over OrderStatus stops compiling until the new case has a branch; found by the compiler, before the release. A footnote: parsing still needs a fallback for values the app does not know yet, so map them to an explicit Unknown case.",
            caption: "else decides 'Unknown' for every future case. An exhaustive when makes someone decide.",
        }),
        h3("Adding a case"),
        p("This is the whole point. Add `data class Refunding(val amount: Long) : OrderStatus` to the interface and compile:"),
        code("text", `
error: 'when' expression must be exhaustive. Add the 'is Refunding' branch or an 'else' branch.`),
        p("The compiler lists every `when` over `OrderStatus` that is now incomplete: the label, the icon, the colour, the notification text. Each one gets a deliberate decision, and the release cannot ship until it has."),
        callout("tip", "Exhaustive statements too",
            "Since Kotlin 1.7, a when statement (one whose value is not used) over a sealed type, enum or Boolean must also be exhaustive. Either way, avoid else on closed types: it is the one branch that silently accepts the cases you have not written yet."),

        h2("6. Modelling events"),
        p("Sealed types fit anything that is \"one of a few shapes\": API results (`Success`, `Error`, `Loading`), screen states, payment methods, and the events in an order's history. The order tracking timeline in the real app is a list of events like these:"),
        code("kotlin", `
enum class PaymentMethod { CASH, CARD, WALLET }

sealed interface OrderEvent {
    data class Placed(val total: Long) : OrderEvent
    data class Paid(val method: PaymentMethod, val amount: Long) : OrderEvent
    data object Picking : OrderEvent
    data class OutForDelivery(val driver: String) : OrderEvent
    data class Delivered(val receivedBy: String?) : OrderEvent
    data class Refunded(val amount: Long, val reason: String) : OrderEvent
    data class Cancelled(val byCustomer: Boolean) : OrderEvent
}`, "events.kt"),
        p("Two techniques help with lists of events. `events.lastOrNull { it !is OrderEvent.Refunded }` finds the last event of interest, or `null` when there is none. And `when (val last = ...) { ... }` declares a variable that only exists inside the `when`, so you can smart-cast it in each branch. `null` can be a branch of its own, next to type checks: `null, is OrderEvent.Refunded -> ...`."),

        h2("7. The fix"),
        p("The app team replaced the status strings with the sealed `OrderStatus` from section 5 and made three rules part of code review:"),
        numbered([
            "**Parse once, at the edge.** The JSON string becomes an `OrderStatus` in one function with an `else -> OrderStatus.Unknown`. Nothing else in the app looks at the raw string.",
            "**No `else` over a sealed type or enum.** Every `when` that renders, colours or describes a status lists every case, so a new status is a compile error everywhere it matters.",
            "**`Unknown` is a real state** with its own text ('Update the app to see this status') and an analytics event, so the team sees new statuses in the field before support does.",
        ]),
        p("The backend team now announces new statuses two releases ahead, and the app ships the case before the backend turns it on."),

        h2("8. Your turn"),
        p("Write the tracking timeline: `describe` turns each event into one line, and `status` gives the label of the last event that is not a refund. Cash payments read differently from card and wallet payments, a delivery may or may not name who received it, and an order with no events yet has its own text. The test runner parses one event per line and prints the timeline and the status."),
        challenge("chal_coding_ktf_211", "Start each function with a when that lists every event type and no else, and let the compiler tell you which branch is missing. A guard condition (is OrderEvent.Paid if ...) handles cash before the general Paid branch. For status, find the last event that matters first, then switch on it, including the case where there is none."),

        h2("9. Pitfalls"),
        bullets([
            "**`else` on a sealed type or enum**: it compiles today and silently handles every case added tomorrow.",
            "**`valueOf` on data from a server**: it throws for any value the installed app does not know. Use `entries.find { ... } ?: Unknown`.",
            "**Order of branches**: the first match wins. A general `is Paid ->` before `is Paid if ... ->` makes the guard unreachable.",
            "**Enum when you need data**: a `DELIVERED` constant cannot say who received the order. Use a sealed interface with data classes.",
            "**`object` instead of `data object`**: it works, but logs and test failures show `OrderStatus$Picking@1b6d3586` instead of `Picking`.",
            "**Comparing strings everywhere**: one typo (`\"DELIVERD\"`) is a silent bug. Parse to a type once, then compare types.",
        ]),

        h2("10. Checklist"),
        bullets([
            "Values from outside (JSON, database, user input) are parsed once into an enum or sealed type, with an explicit fallback case.",
            "Every `when` over an enum or sealed type lists its cases and has no `else`.",
            "Cases with data are `data class`, cases without are `data object`.",
            "Guards and specific branches come before general ones.",
            "Adding a case was tried once on purpose, to see the compiler list every place that must change.",
        ]),
        p("Next lesson: data classes. The same product appeared twice in customers' carts, because two equal-looking objects were not equal."),
    ],
});
