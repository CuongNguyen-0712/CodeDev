// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Kotlin code uses ${...} templates, which a JS template literal would evaluate: write them as #{...}, kt() puts the $ back.
const kt = (strings, ...values) => String.raw(strings, ...values).replaceAll("#{", "${");

export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-ktf-1-1",
    title: "val, var, types & type inference",
    slug: { _type: "slug", current: "kotlin-val-var-types-type-inference" },
    description:
        "Release 4.12 of Cho Xanh's checkout showed every customer a free-shipping bar stuck at 0%, sent push notifications that began with 'Hi Order(id=CX-1042, ...' and gave a restaurant's wholesale order a negative total. All three came from code that compiled cleanly. Learn val and var, how Kotlin infers types, why it never converts numbers for you, how Int overflow and integer division behave, and how string templates, raw strings and multi-dollar strings work.",
    estimatedTime: 18,

    scenario: {
        role: "Junior Kotlin developer on the checkout team at Cho Xanh, a grocery delivery app in Hanoi with an Android app and a Kotlin backend",
        problem:
            "Release 4.12 moved the cart summary from the Android app to a shared Kotlin module used by the app and the backend. Within an hour, support had three kinds of tickets: the free-shipping bar never moved, the 'order on its way' push notification started with a dump of the whole order object, and a restaurant's wholesale order of Wagyu beef showed a total of minus two billion dong.",
    },

    content: [
        h2("1. The incident"),
        p("Cho Xanh delivers groceries in Hanoi. Customers fill a cart in the Android app, and the checkout screen shows the subtotal, the delivery fee and a bar that fills up towards free shipping at 300,000 VND. The bar matters: in A/B tests it made the average cart 18% larger, because people add one more item to unlock free delivery."),
        p("Release 4.12 moved the cart math into a shared Kotlin module, so the app and the backend compute the same numbers. It passed code review and the unit tests, which only checked the subtotal. At 10:05 on a Saturday it reached 100% of users. By 11:00 support had three kinds of tickets:"),
        bullets([
            "**The free-shipping bar was stuck at 0%** for every cart below 300,000 VND, then jumped straight to 'unlocked'.",
            "**The 'order on its way' push notification** started with `Hi Order(id=CX-1042, customer=Lan).customer, order Order(...` instead of the customer's name.",
            "**A restaurant's wholesale order** of 500 kg of Wagyu beef at 4,500,000 VND per kg showed a line total of **-2,044,967,296 VND**. The buyer called, unsure whether Cho Xanh now owed them money.",
        ]),
        p("Nothing crashed. There was no exception in the logs and no warning in the build. Each number was exactly what the code asked for, which is the uncomfortable part of this lesson."),

        h2("2. Reproduce it"),
        p("Here is the core of the module, cut down to one order. Save it as `cart.kt` and run it with `kotlinc cart.kt -include-runtime -d cart.jar && java -jar cart.jar` (Kotlin 2.3), or paste it into play.kotlinlang.org:"),
        code("kotlin", kt`
data class Order(val id: String, val customer: String)
data class CartLine(val name: String, val qty: Int, val unitPrice: Int)

const val FREE_SHIPPING_FROM = 300_000

fun main() {
    val order = Order("CX-1042", "Lan")
    val lines = listOf(
        CartLine("Rau muong", 2, 15_000),
        CartLine("Thit bo Uc", 1, 185_000),
        CartLine("Trung ga ta", 1, 30_000),
    )
    var subtotal = 0
    for (line in lines) subtotal += line.qty * line.unitPrice
    val progress = subtotal / FREE_SHIPPING_FROM * 100
    println("Subtotal: $subtotal VND, free shipping: $progress%")
    println("Hi $order.customer, order $order.id is on its way!")

    val wholesale = CartLine("Bo Wagyu A5", 500, 4_500_000)
    println("Wholesale line: #{wholesale.qty * wholesale.unitPrice} VND")
}`, "cart.kt"),
        code("text", `
Subtotal: 245000 VND, free shipping: 0%
Hi Order(id=CX-1042, customer=Lan).customer, order Order(id=CX-1042, customer=Lan).id is on its way!
Wholesale line: -2044967296 VND`),
        p("Three lines, three bugs, and the compiler accepted every one of them. The subtotal is right: 245,000 VND. To see why the rest is wrong, you need to know how Kotlin decides the type of every value, and what it does (and refuses to do) with those types."),

        h2("3. val and var"),
        p("Kotlin has two keywords for local variables and properties:"),
        bullets([
            "**`val`** is a read-only reference: it gets a value once and can never be reassigned. Use it by default.",
            "**`var`** is a mutable reference: you can assign it again, but only with a value of the same type.",
        ]),
        code("kotlin", `
val shopName = "Cho Xanh"
var itemsInCart = 0
itemsInCart += 2                      // fine: var
val cart = mutableListOf("Rau muong")
cart.add("Trung ga ta")               // fine: the reference is fixed, the list is not

shopName = "Cho Do"                   // error
var fee = 15_000
fee = 15_000.5                        // error`),
        code("text", `
error: 'val' cannot be reassigned.
error: assignment type mismatch: actual type is 'Double', but 'Int' was expected.`),
        p("Two details matter more than they look. First, `val` freezes the **reference**, not the object: `cart` will always point to the same list, but that list can still grow and shrink. Lesson 6 is about the bugs that come from confusing the two. Second, a `var` keeps the type it was declared with. `var fee = 15_000` makes `fee` an `Int` forever; a fee of 15,000.5 needs a different type, chosen on purpose."),
        callout("tip", "Start with val",
            "Android Studio and IntelliJ flag a var that is never reassigned and offer to turn it into val. Fewer vars means fewer places where a value can change behind your back, and a val is safe to read from several threads once it is set."),
        p("At the top level of a file you can also write `const val FREE_SHIPPING_FROM = 300_000`. `const` is for compile-time constants: numbers, `Boolean`, `Char` and `String` values known when the code is compiled. The underscores in `300_000` are only for readers; the compiler ignores them."),

        h2("4. Types and type inference"),
        p("Every value in Kotlin has a type that is fixed at compile time. You rarely write it, because the compiler **infers** it from the value on the right-hand side:"),
        code("kotlin", kt`
fun main() {
    val qty = 2               // Int
    val big = 3_000_000_000   // Long: too big for an Int
    val weightKg = 0.5        // Double
    val discount = 0.1f       // Float
    val fresh = true          // Boolean
    val grade = 'A'           // Char
    val name = "Rau muong"    // String
    for (v in listOf<Any>(qty, big, weightKg, discount, fresh, grade, name)) {
        print("#{v::class.simpleName} ")
    }
    println()
    println(Int.MAX_VALUE)
    println(Long.MAX_VALUE)
    println(qty * 15_000)          // Int * Int -> Int
    println(qty * 1_850_000_000L)  // Int * Long -> Long
    println(Int.MAX_VALUE + 1)     // wraps around, no error
}`, "types.kt"),
        code("text", `
Int Long Double Float Boolean Char String
2147483647
9223372036854775807
30000
3700000000
-2147483648`),
        bullets([
            "**A whole-number literal is an `Int`** if it fits (up to 2,147,483,647), otherwise a `Long`. Add `L` to ask for a `Long` explicitly: `0L`, `15_000L`.",
            "**A literal with a decimal point is a `Double`.** Add `f` for a `Float`. Use `Double` unless an API asks for `Float` (Android graphics APIs often do).",
            "**`Char` is one UTF-16 code unit** in single quotes, not a number you can add to an `Int`.",
            "**Write the type when it helps the reader** or when the default is wrong: `val subtotal: Long = 0` reads better than `0L` to some teams, and both mean the same.",
        ]),
        h3("Kotlin never converts numbers for you"),
        p("In Java, an `int` silently widens to a `long` when you assign it. Kotlin refuses, even when the conversion would be safe:"),
        code("kotlin", `
val qty = 3
val total: Long = qty * 15_000        // error
val weight: Double = 1                // error`),
        code("text", `
error: initializer type mismatch: expected 'Long', actual 'Int'.
error: initializer type mismatch: expected 'Double', actual 'Int'.`),
        p("You convert explicitly with `toLong()`, `toInt()`, `toDouble()` and friends. The arithmetic operators are more relaxed: `Int * Long` is allowed and gives a `Long`, `Int / Double` gives a `Double`. The rule is simple and strict: **the type of an expression comes from its operands, never from the variable that receives it.** That rule explains the incident."),

        h2("5. Arithmetic that does exactly what you wrote"),
        h3("Int overflow wraps around"),
        p("An `Int` has 32 bits. `500 * 4_500_000` is 2,250,000,000, which needs more than 31 bits plus a sign. Kotlin on the JVM does what the processor does: it keeps the low 32 bits and drops the rest. The result is 2,250,000,000 - 4,294,967,296 = **-2,044,967,296**. No exception, no warning. Declaring the result as a `Long` afterwards does not help, because the multiplication already happened in `Int`:"),
        code("kotlin", `
val wrong: Long = (qty * unitPrice).toLong()   // overflows first, then converts
val right: Long = qty.toLong() * unitPrice      // Long * Int -> Long, no overflow`),
        p("For money, use `Long` in the smallest unit (whole dong; cents for USD), and convert **before** you multiply. If a value must never overflow and you would rather fail loudly, `Math.multiplyExact(500, 4_500_000)` throws `ArithmeticException: integer overflow` instead of wrapping."),
        h3("Integer division truncates"),
        code("kotlin", `
fun main() {
    val subtotal = 245_000
    println(subtotal / 300_000)
    println(subtotal / 300_000 * 100)
    println(subtotal * 100 / 300_000)
    println(subtotal.toDouble() / 300_000 * 100)
    println("%.1f".format(subtotal * 100.0 / 300_000))
    println(7 / 2)
    println(7 / 2.0)
    println(-7 / 2)
    println(-7 % 2)
    println(10 / 0.0)
    println(0.1 + 0.2)
}`, "division.kt"),
        code("text", `
0
0
81
81.66666666666667
81.7
3
3.5
-3
-1
Infinity
0.30000000000000004`),
        bullets([
            "**`Int / Int` is an `Int`**, rounded towards zero: 245,000 / 300,000 is 0, and `-7 / 2` is -3. The operators run left to right, so `subtotal / 300_000 * 100` divides first and multiplies a 0.",
            "**Multiplying first** (`subtotal * 100 / 300_000`) gives 81, which is better but still loses the decimals, and it overflows sooner.",
            "**Convert one operand to `Double`** for a real ratio. `\"%.1f\".format(x)` rounds it to one decimal for display.",
            "**`%` is the remainder**, and it takes the sign of the left operand: `-7 % 2` is -1. Use `mod` when you need a result that is never negative.",
            "**Division by zero**: an `Int` division by 0 throws `ArithmeticException: / by zero`; a `Double` division gives `Infinity` or `NaN`, silently.",
            "**`Double` is binary floating point**: 0.1 + 0.2 is not exactly 0.3. Fine for a progress bar, wrong for money.",
        ]),
        image("three-silent-bugs", {
            alt: "Three rows, each with a red box for what the release wrote, a grey box for what happens and a green box for the fix. Row 1: qty * unitPrice is Int times Int, 500 x 4,500,000 = 2,250,000,000 is more than Int.MAX_VALUE 2,147,483,647, so the bits wrap around to -2044967296; the fix qty.toLong() * unitPrice is Long times Int and gives 2250000000. Row 2: subtotal / 300_000 * 100 is Int divided by Int, 245,000 / 300,000 is 0 and 0 x 100 is 0, so the bar never moves; the fix subtotal.toDouble() / 300_000 * 100 gives 81.66666666666667. Row 3: the template \"order $order.id is on its way\" takes only $order and then the text .id, printing Order(id=CX-1042, customer=Lan).id; the fix ${order.id} evaluates the whole expression and prints CX-1042. A rule of thumb at the bottom: convert before you multiply or divide, and use ${...} for anything longer than a single name.",
            caption: "The three bugs of release 4.12. The types come from the operands, and $ takes a single name.",
        }),
        challenge("chal_quiz_ktf_111", "For the template, ask where the name after each $ ends. For the statements, work out the type of each expression from its operands, and remember which mistakes Kotlin rejects at compile time and which ones just give a strange number."),

        h2("6. String templates"),
        p("A string template puts a value into a string literal. `$name` inserts a single variable; `${expression}` inserts any expression. The catch is in the word **single**: after a `$`, Kotlin reads the longest identifier it can and stops. A dot is not part of an identifier, so `\"$order.id\"` means `$order` followed by the text `.id`. Since `Order` is a data class, `$order` prints its `toString()`: `Order(id=CX-1042, customer=Lan)`."),
        code("kotlin", kt`
data class CartLine(val name: String, val qty: Int, val unitPrice: Int)

fun main() {
    val line = CartLine("Rau muong", 2, 15_000)
    val customer = "Lan"
    println("Hi $customer!")
    println("#{line.qty} x #{line.name}: #{line.qty * line.unitPrice} VND")
    println("$line.name")
    println("#{customer.uppercase()} has #{if (line.qty > 1) "items" else "an item"}")
    println("Price in USD: #{'$'}0.60")
    val sms = """
        Cho Xanh: order CX-1042
        #{line.qty} x #{line.name}
        Total: #{line.qty * line.unitPrice} VND
    """.trimIndent()
    println(sms)
    val sku = "RAU-01"
    println($$"""{"$schema": "cart-line", "sku": "$$sku"}""")
}`, "templates.kt"),
        code("text", `
Hi Lan!
2 x Rau muong: 30000 VND
CartLine(name=Rau muong, qty=2, unitPrice=15000).name
LAN has items
Price in USD: $0.60
Cho Xanh: order CX-1042
2 x Rau muong
Total: 30000 VND
{"$schema": "cart-line", "sku": "RAU-01"}`),
        bullets([
            "**Use `${...}` for anything that is not a single name**: properties, calls, arithmetic, `if` expressions. Many teams use braces everywhere in user-facing text, so a later edit cannot turn `$name` into `$name.first` by accident.",
            "**A literal dollar sign** is `${'$'}` in a normal string. A `$` followed by something that cannot start a name (like a digit) is also kept as is, but the explicit form is clearer.",
            "**Raw strings** use triple quotes: no escapes, line breaks are kept, and templates still work. `trimIndent()` removes the common indentation, so the text can follow your code's indentation.",
            "**Multi-dollar strings** (stable since Kotlin 2.2): with `$$` before the opening quotes, a single `$` is plain text and only `$$` starts a template. That is handy for JSON schemas, shell scripts and other text full of dollar signs.",
        ]),
        callout("warning", "Templates call toString()",
            "Whatever you put in a template is turned into text with toString(). For a data class that is a debug format with every property, which is how a customer's notification ended up showing the order's internals. In user-facing text, insert the exact property you mean, and never a whole object."),

        h2("7. The fix"),
        p("The fixed module keeps money in `Long`, converts before dividing, and names every property in the templates:"),
        code("kotlin", kt`
data class Order(val id: String, val customer: String)
data class CartLine(val name: String, val qty: Int, val unitPrice: Int)

const val FREE_SHIPPING_FROM = 300_000

fun lineTotal(line: CartLine): Long = line.qty.toLong() * line.unitPrice

fun main() {
    val order = Order("CX-1042", "Lan")
    val lines = listOf(
        CartLine("Rau muong", 2, 15_000),
        CartLine("Thit bo Uc", 1, 185_000),
        CartLine("Trung ga ta", 1, 30_000),
    )
    var subtotal = 0L
    for (line in lines) subtotal += lineTotal(line)
    val progress = subtotal.toDouble() / FREE_SHIPPING_FROM * 100
    println("Subtotal: $subtotal VND, free shipping: #{"%.1f".format(progress)}%")
    println("Hi #{order.customer}, order #{order.id} is on its way!")

    val wholesale = CartLine("Bo Wagyu A5", 500, 4_500_000)
    println("Wholesale line: #{lineTotal(wholesale)} VND")
}`, "cart.kt"),
        code("text", `
Subtotal: 245000 VND, free shipping: 81.7%
Hi Lan, order CX-1042 is on its way!
Wholesale line: 2250000000 VND`),
        numbered([
            "**`var subtotal = 0L`**: the `L` makes the running total a `Long`, so `+=` with a `Long` line total compiles and cannot overflow at realistic amounts.",
            "**`line.qty.toLong() * line.unitPrice`**: the conversion happens before the multiplication. `lineTotal` is a single-expression function: `= expression` instead of a block with `return`, and its return type is written out because it is part of the module's API.",
            "**`subtotal.toDouble() / FREE_SHIPPING_FROM * 100`** gives 81.66..., and `\"%.1f\".format(...)` turns it into the text 81.7 for the bar's label.",
            "**`${order.customer}` and `${order.id}`** with braces: the template inserts the property, not the object.",
        ]),
        p("The team also added unit tests for a cart of exactly 300,000 VND, an empty cart and the wholesale order, and a lint rule that flags templates of data classes in user-facing strings."),

        h2("8. Your turn"),
        p("Write the checkout summary of the real screen. Customers pay a 15,000 VND delivery fee until the subtotal reaches 300,000 VND, an empty cart pays nothing, and the bar shows the progress with one decimal. The test runner reads one cart line per line (`SKU QTY UNIT_PRICE NAME`) and prints the summary; you write `lineTotal`, `shippingFee` and `freeShippingProgress`. The starter contains the naive versions from release 4.12."),
        challenge("chal_coding_ktf_112", "Look at the type of every multiplication and division before it happens, not after. Then check the two edges: a cart of exactly 300,000 VND, and a cart with no lines at all."),

        h2("9. Pitfalls"),
        bullets([
            "**Converting after the operation**: `(a * b).toLong()` and `(a / b).toDouble()` convert a result that is already wrong. Convert an operand first.",
            "**`Int` for money**: 2,147,483,647 VND is about 80,000 USD. Wholesale orders, monthly reports and totals over many orders pass it easily. Use `Long`.",
            "**`Double` for money**: fine for a progress bar, wrong for a balance. 0.1 + 0.2 is 0.30000000000000004.",
            "**`$object.property` in a template**: it prints the whole object, then the text `.property`. Use braces.",
            "**Assuming `val` means immutable**: a `val` holding a `MutableList` can still change its contents.",
            "**Relying on `%` for wrap-around indexes**: it can be negative. Use `mod`.",
        ]),

        h2("10. Checklist"),
        bullets([
            "Locals and properties are `val` unless they really need to change.",
            "Money is a `Long` in the smallest currency unit; conversions happen before `*` and `/`.",
            "Ratios convert one operand to `Double`, and the division by zero case is handled or impossible.",
            "Every template that inserts more than a single name uses `${...}`, and user-facing text never inserts a whole object.",
            "Edge cases (exact threshold, empty input, very large input) have a test.",
        ]),
        p("Next lesson: null safety. A one-character shortcut, `!!`, crashed the app for every customer who signed up with a phone number and no address."),
    ],
});
