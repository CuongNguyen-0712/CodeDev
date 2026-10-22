// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Kotlin code uses ${...} templates, which a JS template literal would evaluate: write them as #{...}, kt() puts the $ back.
const kt = (strings, ...values) => String.raw(strings, ...values).replaceAll("#{", "${");

export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-ktf-3-3",
    title: "Extension functions & scope functions (let, apply, also)",
    slug: { _type: "slug", current: "kotlin-extension-functions-scope-functions" },
    description:
        "After a tidy-up of the notification service, every Cho Xanh customer with the app installed got a push notification and an SMS for each order, and the SMS bill tripled in a week. The cause was one elegant line: x?.let { ... } ?: fallback. Learn extension functions and properties, extensions on nullable types, how extensions are resolved, the five scope functions let, run, with, apply and also, takeIf, and when a plain if is the better tool.",
    estimatedTime: 18,

    scenario: {
        role: "Junior backend developer on the notifications team at Cho Xanh, a grocery delivery app in Hanoi",
        problem:
            "The notification service sends 'order on its way' by push when the customer has the app, and by SMS otherwise. A refactoring turned an if/else into a one-line ?.let { } ?: chain. From the next morning, every app user received both messages, support got complaints about spam, and the SMS provider's invoice for the week was three times the usual amount.",
    },

    content: [
        h2("1. The incident"),
        p("Cho Xanh tells customers when their order leaves the store. Customers with the app get a push notification, which is free; the others get an SMS, which costs about 350 VND each. With 40,000 orders a day, the difference matters."),
        p("The function that chooses the channel was a few lines of if/else. During a tidy-up, a developer replaced it with what looked like the idiomatic Kotlin version, and a reviewer approved it as 'much cleaner'. The push SDK's wrapper, written years before, returns an error message on failure and `null` on success."),
        bullets([
            "**Every customer with the app** received a push and an SMS for each order, from Tuesday morning.",
            "**The SMS invoice** for the week was 3.1 times the normal amount: about 10 million VND for messages nobody needed.",
            "**Support tickets** about 'spam from Cho Xanh' tripled, and some customers turned notifications off entirely.",
        ]),

        h2("2. Reproduce it"),
        code("kotlin", kt`
data class Customer(val name: String, val pushToken: String?, val phone: String)

// wrapper around the push SDK: returns an error message, or null when the push was sent
fun sendPush(token: String, text: String): String? {
    println("PUSH to $token: $text")
    return null
}

fun sendSms(phone: String, text: String) = println("SMS to $phone: $text")

fun notify(c: Customer, text: String) {
    c.pushToken?.let { sendPush(it, text) } ?: sendSms(c.phone, text)
}

fun main() {
    notify(Customer("Lan", "tok-81f2", "0912345678"), "Order CX-1042 is on its way")
    notify(Customer("Minh", null, "0987654321"), "Order CX-1043 is on its way")
}`, "notify.kt"),
        code("text", `
PUSH to tok-81f2: Order CX-1042 is on its way
SMS to 0912345678: Order CX-1042 is on its way
SMS to 0987654321: Order CX-1043 is on its way`),
        p("Lan has the app and gets both messages. `let` returns whatever its block returns, and here the block returns `sendPush`'s `null` (\"no error\"). The elvis operator sees `null` on its left and runs the SMS branch. `?.let { } ?:` reads like if/else, but it is not: the fallback runs when the value is null **or** when the block's result is null. To understand this, and to use scope functions where they really help, start with what they are: extension functions."),

        h2("3. Extension functions"),
        p("An extension function adds a function to an existing type without changing it or inheriting from it. You write the type before the name, and inside the body `this` is the value it was called on:"),
        code("kotlin", kt`
fun Long.vnd(): String = toString().reversed().chunked(3).joinToString(",").reversed() + " VND"

fun String?.orDash(): String = if (isNullOrBlank()) "-" else this

val String.isVietnamesePhone: Boolean
    get() = length == 10 && startsWith("0") && all { it.isDigit() }

open class PaymentMethod
class Card : PaymentMethod()
fun PaymentMethod.kind() = "payment method"
fun Card.kind() = "card"

fun main() {
    println(1_250_000L.vnd())
    val note: String? = null
    println(note.orDash())
    println("0912345678".isVietnamesePhone)
    println("+84912345678".isVietnamesePhone)
    val m: PaymentMethod = Card()
    println(m.kind())
    println(Card().kind())
}`, "extensions.kt"),
        code("text", `
1,250,000 VND
-
true
false
payment method
card`),
        bullets([
            "**`fun Long.vnd()`** reads as if `Long` had a `vnd()` method: `amount.vnd()`. Inside, `toString()` means `this.toString()`. (This short version does not handle negative amounts; the challenge does.)",
            "**Extensions on nullable types**: `String?.orDash()` can be called on `null`. Inside, `this` may be null, and `isNullOrBlank()` smart-casts it for the `else` branch.",
            "**Extension properties** (`val String.isVietnamesePhone`) have a getter but no stored value: an extension cannot add state.",
            "**Extensions are resolved statically**, from the declared type, not the runtime type: `m` is declared as `PaymentMethod`, so `m.kind()` calls the `PaymentMethod` extension even though `m` is a `Card`. If you need different behaviour per subtype, use a real (overridden) member function.",
            "**Extensions only see the public API.** They cannot read private members, and a member function with the same signature always wins over an extension.",
        ]),
        p("The standard library is mostly extensions: `filter`, `map`, `isNullOrBlank`, `trim`, `orEmpty`. In your own code, extensions are great for small, pure helpers about one type (formatting money, masking phone numbers, parsing a status) that would otherwise become a `Utils` class full of static functions."),

        h2("4. Scope functions"),
        p("`let`, `run`, `with`, `apply` and `also` are five small standard-library functions that run a block of code with an object. They differ in two ways only: how the block refers to the object (`it` or `this`), and what the call returns (the block's result or the object itself)."),
        code("kotlin", kt`
class Notification {
    var title = ""
    var body = ""
    var channel = "push"
    override fun toString() = "Notification($channel: $title / $body)"
}

fun main() {
    val n = Notification().apply {
        title = "Cho Xanh"
        body = "Order CX-1042 is on its way"
    }
    println(n)

    val sent = n.also { println("log: sending #{it.title}") }
    println(sent === n)

    val length = n.body.let { it.length }
    println(length)

    val summary = n.run { "$channel/$title" }
    println(summary)

    val upper = with(n) { body.uppercase() }
    println(upper)

    val code: String? = "  TET10 "
    val clean = code?.trim()?.takeIf { it.isNotEmpty() }
    println(clean)
    println("   ".trim().takeIf { it.isNotEmpty() })
}`, "scope.kt"),
        code("text", `
Notification(push: Cho Xanh / Order CX-1042 is on its way)
log: sending Cho Xanh
true
27
push/Cho Xanh
ORDER CX-1042 IS ON ITS WAY
TET10
null`),
        image("scope-functions", {
            alt: "A table of the five scope functions with three columns: the object in the block, what the call returns, and a typical use. x.let { }: it, the block's result, code?.let { it.trim() }. x.run { }: this, the block's result, n.run { \"$channel/$title\" }. with(x) { }: this, the block's result, with(order) { \"$id: $total\" }. x.apply { }: this, x itself, Notification().apply { title = ... }. x.also { }: it, x itself, n.also { log(\"sending ${it.title}\") }. A red box shows the trap: token?.let { sendPush(it, text) } ?: sendSms(phone, text). When token is null, let is skipped and the result is null, so an SMS is sent, as intended. When token is not null and sendPush returns null, the push is sent, let gives null, and an SMS is sent too: two messages for one order.",
            caption: "Pick by the two questions. And remember: let's result is whatever the block's last expression is.",
        }),
        bullets([
            "**`apply`** configures an object and returns it: ideal for building something with several properties.",
            "**`also`** does something *with* the object on the side (log it, validate it, add it to a list) and returns it unchanged, so it slots into a chain.",
            "**`let`** transforms a value, most often a nullable one: `code?.let { it.trim() }`. Its result is the block's last expression.",
            "**`run`** and **`with`** compute a result from an object's members without repeating its name.",
            "**`takeIf { }`** returns the value if the condition holds and `null` otherwise; `takeUnless` the opposite. With `?.` and `?:` it builds small validation chains.",
        ]),
        challenge("chal_quiz_ktf_331", "For the first question, write down what the let block returns, then what the elvis operator does with it. For the second, apply the two questions to each line: it or this, and does the call return the block's result or the object?"),

        h2("5. When not to use them"),
        p("Scope functions are compact, and compact code is easy to misread. Some rules the Cho Xanh team adopted after the incident:"),
        bullets([
            "**No `?.let { } ?: ...` for control flow** when the block can return null, or when either branch has side effects. Write `if (x != null) ... else ...`: it means exactly what it says.",
            "**No nesting.** `a?.let { b?.let { ... } }` with two `it`s is a puzzle; use early returns (`val x = a ?: return`).",
            "**`let` for a transformation, not for 'do something if not null'**: `token?.let { send(it) }` is fine only when nothing depends on its result.",
            "**Keep blocks short.** A 20-line `apply` hides which properties belong to which object; a 20-line `run` is a function without a name.",
        ]),
        callout("warning", "The value of the last expression",
            "let, run and with return their block's last expression, and so do lambdas in general. A function you call for its side effect at the end of the block (a map's remove, an SDK call that returns a status) silently becomes the block's result. Check the type of the whole expression when you combine it with ?:."),

        h2("6. The fix"),
        code("kotlin", kt`
// Customer, sendPush, sendSms and main as before
fun notify(c: Customer, text: String) {
    val token = c.pushToken
    if (token == null) {
        sendSms(c.phone, text)
        return
    }
    val error = sendPush(token, text)
    if (error != null) sendSms(c.phone, text)
}`, "notify.kt"),
        code("text", `
PUSH to tok-81f2: Order CX-1042 is on its way
SMS to 0987654321: Order CX-1043 is on its way`),
        numbered([
            "**A local `val token`** for the smart cast, and an early return for the no-app case.",
            "**The push result is named** (`error`) and checked explicitly. Falling back to SMS when the push fails was the original intention; now it actually depends on the failure.",
            "**The wrapper's API** was changed afterwards to return a `Boolean` (sent or not), so the meaning of `null` can no longer be misread.",
            "**A test** checks that a customer with a token receives exactly one message.",
        ]),

        h2("7. Your turn"),
        p("Write the formatting helpers of the notification text as extension functions: money with thousands separators (refunds are negative), names in title case, a masked phone number and a dash for missing values. Then build `Order.notificationText()` from them. The test runner reads order and refund lines and prints one text each."),
        challenge("chal_coding_ktf_332", "Write and check one extension at a time: vnd first (handle the sign before grouping the digits), then titleCase (split on spaces and drop empty words), maskPhone (short numbers first), orDash. buildString { append(...) } keeps notificationText readable."),

        h2("8. Pitfalls"),
        bullets([
            "**`?.let { } ?: fallback` with a block that can return null**: the fallback runs too.",
            "**`also` when you meant `let`**: `\"abc\".also { it.length }` is still `\"abc\"`.",
            "**`apply` when you meant `let`**: it returns the object, not your computed value.",
            "**Extensions expecting overriding**: they are chosen by the declared type at compile time.",
            "**Extensions for everything**: an extension on `String` that only makes sense for phone numbers pollutes autocomplete for every string. Keep them `private` or `internal`, or close to where they are used.",
            "**Shadowed `this` and `it`** in nested scope functions: name the lambda parameter or use plain variables.",
        ]),

        h2("9. Checklist"),
        bullets([
            "Small pure helpers about one type are extension functions, with the narrowest visibility that works.",
            "Scope functions are used for their purpose: `apply` to configure, `also` for side effects, `let` to transform a nullable value.",
            "Control flow with side effects uses `if`/`else` and early returns, not `?.let { } ?:`.",
            "Every expression combined with `?:` has been checked for 'which nulls can reach the left side?'.",
        ]),
        p("Next lesson: exceptions, require and Result. One unreadable line in a price import set 1,800 products to 0 VND for 40 minutes."),
    ],
});
