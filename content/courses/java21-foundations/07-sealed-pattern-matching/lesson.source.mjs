// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-javaf-3-1",
    title: "Sealed interfaces & pattern matching for switch",
    slug: { _type: "slug", current: "java-sealed-interfaces-pattern-matching-switch" },
    description:
        "Mekong Books added MoMo/ZaloPay e-wallets and gift cards to checkout, and the settlement report quietly recorded a 0 VND fee for every e-wallet payment while gift-card refunds went to the card gateway. Learn instanceof patterns, sealed interfaces with records, and pattern matching for switch - exhaustiveness without default, record deconstruction, when guards, case order and dominance, and case null - so the compiler finds every place a new payment type must be handled.",
    estimatedTime: 22,

    scenario: {
        role: "Junior backend developer, Mekong Books payments and settlement",
        problem:
            "The settlement report computes the fee each payment provider charges Mekong Books with an instanceof chain that ends in else return 0. When the team added e-wallets and gift cards, nothing failed: e-wallet payments got a 0 VND fee for six weeks, and gift-card refunds were routed to the card gateway. Finance found 19,260,000 VND of fees missing from the report.",
    },

    content: [
        h2("1. The incident at Mekong Books"),
        p("Every night Mekong Books builds a settlement report: each payment of the day, the **processing fee** the provider keeps (the card network, the bank, the wallet), and the money that actually reaches the company's account. Finance compares it with the providers' invoices. For two years there were two ways to pay, so the code had two branches:"),
        code("java", `
interface Payment {}

record Card(String last4, long amount) implements Payment {}
record BankTransfer(String bank, long amount) implements Payment {}
// added in March for MoMo / ZaloPay, and in April for gift cards
record EWallet(String provider, long amount) implements Payment {}
record GiftCard(String code, long amount) implements Payment {}

class SettlementReport {
    // Processing fee the provider charges Mekong Books, in VND.
    static long fee(Payment p) {
        if (p instanceof Card) {
            Card c = (Card) p;
            return c.amount() * 2 / 100;                      // 2%
        } else if (p instanceof BankTransfer) {
            BankTransfer b = (BankTransfer) p;
            return b.amount() >= 1_000_000 ? 0 : 5_500;       // free from 1,000,000
        } else {
            return 0;
        }
    }

    static String refundRoute(Payment p) {
        if (p instanceof BankTransfer) {
            return "bank transfer";
        } else {
            return "card gateway";
        }
    }
}`, "SettlementReport.java"),
        p("In March the checkout team added `EWallet` for MoMo and ZaloPay; in April, Mekong Books gift cards. Both pull requests added a record and the checkout screens. Nobody opened `SettlementReport.java`, and nothing forced them to: the project compiled, every test passed, the report ran every night."),
        p("Six weeks later finance asked why the MoMo and ZaloPay invoices said 19,260,000 VND of fees (1.5% of 1,284,000,000 VND of e-wallet payments) while the report said 0. Around the same time customer support had a queue of gift-card refunds the card gateway had rejected: there is no card behind a gift card, the money should go back to the gift card balance."),

        h2("2. Reproduce it"),
        p("Put the types and `SettlementReport` above in one file with this `Main` class (only one class in a file may be `public`, and it must match the file name):"),
        code("java", `
import java.util.List;

public class Main {
    public static void main(String[] args) {
        List<Payment> today = List.of(
                new Card("4242", 250_000),
                new BankTransfer("VCB", 1_200_000),
                new EWallet("MOMO", 99_000),
                new GiftCard("GC-001", 50_000));
        for (Payment p : today) {
            System.out.println(p + " fee=" + SettlementReport.fee(p)
                    + " refund via " + SettlementReport.refundRoute(p));
        }
    }
}

// Output:
// Card[last4=4242, amount=250000] fee=5000 refund via card gateway
// BankTransfer[bank=VCB, amount=1200000] fee=0 refund via bank transfer
// EWallet[provider=MOMO, amount=99000] fee=0 refund via card gateway
// GiftCard[code=GC-001, amount=50000] fee=0 refund via card gateway`, "Main.java"),
        p("No exception, no warning, even with `javac -Xlint:all`. The `EWallet` should cost 1,485 VND (1.5% of 99,000) and the gift card should be refunded to its balance. Both bugs have the same cause: the `else` branch is a **catch-all for types that did not exist when it was written**. The compiler cannot help, because as far as it knows, `Payment` can have any number of implementations - anyone can write `class Whatever implements Payment`."),
        p("Java 21 gives you the tools to say \"these are **all** the kinds of payment\" and to get a compile error in every place that forgets one. Three pieces: patterns in `instanceof`, sealed interfaces, and pattern matching for `switch`."),

        h2("3. instanceof with a pattern"),
        p("The incident code tests the type and then casts: `if (p instanceof Card) { Card c = (Card) p; ... }`. Since Java 16 you can do both in one step. `p instanceof Card c` is a **type pattern**: if `p` is a `Card`, the test is true and the new variable `c` holds `p` already cast to `Card`:"),
        code("java", `
static String label(Payment p) {
    if (p instanceof Card c && c.amount() >= 5_000_000) {
        return "large card payment *" + c.last4();
    }
    if (p instanceof Card c) {
        return "card *" + c.last4();
    }
    if (!(p instanceof BankTransfer b)) {
        return "other: " + p;
    }
    return "transfer from " + b.bank();
}

// label(new Card("4242", 250_000))          -> card *4242
// label(new Card("4242", 7_500_000))        -> large card payment *4242
// label(new BankTransfer("VCB", 1_200_000)) -> transfer from VCB
// label(null)                               -> other: null`),
        bullets([
            "**The binding exists only where the test is known to be true.** After `&&` you can use `c`; in the `else` branch you cannot. With `!(p instanceof BankTransfer b)` the early `return` means `b` is usable on the lines after the `if`.",
            "**`null` is never an instance of anything.** `null instanceof Card c` is simply `false`, so no `NullPointerException` - `label(null)` reaches the \"other\" branch.",
            "**It removes the cast, not the problem.** An `if` chain with patterns still has an `else` (or a final `return`) that silently accepts every new type. For that you need the next two pieces.",
        ]),

        h2("4. Sealed interfaces: a closed list of types"),
        p("A **sealed** interface lists every type that is allowed to implement it, in a `permits` clause. Nobody else can:"),
        code("java", `
sealed interface Payment permits Card, BankTransfer, EWallet {}

record Card(String last4, long amount) implements Payment {}
record BankTransfer(String bank, long amount) implements Payment {}
record EWallet(String provider, long amount) implements Payment {}
record CashOnDelivery(long amount) implements Payment {}

public class Main { public static void main(String[] a) {} }

// javac:
// Main.java:6: error: class is not allowed to extend sealed class: Payment (as it is not listed in its 'permits' clause)
// record CashOnDelivery(long amount) implements Payment {}
// ^
// 1 error`, "Main.java"),
        p("The message says \"class\" and \"extend\" even for an interface and a record; it is the same rule for sealed classes. Adding a payment type is now a deliberate act: you must edit the `permits` list, and (as you will see in section 5) that edit breaks the build everywhere the new type is not handled yet."),
        bullets([
            "**Records fit perfectly.** A record (lesson \"Classes, records & equals/hashCode\") is implicitly `final`: nobody can extend `Card`, so the list of types really is closed.",
            "**Every permitted subtype must say how it continues the hierarchy:** `final` (no subtypes, records are this automatically), `sealed` (its own closed list) or `non-sealed` (open again). A plain `class Voucher implements Payment {}` is rejected with `error: sealed, non-sealed or final modifiers expected`.",
            "**Where the types live.** The permitted types must be in the same package as the sealed interface (in a project that uses Java modules: the same module). If they are all in the same file, you may leave out `permits` and the compiler takes the types declared in that file.",
            "**Data is per type.** `Card` carries `last4`, `BankTransfer` carries `bank`, `EWallet` carries `provider`. That is the difference from an enum.",
        ]),
        callout("info", "Enum or sealed interface?",
            "In \"Enums & switch expressions\" you met enums: a fixed set of values, such as the order statuses PAID or SHIPPED, all with the same fields. A sealed interface is a fixed set of types, and each type has its own fields. A switch over either one can be checked for completeness by the compiler; use an enum when the cases differ only by name and constants, a sealed interface when they carry different data."),

        h2("5. Pattern matching for switch"),
        p("A `switch` in Java 21 can take any object and use patterns as case labels. Over a sealed type, the compiler knows the full list of subtypes, so a switch that covers all of them is **exhaustive** and needs no `default`:"),
        code("java", `
static long fee(Payment p) {
    return switch (p) {
        case Card c -> c.amount() * 2 / 100;
        case BankTransfer b -> b.amount() >= 1_000_000 ? 0 : 5_500;
        case GiftCard g -> 0;
    };
}

static void printRoute(Payment p) {
    switch (p) {
        case Card c -> System.out.println("card gateway");
        case BankTransfer b -> System.out.println("bank transfer");
    }
}

// javac, with these methods in Main.java below Payment permits Card, BankTransfer, EWallet, GiftCard:
// Main.java:9: error: the switch expression does not cover all possible input values
//         return switch (p) {
//                ^
// Main.java:17: error: the switch statement does not cover all possible input values
//         switch (p) {
//         ^
// 2 errors`),
        p("This is the whole point. The `EWallet` is missing from `fee`, and the build fails until you decide what its fee is. A switch **statement** (one that does not produce a value) over a pattern must be exhaustive too, so `printRoute` is caught as well. Compare the incident: the `else` branch made the same mistake compile."),
        callout("warning", "default switches the check off",
            "If you add default -> 0 to a switch over a sealed type, it compiles today and it will compile when the next type is added - straight back to the incident. Over a sealed type, list the types and leave default out."),
        h3("Record patterns: take the fields out"),
        p("A **record pattern** matches a record and **deconstructs** it: it binds each component to a variable, in the order the record declares them. You write the component types (or `var`) and new names:"),
        code("java", `
static String describe(Payment p) {
    return switch (p) {
        case Card(String last4, long amount) -> "card *" + last4 + ", " + amount + " VND";
        case BankTransfer(String bank, long amount) -> "transfer from " + bank;
        case EWallet(String provider, long amount) -> provider + " wallet";
        case GiftCard(String code, long amount) -> "gift card " + code;
    };
}

// describe(new Card("4242", 250_000))    -> card *4242, 250000 VND
// describe(new EWallet("ZALOPAY", 99_000)) -> ZALOPAY wallet`),
        p("Patterns **nest**: a component can itself be matched by a pattern. An order holds a payment, and one case can look inside both:"),
        code("java", `
record Order(String id, Payment payment) {}

static String review(Order order) {
    return switch (order) {
        case Order(String id, Card(String last4, long amount)) when amount >= 5_000_000 ->
                id + ": call the customer before shipping";
        case Order(String id, GiftCard(String code, long amount)) ->
                id + ": check gift card " + code + " is not used twice";
        case Order(String id, Payment p) -> id + ": ok";
    };
}

// MB-1001 paid by Card("4242", 7_500_000)  -> MB-1001: call the customer before shipping
// MB-1002 paid by Card("4242", 250_000)    -> MB-1002: ok
// MB-1003 paid by GiftCard("GC-001", 50_000) -> MB-1003: check gift card GC-001 is not used twice`),
        h3("Guards with when"),
        p("A pattern checks the **type and shape**. For a condition on the values, add a **guard**: `case <pattern> when <boolean expression> ->`. The pattern is tried first and its variables are bound; then the guard decides. If the guard is `false`, matching continues with the next case, exactly like the `review` method above: a 250,000 VND card order skips the first case and lands in `Order(String id, Payment p)`."),
        code("java", `
static String speed(EWallet w) {
    return switch (w) {
        case EWallet(String provider, long amount) when provider.equals("MOMO") && amount < 100_000 -> "instant";
        case EWallet(String provider, long amount) when amount < 100_000 -> "fast";
        case EWallet w2 -> "manual check";
    };
}

// speed(new EWallet("MOMO", 99_000))    -> instant
// speed(new EWallet("ZALOPAY", 99_000)) -> fast
// speed(new EWallet("MOMO", 990_000))   -> manual check`),
        p("Compare strings with `.equals`, never `==` (lesson \"Types, strings & text blocks\"): a provider name read from input is a different `String` object from the literal `\"MOMO\"`. And a guarded case never counts towards exhaustiveness - the compiler cannot know when a guard is true - so you still need an unguarded case (`EWallet w2` here) to catch the rest."),
        image("sealed-switch-exhaustive", {
            alt: "Diagram. Left: sealed interface Payment permits four records, drawn as a tree: record Card(String last4, long amount), record BankTransfer(String bank, ...), record EWallet(String provider, ...) and record GiftCard(String code, ...). Arrows lead from each record to the arms of a switch on the right: return switch (p) with five numbered arms tried top to bottom - 1 case Card c when c.amount() >= 5_000_000, 2 case Card c, 3 case BankTransfer b, 4 case EWallet w, 5 case GiftCard g - with the note tried top to bottom, first match wins, no default. Card feeds arms 1 and 2, every other record feeds one arm. Bottom left, a note: enum is a fixed set of values (PAID, SHIPPED); sealed is a fixed set of types, each with its own fields. Bottom middle, red: remove arm 5 (GiftCard) and javac stops the build with the switch expression does not cover all possible input values. Bottom right, amber: swap arms 1 and 2 and javac stops the build with this case label is dominated by a preceding case label.",
            caption: "Every permitted type must reach an arm, and an arm must not be hidden behind a more general one above it - javac checks both.",
        }),

        h2("6. Case order, dominance and null"),
        p("A switch with patterns tries its cases **from top to bottom**, and the first case that matches (pattern and guard) wins. That makes order matter, and the compiler catches the most obvious mistake: a case that can never be reached because a case above it matches everything it would match. Such a case is **dominated**:"),
        code("java", `
static long fee(Payment p) {
    return switch (p) {
        case Card c -> c.amount() * 2 / 100;
        case Card c when c.amount() >= 5_000_000 -> c.amount() / 100;
        case GiftCard g -> 0;
    };
}

// javac:
// Main.java:9: error: this case label is dominated by a preceding case label
//             case Card c when c.amount() >= 5_000_000 -> c.amount() / 100;
//                  ^
// 1 error`),
        p("`case Card c` already takes every card, so the 1% rate for large payments could never apply. The same error appears for `case Payment x` above `case Card c`. The rule of thumb: **specific before general, guarded before unguarded**."),
        p("The compiler does **not** compare two guards. It cannot tell that one condition includes another, so this compiles, and the second case is dead code:"),
        code("java", `
static String tier(Card c) {
    return switch (c) {
        case Card(String last4, long amount) when amount < 1_000_000 -> "normal";
        case Card(String last4, long amount) when amount < 100_000 -> "small";   // never reached
        case Card x -> "large";
    };
}`),
        p("Every amount below 100,000 is also below 1,000,000, so the first guard wins. When you write tiers as guards, order them so that the **narrower range comes first** (`< 100_000` before `< 1_000_000`), and test the boundaries."),
        h3("null"),
        p("A switch over a reference has always thrown `NullPointerException` when the value is `null`, and a pattern switch keeps that rule unless you add a `case null`:"),
        code("java", `
public class Main {
    sealed interface Payment permits Card, GiftCard {}
    record Card(String last4, long amount) implements Payment {}
    record GiftCard(String code, long amount) implements Payment {}

    static String safeLabel(Payment p) {
        return switch (p) {
            case null -> "no payment yet";
            case Card c -> "card *" + c.last4();
            case GiftCard g -> "gift card " + g.code();
        };
    }

    static String label(Payment p) {
        return switch (p) {
            case Card c -> "card *" + c.last4();
            case GiftCard g -> "gift card " + g.code();
        };
    }

    public static void main(String[] args) {
        System.out.println(safeLabel(null));
        System.out.println(label(null));
    }
}

// Output:
// no payment yet
// Exception in thread "main" java.lang.NullPointerException
// 	at java.base/java.util.Objects.requireNonNull(Objects.java:233)
// 	at Main.label(Main.java:15)
// 	at Main.main(Main.java:23)`, "Main.java"),
        bullets([
            "**Without `case null`** the switch throws immediately, before any case is tried - even an exhaustive one. Line 15 is the `switch` itself.",
            "**`case null`** handles it like any other case. You can combine it with default as `case null, default ->`.",
            "**Usually you want the exception.** A payment that is `null` is a bug upstream; failing fast is better than inventing a label. Add `case null` only when \"no value\" is a real, expected state (lesson \"Optional & null safety\" goes further).",
        ]),
        p("Check that you can predict what a switch with guards returns and which switch bodies compile:"),
        challenge("chal_quiz_javaf_311", "Walk each value through the cases from top to bottom: the first case whose pattern matches and whose guard is true wins. For the compile question, ask two things of each body: is every permitted type covered (or is there a default), and is any case unreachable because an earlier one already matches everything it would?"),

        h2("7. Build it: the settlement fee calculator"),
        p("Finance has a new fee schedule for 2026, with a minimum card fee, tiered bank transfers and a ZaloPay promotion. Replace last year's `instanceof` chain with a switch over the sealed `Payment`: record patterns to take the amounts out, `when` guards for the tiers, no `default`. Keep everything in `long` and **multiply before you divide**: integer division throws away the remainder, so `250_050 * 2 / 100` is 5,001 but `250_050 / 100 * 2` is 5,000."),
        challenge("chal_coding_javaf_312", "Write one case per record type, and for the types with several rules several cases with guards, the narrowest guard first and an unguarded case last for that type. The card minimum is a Math.max, not a guard. Run the visible tests and check the boundary amounts (exactly 500,000 and 1,000,000) by hand."),

        h2("8. The fix"),
        p("Seal `Payment`, and turn both methods into switches over it. No `else`, no `default`:"),
        code("java", `
sealed interface Payment permits Card, BankTransfer, EWallet, GiftCard {}

record Card(String last4, long amount) implements Payment {}
record BankTransfer(String bank, long amount) implements Payment {}
record EWallet(String provider, long amount) implements Payment {}
record GiftCard(String code, long amount) implements Payment {}

public class SettlementReport {
    // Processing fee the provider charges Mekong Books, in VND.
    static long fee(Payment p) {
        return switch (p) {
            case Card c -> c.amount() * 2 / 100;                           // 2%
            case BankTransfer b -> b.amount() >= 1_000_000 ? 0 : 5_500;    // free from 1,000,000
            case EWallet w -> w.amount() * 15 / 1000;                      // 1.5%
            case GiftCard g -> 0;                                          // our own money
        };
    }

    static String refundRoute(Payment p) {
        return switch (p) {
            case Card(String last4, long amount) -> "card gateway, card *" + last4;
            case BankTransfer(String bank, long amount) -> "bank transfer to " + bank;
            case EWallet(String provider, long amount) -> provider + " wallet";
            case GiftCard(String code, long amount) -> "gift card balance " + code;
        };
    }
}`, "SettlementReport.java"),
        p("The reproduction from section 2 now prints:"),
        code("text", `
Card[last4=4242, amount=250000] fee=5000 refund via card gateway, card *4242
BankTransfer[bank=VCB, amount=1200000] fee=0 refund via bank transfer to VCB
EWallet[provider=MOMO, amount=99000] fee=1485 refund via MOMO wallet
GiftCard[code=GC-001, amount=50000] fee=0 refund via gift card balance GC-001`),
        p("The real gain shows up next time. Suppose the checkout team adds cash on delivery: they write `record CashOnDelivery(long amount) implements Payment {}` and add `CashOnDelivery` to the `permits` list. The build stops and points at every method that has to decide what to do with it:"),
        code("text", `
SettlementReport.java:11: error: the switch expression does not cover all possible input values
        return switch (p) {
               ^
SettlementReport.java:20: error: the switch expression does not cover all possible input values
        return switch (p) {
               ^
2 errors`),
        numbered([
            "**`sealed ... permits`** makes the list of payment types closed and explicit; a new type cannot appear without editing it.",
            "**Records** are final, so the list stays closed below them too, and their components are what the record patterns deconstruct.",
            "**Exhaustive switches without `default`** turn \"we forgot a type\" from a silent 0 VND fee into a compile error with a file name and a line number.",
            "**Record patterns in `refundRoute`** use the data each type carries (`last4`, `bank`, `provider`, `code`) instead of casts.",
        ]),

        h2("9. Pitfalls"),
        bullets([
            "**`default` (or a final `else`) over a sealed type** compiles now and hides every type added later. List the types instead.",
            "**A guarded case does not count for exhaustiveness.** `case Card c when c.amount() > 0` alone does not cover `Card`; add an unguarded `case Card c` after it.",
            "**Overlapping guards are not checked.** `when amount < 1_000_000` above `when amount < 500_000` compiles and makes the second case dead. Narrowest range first, and test the boundaries.",
            "**General before specific does not compile.** `case Card c` before `case Card c when ...`, or `case Payment x` before `case Card c`: `this case label is dominated by a preceding case label`.",
            "**A switch on `null` throws `NullPointerException`** unless it has `case null`, even when it is exhaustive.",
            "**Record pattern components follow the declaration order,** not names: `case Card(String last4, long amount)` must list `String` then `long`. The names you choose are new variables.",
            "**`_` for unused components is a preview feature in Java 21** (`unnamed variables are a preview feature and are disabled by default`). Give unused components a name, or use a type pattern such as `case GiftCard g`.",
            "**Integer division rounds toward zero at every step.** Multiply first: `amount * 15 / 1000`, not `amount / 1000 * 15`.",
        ]),

        h2("10. Checklist"),
        bullets([
            "A type with a fixed set of variants is a `sealed interface ... permits ...` with one `record` per variant.",
            "Code that branches on the variant uses a `switch` over the sealed type, with one case per type and no `default`.",
            "Old `if (p instanceof X) { X x = (X) p; ... }` code uses `p instanceof X x` at least, and becomes a switch when it is a chain.",
            "Record patterns take out the fields a case needs; nested patterns reach inside wrapped records such as an order's payment.",
            "Guards (`when`) come before the unguarded case for the same type, narrowest condition first.",
            "`null` is either rejected on purpose (the default `NullPointerException`) or handled with an explicit `case null`.",
            "Money stays in `long`, and percentages multiply before they divide.",
            "Adding a variant to `permits` is followed by a build: every compile error is a place that needs a decision.",
        ]),
    ],
});
