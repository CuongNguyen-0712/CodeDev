// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Kotlin code uses ${...} templates, which a JS template literal would evaluate: write them as #{...}, kt() puts the $ back.
const kt = (strings, ...values) => String.raw(strings, ...values).replaceAll("#{", "${");

export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-ktf-1-2",
    title: "Null safety: ?., ?: and the !! crash",
    slug: { _type: "slug", current: "kotlin-null-safety-safe-call-elvis" },
    description:
        "Release 4.13 of the Cho Xanh app crashed the cart screen for every customer who had signed up with Zalo and had no delivery address yet: crash-free users fell from 99.6% to 91% in two hours. The cause was two characters, !!. Learn nullable types, safe calls, the elvis operator, smart casts, the functions that return null instead of throwing, platform types from Java, lateinit, and when (almost never) !! is the right tool.",
    estimatedTime: 18,

    scenario: {
        role: "Junior Android developer on the cart team at Cho Xanh, a grocery delivery app in Hanoi",
        problem:
            "The new cart header says 'Hi Lan - deliver to 12 Hang Bac, Hoan Kiem'. It shipped on Tuesday morning. By noon, Firebase Crashlytics showed a NullPointerException in cartHeader as the top crash, for every customer who had signed up with Zalo and never entered an address. They could fill a cart but never open it.",
    },

    content: [
        h2("1. The incident"),
        p("Since spring, customers can sign up for Cho Xanh with one tap through Zalo. That sign-up gives the app a phone number and nothing else: no display name until the customer edits the profile, and no address until the first checkout. About 30% of new customers now arrive this way."),
        p("Release 4.13 added a friendly header to the cart screen: `Hi Lan - deliver to 12 Hang Bac, Hoan Kiem`. The developer tested it with their own complete profile and with the QA team's accounts, which were all created years ago with the old sign-up form. It rolled out to 100% at 09:00 on Tuesday."),
        bullets([
            "**At 11:40**, Crashlytics showed a new top crash: `java.lang.NullPointerException at CartHeaderKt.cartHeader`.",
            "**Crash-free users** dropped from 99.6% to 91%. Every Zalo customer who added something to the cart and tapped the cart icon was thrown back to the home screen.",
            "**The rollback** took 50 minutes, because the previous build had to go through Play review again. Support counted 2,300 abandoned carts.",
        ]),

        h2("2. Reproduce it"),
        code("kotlin", kt`
data class Address(val street: String?, val ward: String?, val district: String)
data class Profile(val id: String, val displayName: String?, val address: Address?)

fun cartHeader(p: Profile): String =
    "Hi #{p.displayName!!} - deliver to #{p.address!!.street!!}, #{p.address.district}"

fun main() {
    val profiles = listOf(
        Profile("CX-U01", "Lan", Address("12 Hang Bac", "Hang Bac", "Hoan Kiem")),
        Profile("CX-U02", "Minh", null), // signed up with Zalo, no address yet
    )
    for (p in profiles) println(cartHeader(p))
}`, "header.kt"),
        code("text", `
Hi Lan - deliver to 12 Hang Bac, Hoan Kiem
Exception in thread "main" java.lang.NullPointerException
	at MainKt.cartHeader(header.kt:5)
	at MainKt.main(header.kt:12)
	at MainKt.main(header.kt)`),
        p("The model was honest. `displayName: String?` and `address: Address?` say, in the type, that these values can be missing. The compiler would not let the header use them directly, so the author added `!!` until the errors went away. Every `!!` is a promise to the compiler: \"this is never null, and if I am wrong, crash\". The promise was wrong for 30% of new customers."),

        h2("3. Nullable types"),
        p("In Kotlin, `null` is not a value of every type. A `String` always holds a string; only a `String?` (read: nullable String) may hold `null`. The compiler tracks the difference everywhere:"),
        code("kotlin", `
val phone: String? = null
println(phone.length)               // error
val ward: String = null             // error
val n: Int = "15".toIntOrNull()     // error`),
        code("text", `
error: only safe (?.) or non-null asserted (!!.) calls are allowed on a nullable receiver of type 'String?'.
error: null cannot be a value of a non-null type 'String'.
error: initializer type mismatch: expected 'Int', actual 'Int?'.`),
        p("This is the main reason Android teams moved from Java to Kotlin: the classic `NullPointerException` becomes a compile error, as long as you do not tell the compiler to look away. The error message even lists the two ways forward, and only one of them is safe."),
        bullets([
            "**`String` and `String?` are different types.** A `String` can be used where a `String?` is expected, never the other way round.",
            "**Make a type nullable only when \"missing\" is a real state**: a customer without an address, an optional note, a lookup that can fail. An order id that always exists should be a plain `String`.",
            "**Nullable types also exist for numbers and your own classes**: `Int?`, `Address?`, `List<String>?`.",
        ]),

        h2("4. The safe tools"),
        h3("Safe call ?. and elvis ?:"),
        code("kotlin", `
fun main() {
    val ward: String? = null
    val district: String? = "Hoan Kiem"
    println(ward?.length)
    println(district?.length)
    println(ward ?: "unknown ward")
    println(ward?.uppercase() ?: "NO WARD")
    if (district != null) println(district.lowercase())
    println("15000".toIntOrNull())
    println("15k".toIntOrNull())
    val fees = mapOf("Hoan Kiem" to 15_000)
    println(fees["Gia Lam"])
    println(fees["Gia Lam"] ?: "n/a")
    println(listOfNotNull("12 Hang Bac", null, "Hoan Kiem").joinToString(", "))
    println(listOf("a", null, "b").filterNotNull())
    println(listOf<String>().firstOrNull())
    val name: String? = "  "
    println(name.isNullOrBlank())
}`, "safe.kt"),
        code("text", `
null
9
unknown ward
NO WARD
hoan kiem
15000
null
null
n/a
12 Hang Bac, Hoan Kiem
[a, b]
null
true`),
        bullets([
            "**`a?.b`** calls `b` only when `a` is not null; otherwise the whole expression is `null`. Chains stop at the first null: `p.address?.street?.uppercase()`.",
            "**`a ?: b`** (the elvis operator) gives `a` when it is not null, and `b` otherwise. The result of `x?.length ?: 0` is a plain `Int`.",
            "**`if (x != null)`** smart-casts `x` to the non-null type inside the branch, so no `?.` or `!!` is needed there.",
            "**Functions that return null instead of throwing**: `toIntOrNull()`, `firstOrNull()`, `getOrNull(i)`, a map's `[key]`. Prefer them at every boundary where data comes from outside: user input, JSON, a database row.",
            "**Collections**: `listOfNotNull(...)` and `filterNotNull()` drop the nulls; `isNullOrBlank()` and `isNullOrEmpty()` can be called on a `String?` directly.",
        ]),
        image("null-operators", {
            alt: "A table with three columns: the expression, its result when ward is \"Hang Bac\", and its result when ward is null. ward?.length gives 8, or null because the call is skipped. ward?.length ?: 0 gives 8, or the fallback 0. val w = ward ?: return \"add an address\" makes w a String, or leaves the function. if (ward != null) ward.length gives 8 through a smart cast, or skips the branch. listOfNotNull(street, ward, district) keeps \"Hang Bac\", or drops the null. A last row in red: ward!!.length gives 8, or crashes with a NullPointerException.",
            caption: "Every safe tool gives you a decision for the null case. !! is the only one that turns it into a crash.",
        }),
        callout("warning", "Mind the precedence of ?:",
            "The elvis operator binds more loosely than +, comparisons and most other operators. \"Ward: \" + ward?.length ?: 0 is (\"Ward: \" + ward?.length) ?: 0, which prints Ward: null. Put the elvis in parentheses when it is part of a larger expression."),
        challenge("chal_quiz_ktf_121", "For the first question, add the parentheses the compiler adds: which operator runs first, + or ?:? For the second, sort the lines into three groups: does not compile, compiles but can throw, compiles and cannot throw."),

        h3("Elvis with return and throw"),
        p("The right-hand side of `?:` can be `return` or `throw`. That gives you an early exit, and after that line the variable is non-null for the rest of the function:"),
        code("kotlin", kt`
val FEES = mapOf("Hoan Kiem" to 15_000, "Dong Da" to 20_000)

fun feeFor(district: String?): Int {
    val d = district ?: return 0
    return FEES[d] ?: error("No delivery zone for $d")
}

fun main() {
    println(feeFor("Dong Da"))
    println(feeFor(null))
    val id: String? = null
    println(runCatching { requireNotNull(id) { "order id missing" } })
    println(feeFor("Gia Lam"))
}`, "fees.kt"),
        code("text", `
20000
0
Failure(java.lang.IllegalArgumentException: order id missing)
Exception in thread "main" java.lang.IllegalStateException: No delivery zone for Gia Lam
	at MainKt.feeFor(fees.kt:5)`),
        p("`error(message)` throws an `IllegalStateException`, and `requireNotNull(x) { message }` throws an `IllegalArgumentException` with your message. Both still crash, but deliberately and with a message that says what was missing, where `!!` gives a bare `NullPointerException`. Lesson 9 covers when to throw and when to return a result instead."),
        h3("let for a nullable value"),
        code("kotlin", kt`
fun main() {
    var cartNote: String? = "Leave at the door"
    println(cartNote?.let { "Note: $it" } ?: "No note")
    cartNote = null
    println(cartNote?.let { "Note: $it" } ?: "No note")
}`, "note.kt"),
        code("text", `
Note: Leave at the door
No note`),
        p("`x?.let { ... }` runs the block only when `x` is not null, with the value available as `it`. It is handy to transform a nullable value in one expression. Lesson 8 looks at `let` and the other scope functions in detail, including a trap when the block itself returns null."),
        h3("When smart casts stop working"),
        p("A smart cast needs a value that cannot change between the check and the use. A local `val` or `var`, or a `val` property in the same module, qualify. A `var` property of a class does not, because another thread or a callback could set it back to null in between:"),
        code("kotlin", `
class Cart { var note: String? = null }

fun main() {
    val cart = Cart()
    if (cart.note != null) println(cart.note.length)   // error
    val note = cart.note                               // copy it into a local val
    if (note != null) println(note.length)             // fine
    cart.note?.let { println(it.length) }              // also fine
}`),
        code("text", `
error: smart cast to 'String' is impossible, because 'note' is a mutable property that could be mutated concurrently.`),
        p("The fix is never `!!`. Copy the property into a local `val` and check that, or use `?.let`."),

        h2("5. Where nulls sneak in anyway"),
        h3("Java APIs: platform types"),
        p("Android and many backend libraries are written in Java, which has no nullable types. Kotlin shows their results as **platform types**, written `String!` in error messages: the compiler does not know, so it lets you choose. Choose wrong and you get a crash at run time, at the line where Kotlin inserts its check:"),
        code("kotlin", `
fun main() {
    val region: String = System.getenv("CX_REGION")  // not set on this machine
    println(region)
}`),
        code("text", `
Exception in thread "main" java.lang.NullPointerException: getenv(...) must not be null`),
        p("Treat every Java result that can be missing as nullable: `val region: String? = System.getenv(\"CX_REGION\")`, then decide what a missing region means. Android's own APIs carry `@Nullable` and `@NonNull` annotations on most methods, and Kotlin turns those into real `?` types; plain Java libraries often do not."),
        h3("lateinit"),
        p("Android creates screens and binds views after the constructor runs, so properties are often set in `onCreate` or `onViewCreated`. `lateinit var binding: CartBinding` declares a non-null property that is filled in later. Reading it too early throws:"),
        code("text", `
kotlin.UninitializedPropertyAccessException: lateinit property title has not been initialized`),
        p("`lateinit` is fine for framework lifecycles where the order is guaranteed. For data that can genuinely be missing, like a customer's address, use a nullable type and handle the null."),

        h2("6. Is !! ever right?"),
        p("Rarely. `!!` is acceptable when null would be a bug in **your own** code and a crash is the best outcome, for example in a test, or right after a line that just created the value. Even then, `requireNotNull(x) { \"why it should exist\" }` or `checkNotNull` crash with a message, which makes the crash report useful. Many teams ban `!!` with a lint rule (detekt's `UnsafeCallOnNullableType`) and allow it only with a comment that explains why."),
        callout("tip", "Ask what null means",
            "Every ?. and ?: is a small product decision: what should the screen show when the name is missing? 'Hi there' or nothing? Should a missing address hide the header or ask for an address? Write the answer into the code instead of letting !! answer 'crash'."),

        h2("7. The fix"),
        code("kotlin", kt`
data class Address(val street: String?, val ward: String?, val district: String)
data class Profile(val id: String, val displayName: String?, val address: Address?)

fun cartHeader(p: Profile): String {
    val name = p.displayName?.trim()?.takeIf { it.isNotEmpty() } ?: "there"
    val address = p.address ?: return "Hi $name - add a delivery address"
    val where = listOfNotNull(address.street, address.ward, address.district).joinToString(", ")
    return "Hi $name - deliver to $where"
}

fun main() {
    val profiles = listOf(
        Profile("CX-U01", "Lan", Address("12 Hang Bac", "Hang Bac", "Hoan Kiem")),
        Profile("CX-U02", "Minh", null),
        Profile("CX-U03", null, Address(null, "Lang Thuong", "Dong Da")),
        Profile("CX-U04", "   ", Address("88 Tran Thai Tong", null, "Cau Giay")),
    )
    for (p in profiles) println(cartHeader(p))
}`, "header.kt"),
        code("text", `
Hi Lan - deliver to 12 Hang Bac, Hang Bac, Hoan Kiem
Hi Minh - add a delivery address
Hi there - deliver to Lang Thuong, Dong Da
Hi there - deliver to 88 Tran Thai Tong, Cau Giay`),
        numbered([
            "**`p.displayName?.trim()?.takeIf { it.isNotEmpty() } ?: \"there\"`**: a missing name, an empty name and a name of only spaces all become \"there\". `takeIf` gives the value when the condition holds, and `null` otherwise.",
            "**`p.address ?: return ...`**: the case without an address is handled first and leaves the function. After that line, `address` is an `Address`, not an `Address?`.",
            "**`listOfNotNull(...)`** builds the address from the parts that exist, so a missing street does not print `null, Lang Thuong`.",
            "**No `!!` left.** The team also added profiles from the Zalo sign-up to the QA accounts, and a detekt rule that fails the build on a new `!!`.",
        ]),

        h2("8. Your turn"),
        p("The real header also shows the delivery fee of the customer's district, and 4.13 crashed there too. Fix `greeting`, `deliverTo` and `deliveryFee` without `!!`. The test runner reads one profile per line (`ID|DISPLAY_NAME|DISTRICT|WARD|STREET`, with `-` for a missing value) and prints the header of each profile."),
        challenge("chal_fix_ktf_122", "Decide what each missing value should become before you write any code: a missing name, a name of only spaces, no address, an address without a street or ward, a district without a fee. Then remove every !! and use ?., ?: with return, listOfNotNull and a map lookup that can give null."),

        h2("9. Pitfalls"),
        bullets([
            "**`!!` to silence the compiler**: it moves the error from compile time to your users' phones.",
            "**`?.` in a template**: `\"${a?.street}\"` prints the word `null` when the value is missing. Decide on a fallback or skip the part.",
            "**Elvis precedence**: `\"Ward: \" + x ?: 0` applies the elvis to the whole string. Use parentheses.",
            "**Defaulting to a value that looks real**: `fee ?: 0` shows a free delivery that does not exist. A missing value often deserves its own text (`n/a`) or state.",
            "**Platform types from Java**: a Java method that can return null crashes when you assign it to a non-null Kotlin type.",
            "**Checking a `var` property and then using it**: no smart cast. Copy it into a local `val` first.",
        ]),

        h2("10. Checklist"),
        bullets([
            "A type is nullable only when \"missing\" is a real state, and every nullable value has a decided fallback.",
            "No `!!` in production code, or each one has a comment and could be a `requireNotNull` with a message.",
            "Input from outside (user, JSON, database, Java APIs) is parsed with the `OrNull` functions or nullable types.",
            "Early exits use `val x = y ?: return ...`, so the rest of the function works with non-null values.",
            "Tests include incomplete data: new accounts, missing fields, empty strings.",
        ]),
        p("Next lesson: `when` and sealed interfaces. The backend added an order status, and the app quietly showed 'Unknown' for every order that had it."),
    ],
});
