// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Kotlin code uses ${...} templates, which a JS template literal would evaluate: write them as #{...}, kt() puts the $ back.
const kt = (strings, ...values) => String.raw(strings, ...values).replaceAll("#{", "${");

export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-ktf-2-3",
    title: "Classes, interfaces & visibility",
    slug: { _type: "slug", current: "kotlin-classes-interfaces-visibility" },
    description:
        "The Cho Xanh wallet let any screen write wallet.balance directly. The checkout checked the balance first; the new gift-voucher screen did not, and 640 customers ended the week with a negative balance after buying vouchers with money they did not have. Learn classes with primary constructors, init blocks and require, properties with private setters and custom getters, visibility modifiers, interfaces with default methods, abstract and open classes, and object declarations.",
    estimatedTime: 20,

    scenario: {
        role: "Junior Kotlin developer on the payments team at Cho Xanh, a grocery delivery app in Hanoi",
        problem:
            "Vi Xanh, the in-app wallet, stores prepaid money. Its balance was a public var. The checkout subtracted orders after checking the balance, but the gift-voucher screen, built by the marketing team in a hurry before Tet, subtracted the voucher price without any check. Finance found 640 wallets below zero, the lowest at -1,450,000 VND.",
    },

    content: [
        h2("1. The incident"),
        p("Vi Xanh is Cho Xanh's wallet: customers top it up by bank transfer and pay for groceries with one tap. For three years it had one way in and one way out, the top-up and the checkout, and both were written by the payments team."),
        p("Two weeks before Tet, the marketing team built a gift-voucher screen: buy a 50,000 or 500,000 VND voucher for a friend, paid from your wallet. The `Wallet` class had a public `var balance`, so the voucher screen did the obvious thing and subtracted the price. It never checked whether the money was there."),
        bullets([
            "**640 wallets** ended the week below zero, after customers bought vouchers they could not afford. The lowest was **-1,450,000 VND**.",
            "**The vouchers were real**: friends redeemed them for groceries, so Cho Xanh paid for food nobody had paid for.",
            "**Nobody broke a rule** that the code enforced. The rule ('a balance never goes below zero') lived in the checkout function, not in the wallet.",
        ]),

        h2("2. Reproduce it"),
        code("kotlin", `
class Wallet {
    var balance: Long = 0
}

// checkout screen
fun payOrder(w: Wallet, total: Long): Boolean {
    if (w.balance < total) return false
    w.balance -= total
    return true
}

// "buy a gift voucher" screen, written by another team
fun buyVoucher(w: Wallet, price: Long) {
    w.balance -= price
}

fun main() {
    val w = Wallet()
    w.balance += 200_000          // top-up
    println(payOrder(w, 180_000))
    buyVoucher(w, 50_000)
    println(w.balance)
}`, "wallet.kt"),
        code("text", `
true
-30000`),
        p("The checkout is correct; the voucher screen is the bug. But the real design flaw is that `Wallet` lets anyone write `balance`, so every caller must remember every rule, forever. This lesson is about putting the rules where the data is, and letting the compiler keep everyone else out."),

        h2("3. Classes and constructors"),
        code("kotlin", kt`
class Wallet(val owner: String, initialBalance: Long = 0) {
    var balance: Long = initialBalance
        private set

    val isEmpty: Boolean
        get() = balance == 0L

    init {
        require(initialBalance >= 0) { "initial balance must not be negative: $initialBalance" }
    }

    fun pay(amount: Long): Boolean {
        if (amount <= 0 || amount > balance) return false
        balance -= amount
        return true
    }

    override fun toString() = "Wallet($owner, $balance VND)"
}

fun main() {
    val w = Wallet("Lan", 200_000)
    println(w.pay(180_000))
    println(w.pay(50_000))
    println(w)
    println(w.isEmpty)
    println(runCatching { Wallet("Minh", -5_000) })
}`, "wallet.kt"),
        code("text", `
true
false
Wallet(Lan, 20000 VND)
false
Failure(java.lang.IllegalArgumentException: initial balance must not be negative: -5000)`),
        bullets([
            "**The primary constructor** is in the class header. A parameter with `val` or `var` becomes a property (`owner`); one without is only available while the object is built (`initialBalance`).",
            "**Default arguments** (`initialBalance: Long = 0`) replace most overloaded constructors: `Wallet(\"Lan\")` and `Wallet(\"Lan\", 200_000)` both work.",
            "**`init` blocks** run during construction, in order with the property initializers. `require(condition) { message }` throws `IllegalArgumentException` when the condition is false, so an invalid wallet can never exist.",
            "**`private set`** keeps the getter public and makes the setter private: everyone can read `w.balance`, only code inside `Wallet` can assign it.",
            "**A custom getter** (`get() = balance == 0L`) is computed on every read and stores nothing.",
            "**`override fun toString()`**: every class inherits `toString`, `equals` and `hashCode` from `Any`, and may override them.",
            "**No `new`**: you create an object by calling the class like a function.",
        ]),

        h2("4. Visibility"),
        p("Kotlin has four visibility modifiers. The default is `public`, which is why the original `balance` was open to everyone:"),
        bullets([
            "**`public`** (default): visible everywhere.",
            "**`internal`**: visible in the same **module** (one Gradle module, one Android library). Good for code shared inside a feature but hidden from other teams' modules.",
            "**`protected`**: visible in the class and its subclasses.",
            "**`private`**: visible inside the class (for a member) or inside the file (for a top-level declaration).",
        ]),
        code("kotlin", `
class Wallet(initialBalance: Long) {
    var balance: Long = initialBalance
        private set
    private val history = mutableListOf<Long>()
}

class Voucher(code: String)
class Promo : Voucher("X")

fun main() {
    val w = Wallet(100)
    w.balance = 5_000_000
    println(w.history)
    val v = Voucher("TET2026")
    println(v.code)
}`),
        code("text", `
error: this type is final, so it cannot be extended.
error: cannot access 'balance': it is private in 'Wallet'.
error: cannot access 'val history: MutableList<Long>': it is private in 'Wallet'.
error: unresolved reference 'code'.`),
        p("Four errors, four lessons. The setter and `history` are private. `code` is a constructor parameter without `val`, so it is not a property at all. And classes in Kotlin are **final by default**: nobody can extend `Voucher` unless it is declared `open`. Kotlin chose that default on purpose; a class that was not designed for inheritance should not be inherited from."),
        image("wallet-boundary", {
            alt: "Two parts. Part 1, who may change the balance: a class Wallet box holds var balance with private set, fun pay(amount) which checks amount > 0 and <= balance, and fun topUp(amount) which checks the top-up and balance caps. A green arrow from the checkout screen calling wallet.pay(total) reaches pay. A dashed red arrow from the voucher screen writing wallet.balance -= 50000 is stopped with the error: cannot access 'balance': it is private in 'Wallet'. Reading wallet.balance is still public; writing it is only possible inside Wallet. Part 2, what the checkout depends on: checkout(method, total) points to interface PaymentMethod with val label: String and fun charge(amount: Long): Boolean, implemented by CashOnDelivery (up to 2,000,000 per order), WalletPayment (calls wallet.pay) and CardPayment (limitLeft with a private set). A new method such as a QR bank transfer is one more class, and checkout() does not change.",
            caption: "private set moves the rule into the wallet. An interface lets the checkout use any payment method without knowing its rules.",
        }),

        h2("5. Interfaces"),
        p("The checkout should not care whether the customer pays cash, from the wallet or by card. It needs one thing: \"charge this amount, and tell me if it worked\". That is an **interface**: a contract of properties and functions, without the data behind them."),
        code("kotlin", kt`
interface PaymentMethod {
    val label: String
    fun charge(amount: Long): Boolean
    fun receipt(amount: Long): String = "Paid $amount VND by $label"
}

class CashOnDelivery : PaymentMethod {
    override val label = "cash"
    override fun charge(amount: Long) = amount in 1..2_000_000L
    override fun receipt(amount: Long) = "Pay $amount VND to the driver"
}

class CardPayment(private val last4: String) : PaymentMethod {
    override val label get() = "card *$last4"
    override fun charge(amount: Long) = amount > 0
}

fun checkout(method: PaymentMethod, total: Long): String =
    if (method.charge(total)) method.receipt(total) else "Declined: #{method.label}"

fun main() {
    val methods: List<PaymentMethod> = listOf(CashOnDelivery(), CardPayment("4821"))
    for (m in methods) println(checkout(m, 245_000))
    println(checkout(CashOnDelivery(), 3_500_000))
}`, "payments.kt"),
        code("text", `
Pay 245000 VND to the driver
Paid 245000 VND by card *4821
Declined: cash`),
        bullets([
            "**`class CashOnDelivery : PaymentMethod`** implements the interface. Every abstract member must be implemented, each with `override`.",
            "**Interface properties** (`val label`) can be implemented with a value or with a getter.",
            "**Default methods** (`receipt`) have a body in the interface; implementations may override them, like `CashOnDelivery` does.",
            "**A class can implement several interfaces**, but extend only one class.",
            "**`checkout` depends only on the interface.** A new payment method is a new class; `checkout` and its tests stay the same.",
        ]),

        h2("6. Abstract classes, open classes and objects"),
        p("When implementations share **state** (properties with values), an abstract class fits better than an interface:"),
        code("kotlin", kt`
abstract class Promotion(val code: String) {
    abstract fun discount(subtotal: Long): Long
    open fun describe() = "Code $code"
}

class PercentOff(code: String, private val percent: Int) : Promotion(code) {
    override fun discount(subtotal: Long) = subtotal * percent / 100
    override fun describe() = super.describe() + ": $percent% off"
}

object FreeShipping : Promotion("FREESHIP") {
    override fun discount(subtotal: Long) = 0L
}

fun main() {
    val promos = listOf(PercentOff("TET10", 10), FreeShipping)
    for (p in promos) println("#{p.describe()} -> #{p.discount(245_000)}")
}`, "promos.kt"),
        code("text", `
Code TET10: 10% off -> 24500
Code FREESHIP -> 0`),
        bullets([
            "**`abstract class`** cannot be created directly and may have abstract members without a body. Subclasses call its constructor: `: Promotion(code)`.",
            "**`open`** marks a function (or class) that subclasses may override; `describe` is open, `code` is not. `super.describe()` calls the parent's version.",
            "**`object`** declares a class with exactly one instance, created on first use. `FreeShipping` needs no parameters, so one shared instance is enough.",
            "**Prefer interfaces** for contracts like `PaymentMethod`, sealed types for closed families (lesson 3), and abstract classes only when the shared state is real.",
        ]),
        callout("tip", "Make illegal states unrepresentable",
            "Each technique in this lesson removes a way to get things wrong: require in init rejects an invalid wallet at construction, private set removes unchecked writes, an interface removes the temptation to reach into a specific payment class. The fewer wrong programs the compiler accepts, the fewer reach production."),

        h2("7. The fix"),
        code("kotlin", `
class Wallet(initialBalance: Long = 0) {
    var balance: Long = initialBalance
        private set

    fun topUp(amount: Long): Boolean {
        if (amount <= 0) return false
        balance += amount
        return true
    }

    fun pay(amount: Long): Boolean {
        if (amount <= 0 || amount > balance) return false
        balance -= amount
        return true
    }
}

fun payOrder(w: Wallet, total: Long): Boolean = w.pay(total)

fun buyVoucher(w: Wallet, price: Long): Boolean = w.pay(price)

fun main() {
    val w = Wallet()
    w.topUp(200_000)
    println(payOrder(w, 180_000))
    println(buyVoucher(w, 50_000))
    println(w.balance)
}`, "wallet.kt"),
        code("text", `
true
false
20000`),
        numbered([
            "**`private set`** on `balance`: the voucher screen's `w.balance -= price` no longer compiles, so the marketing team had to call `pay`.",
            "**`pay` checks both rules**: the amount is positive, and it is not more than the balance. A negative 'payment' would otherwise be a free top-up.",
            "**`buyVoucher` returns the result**, so the screen can show 'Not enough money in your wallet' instead of selling the voucher.",
            "**Finance** reversed the 640 negative balances by hand, and the payments team moved `Wallet` into an `internal` payments module that other teams use only through its public functions.",
        ]),

        h2("8. Your turn"),
        p("Implement the wallet and the three payment methods behind the `PaymentMethod` interface. Every rule must live in the class that owns the money: positive amounts only, top-up and balance caps for the wallet, a limit per cash order, and a card limit that goes down with each charge. The test runner reads `topup`, `pay` and `balance` commands and prints the result of each."),
        challenge("chal_coding_ktf_231", "Write each check at the top of the function and return false before changing anything. Test the edges yourself: zero, a negative amount, exactly the balance, exactly the limit, one more than the limit. WalletPayment should not repeat the wallet's rules; it should call the wallet."),

        h2("9. Pitfalls"),
        bullets([
            "**Public `var` for state with rules**: every caller has to know the rules. Use `private set` and functions that check.",
            "**Checking in the caller, not in the class**: the next caller forgets. Put the check where the data is changed.",
            "**Forgetting negative amounts**: `pay(-50_000)` that passes `amount <= balance` is a free top-up.",
            "**A constructor parameter without `val`**: it is not a property, and `v.code` does not compile. Add `val` if callers need it, leave it out if they must not.",
            "**`open` everything**: classes are final for a reason. Open only what was designed to be overridden.",
            "**Abstract class for a pure contract**: a class can only extend one class. Use an interface unless you share state.",
        ]),

        h2("10. Checklist"),
        bullets([
            "Every invariant (a balance never below zero, a limit never exceeded) is enforced inside the class that holds the data.",
            "Mutable properties have `private set` unless callers truly need to assign them.",
            "Constructors reject invalid values with `require`.",
            "Callers depend on interfaces; implementations are swappable and testable on their own.",
            "Visibility is as narrow as possible: `private` first, `internal` for module-wide helpers, `public` for the real API.",
        ]),
        p("Next lesson: collections. The cart showed the right items, but the 'undo' history and the screen disagreed, because a read-only list is not an immutable one."),
    ],
});
