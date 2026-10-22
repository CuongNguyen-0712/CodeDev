// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Kotlin code uses ${...} templates, which a JS template literal would evaluate: write them as #{...}, kt() puts the $ back.
const kt = (strings, ...values) => String.raw(strings, ...values).replaceAll("#{", "${");

export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-ktf-4-1",
    title: "Exceptions, require & Result",
    slug: { _type: "slug", current: "kotlin-exceptions-require-result" },
    description:
        "A supplier wrote 18.500 instead of 18500, and Cho Xanh's price import, written to 'never fail', turned the unreadable price into 0. For 40 minutes, 1,800 products cost nothing. Learn how exceptions work in Kotlin (try as an expression, finally, custom exceptions, no checked exceptions), require, check and error for preconditions, Result and runCatching for failures you want to handle as values, and how to design an import that applies what is valid and explains what is not.",
    estimatedTime: 20,

    scenario: {
        role: "Junior backend developer on the catalog team at Cho Xanh, a grocery delivery app in Hanoi",
        problem:
            "Every morning at 06:00 a Kotlin job imports price files from 40 suppliers. A new supplier's export used a dot as the thousands separator. The job caught the NumberFormatException, used 0 as the price, and reported success. Between 06:02 and 06:42, customers placed 312 orders containing free rice, oil and fish sauce.",
    },

    content: [
        h2("1. The incident"),
        p("Cho Xanh's catalog has 1,800 products from 40 suppliers. Each supplier sends a price file every night: one line per product, `SKU;PRICE`, the price in whole dong. The import job had one design goal written in its README: **never fail**. A crash at 06:00 means the shop opens with yesterday's prices, and the on-call developer gets woken up."),
        p("So the price parser caught every exception and returned 0, and the loop caught everything else and skipped the line. On a Tuesday, a new rice and condiment supplier sent its first file, exported from a spreadsheet with Vietnamese number formatting: `GAO-05;18.500`."),
        bullets([
            "**Every price in that file became 0 VND**, because `\"18.500\".toLong()` throws and the parser turned the exception into 0. The job log said `import OK, 1800 lines`.",
            "**312 orders** contained products at 0 VND before a store manager noticed the price of a 5 kg bag of ST25 rice.",
            "**Cho Xanh honoured the orders**, at a cost of about 41 million VND, and the 'never fail' design was retired the same day.",
        ]),

        h2("2. Reproduce it"),
        code("kotlin", `
fun parsePrice(text: String): Long =
    try {
        text.trim().toLong()
    } catch (e: NumberFormatException) {
        0
    }

fun main() {
    val catalog = mutableMapOf("RAU-01" to 15_000L, "GAO-05" to 240_000L)
    val file = listOf("RAU-01;14000", "GAO-05;18.500")
    for (line in file) {
        val (sku, price) = line.split(";")
        catalog[sku] = parsePrice(price)
    }
    println(catalog)
}`, "import.kt"),
        code("text", `
{RAU-01=14000, GAO-05=0}`),
        p("The exception was the import's way of saying \"I cannot read this\". The `catch` turned that message into a number that looks perfectly valid. The problem is not the exception; it is pretending that a failure is a value. This lesson is about the three honest options: crash loudly, reject with a reason, or represent the failure as a value that cannot be mistaken for success."),

        h2("3. Exceptions in Kotlin"),
        code("kotlin", kt`
class OutOfStock(val sku: String) : Exception("out of stock: $sku")

fun reserve(stock: MutableMap<String, Int>, sku: String, qty: Int) {
    require(qty > 0) { "qty must be positive, was $qty" }
    val left = stock[sku] ?: error("unknown sku $sku")
    if (left < qty) throw OutOfStock(sku)
    stock[sku] = left - qty
    check(stock.getValue(sku) >= 0) { "negative stock for $sku" }
}

fun main() {
    val stock = mutableMapOf("RAU-01" to 3, "TRUNG-10" to 0)
    val price = try { "18.500".toLong() } catch (e: NumberFormatException) { println("caught: #{e.message}"); -1L }
    println(price)
    for ((sku, qty) in listOf("RAU-01" to 2, "TRUNG-10" to 1, "RAU-01" to 0, "SUA-99" to 1)) {
        try {
            reserve(stock, sku, qty)
            println("reserved $qty x $sku")
        } catch (e: OutOfStock) {
            println("sorry, #{e.sku} is sold out")
        } catch (e: IllegalArgumentException) {
            println("bad request: #{e.message}")
        } catch (e: IllegalStateException) {
            println("bug: #{e.message}")
        } finally {
            println("  stock now $stock")
        }
    }
}`, "stock.kt"),
        code("text", `
caught: For input string: "18.500"
-1
reserved 2 x RAU-01
  stock now {RAU-01=1, TRUNG-10=0}
sorry, TRUNG-10 is sold out
  stock now {RAU-01=1, TRUNG-10=0}
bad request: qty must be positive, was 0
  stock now {RAU-01=1, TRUNG-10=0}
bug: unknown sku SUA-99
  stock now {RAU-01=1, TRUNG-10=0}`),
        bullets([
            "**`throw`** an exception object; **`try { } catch (e: Type) { }`** handles it. The first matching `catch` wins, so specific types go first.",
            "**`try` is an expression**: `val price = try { ... } catch (...) { -1L }` gives the value of whichever block ran. Handy, and exactly how the incident's `0` was produced.",
            "**`finally`** always runs, whether the `try` succeeded, threw, or returned. Use it (or `use { }` for files and connections) to release resources.",
            "**Kotlin has no checked exceptions**: no `throws` clause, and the compiler never forces a `catch`. That makes it your job to decide where failures are handled.",
            "**Your own exceptions** are classes that extend `Exception` (or `RuntimeException`), and can carry data, like `OutOfStock.sku`.",
        ]),
        h3("require, check and error"),
        bullets([
            "**`require(condition) { message }`** checks an **argument**: the caller passed something invalid. It throws `IllegalArgumentException`.",
            "**`check(condition) { message }`** checks **state**: this object or the program is in a state that should be impossible. It throws `IllegalStateException`.",
            "**`error(message)`** throws `IllegalStateException` right away; its return type is `Nothing`, so `x ?: error(\"...\")` gives a non-null value (lesson 2).",
            "**`requireNotNull(x)` / `checkNotNull(x)`** combine a null check with a message and a smart cast.",
        ]),
        p("These turn hidden assumptions into loud, early failures with a message, at the line where the assumption breaks, instead of a wrong number three functions later."),

        h2("4. Result: failure as a value"),
        p("Sometimes a failure is not exceptional at all. In a price file, some lines will be wrong, and the job must keep going. For that, Kotlin's standard library has `Result<T>`: either a success with a value, or a failure with the exception. `runCatching { }` runs a block and wraps whatever happens:"),
        code("kotlin", kt`
fun parsePrice(text: String): Result<Long> = runCatching {
    val t = text.trim()
    require(t.isNotEmpty() && t.all { it.isDigit() }) { "invalid price \"$t\"" }
    val price = t.toLong()
    require(price in 1..100_000_000) { "price out of range: $price" }
    price
}

fun main() {
    for (text in listOf("14000", "18.500", "0", " 235000 ")) {
        println("$text -> #{parsePrice(text)}")
    }
    val ok = parsePrice("14000")
    println(ok.isSuccess)
    println(ok.getOrNull())
    println(parsePrice("abc").getOrElse { -1 })
    println(parsePrice("abc").exceptionOrNull()?.message)
    println(parsePrice("15000").map { it * 2 }.getOrThrow())
    parsePrice("18.500")
        .onSuccess { println("apply $it") }
        .onFailure { println("reject: #{it.message}") }
    val text = parsePrice("120000").fold(onSuccess = { "ok $it" }, onFailure = { "no: #{it.message}" })
    println(text)
}`, "result.kt"),
        code("text", `
14000 -> Success(14000)
18.500 -> Failure(java.lang.IllegalArgumentException: invalid price "18.500")
0 -> Failure(java.lang.IllegalArgumentException: price out of range: 0)
 235000  -> Success(235000)
true
14000
-1
invalid price "abc"
30000
reject: invalid price "18.500"
ok 120000`),
        bullets([
            "**The type says it can fail.** A caller of `parsePrice` gets a `Result<Long>`, not a `Long`, and has to decide what a failure means before it can use the price.",
            "**`getOrNull()`, `getOrElse { }`, `getOrThrow()`** take the value out, each with a different answer for failures. **`exceptionOrNull()`** gives the reason.",
            "**`onSuccess { }` / `onFailure { }`** run side effects and return the same `Result`, so they chain. **`fold`** turns both cases into one value. **`map`** transforms a success and leaves a failure alone.",
            "**`require` inside `runCatching`** is a compact way to write validation: every failed check becomes a failure with your message.",
        ]),
        callout("warning", "runCatching catches everything",
            "runCatching catches every Throwable, including programming errors you would rather see crash (an IndexOutOfBounds from your own bug) and, in coroutines, the CancellationException that cancellation relies on. Use it around code whose failures you really mean to handle, keep the block small, and never write runCatching { ... }.getOrDefault(0): that is the incident again in one line."),
        image("bad-line-outcomes", {
            alt: "Three columns for a 1,800-line price file whose line 2 is GAO-05;18.500. Red, swallow and default: try { text.toLong() } catch (e: Exception) { 0 }; line 2 becomes a valid-looking 0, the import reports success, GAO-05 sells for 0 VND and nobody knows until customers find out first. Worst: wrong data, no signal. Orange, let it throw: text.toLong() throws NumberFormatException; the job stops at line 2, line 1 was applied and 1,798 were not, so the catalog is half updated; at least the error is loud. Safe-ish: loud, but all or something. Green, validate then decide: parseLine returns Result<Update> using require with a reason; every line is parsed first, line 2 is rejected with invalid price \"18.500\" and the old price is kept; with few rejections the rest is applied and each rejected line reported; when most lines are rejected the file is broken and nothing is applied. Each line: applied or explained.",
            caption: "Crashing is better than lying. Validating everything first and then deciding is better than both.",
        }),

        h2("5. Designing an import that cannot lie"),
        p("The rewritten import follows three rules that apply to any batch of untrusted input: payment files, CSV uploads, API webhooks."),
        numbered([
            "**Parse everything before changing anything.** Turn each line into a `Result`. Nothing touches the catalog yet.",
            "**Reject with a reason and a location.** `line 2: rejected (invalid price \"18.500\")` lets a person fix the file in a minute. A rejected line changes nothing; the old price stays.",
            "**Decide at the level of the file.** If more than half of the lines are rejected, the file itself is broken (wrong format, wrong supplier, wrong separator): apply nothing and alert someone. Otherwise apply the valid lines and report the rest.",
        ]),
        p("Note what is *not* on the list: a default value. A missing price never becomes 0, a missing quantity never becomes 1. If the code has to invent a value, the input was not good enough, and the right output is a rejection."),

        h2("6. The fix"),
        code("kotlin", kt`
// parsePrice from section 4
fun main() {
    val catalog = mutableMapOf("RAU-01" to 15_000L, "GAO-05" to 240_000L)
    val file = listOf("RAU-01;14000", "GAO-05;18.500")
    file.forEachIndexed { i, line ->
        val (sku, text) = line.split(";")
        parsePrice(text)
            .onSuccess { catalog[sku] = it }
            .onFailure { println("line #{i + 1}: rejected (#{it.message})") }
    }
    println(catalog)
}`, "import.kt"),
        code("text", `
line 2: rejected (invalid price "18.500")
{RAU-01=14000, GAO-05=240000}`),
        p("This is the core; the production version also checks that the SKU exists, handles lines without a `;`, and applies the half-the-file rule. The supplier received the rejection report by email at 06:01 and sent a corrected file at 06:20."),

        h2("7. Your turn"),
        p("The production import still has the 'never fail' code. Fix it: every line is either applied or rejected with the first reason that applies (missing price, invalid price, price out of range, unknown SKU), and a file with more than half of its lines rejected is not applied at all. The test runner starts from a fixed catalog and prints the report and the catalog afterwards."),
        challenge("chal_fix_ktf_411", "Split the work in two passes: first turn every line into a Result (runCatching with require, or your own exception with the reason as its message), then count the failures and decide whether to apply anything. Check the reasons in the order the comment lists them, and remember that toLongOrNull accepts \"-5000\" and \"+5000\"."),

        h2("8. Pitfalls"),
        bullets([
            "**`catch` that returns a default**: `catch (e: Exception) { 0 }` turns 'I cannot read this' into a real-looking value. Reject or rethrow.",
            "**Empty `catch` blocks**: the failure disappears without a trace. At least log it with the input that caused it.",
            "**Catching `Exception` around a whole loop**: one bad line stops the rest, or worse, hides which line was bad. Handle failures per item.",
            "**Applying while parsing**: when you find out the file is broken, half of it is already applied. Parse first, then apply.",
            "**`runCatching` around large blocks**: it also hides your own bugs. Keep it around the code that can legitimately fail.",
            "**`require` vs `check`**: wrong input is `require` (the caller's fault); an impossible state is `check` (a bug). The difference tells the reader where to look.",
        ]),

        h2("9. Checklist"),
        bullets([
            "No `catch` block returns a made-up value; every failure is rethrown, rejected with a reason, or logged with its input.",
            "Preconditions are `require`, invariants are `check`, and both have messages that include the bad value.",
            "Batch input is validated completely before anything is applied, and a mostly broken batch is not applied.",
            "Functions whose failures are expected return `Result` (or a sealed type), so callers must decide what failure means.",
            "Error messages name the line, the field and the value.",
        ]),
        p("Next lesson: the mini project. Everything from this course comes together in the cart summary that the checkout screen shows."),
    ],
});
