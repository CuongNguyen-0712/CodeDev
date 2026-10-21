// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-javaf-1-3",
    title: "Enums & switch expressions",
    slug: { _type: "slug", current: "java-enums-switch-expressions-shipping-fees" },
    description:
        "Mekong Books charged standard orders the express surcharge, charged 30,000 VND for free store pickup and accepted \"EXPRES\" from the admin form, all because shipping methods were plain Strings in an old switch statement. Learn enums (fields, constructors, values(), valueOf, name() vs toString(), why not ordinal()), why a missing break falls through, and how switch expressions with arrows, several labels, yield and exhaustiveness checks turn these bugs into compile errors.",
    estimatedTime: 22,

    scenario: {
        role: "Junior backend developer, Mekong Books checkout team",
        problem:
            "Shipping fees are computed from String constants in an old switch statement. Customers who chose standard delivery were charged the express surcharge, the new free store pickup option costs 30,000 VND, and an admin who typed \"EXPRES\" in the back office created orders that nobody noticed were wrong. No exception, no log line, just wrong totals.",
    },

    content: [
        h2("1. The incident at Mekong Books: free pickup that costs 30,000"),
        p("Mekong Books offers home delivery in two speeds, **standard** and **express**. Home delivery costs a base fee of 30,000 VND, express adds a 25,000 VND surcharge, and standard delivery is free for orders of 500,000 VND or more. In March the team added **store pickup**: the customer collects the books in a shop, so it is free. This is the code that computes the fee:"),
        code("java", `
public class OrderService {
    static final String STANDARD = "STANDARD";
    static final String EXPRESS = "EXPRESS";
    static final String PICKUP = "PICKUP";      // added in March: store pickup, free

    static long shippingFee(String method, long subtotal) {
        long fee = 30_000;                      // base fee for home delivery
        switch (method) {
            case STANDARD:
                if (subtotal >= 500_000) {
                    fee = 0;                    // free standard shipping from 500,000 VND
                }
            case EXPRESS:
                fee += 25_000;                  // express surcharge
                break;
            default:
                break;
        }
        return fee;
    }
}`, "OrderService.java"),
        p("It compiles, it passed review, and the express orders looked right. Three weeks later the support team had three kinds of complaints: standard orders charged like express, \"free\" store pickups charged 30,000 VND, and a batch of orders entered by hand in the back office with the method `EXPRES` that went out with the wrong fee."),

        h2("2. Reproduce it"),
        p("Call the method with each case from the complaints:"),
        code("java", `
public class Main {
    public static void main(String[] args) {
        System.out.println("STANDARD 200000 -> " + OrderService.shippingFee("STANDARD", 200_000));
        System.out.println("STANDARD 650000 -> " + OrderService.shippingFee("STANDARD", 650_000));
        System.out.println("EXPRESS  200000 -> " + OrderService.shippingFee("EXPRESS", 200_000));
        System.out.println("PICKUP   200000 -> " + OrderService.shippingFee("PICKUP", 200_000));
        System.out.println("EXPRES   200000 -> " + OrderService.shippingFee("EXPRES", 200_000));
    }
}

// STANDARD 200000 -> 55000     expected 30000
// STANDARD 650000 -> 25000     expected 0
// EXPRESS  200000 -> 55000     correct
// PICKUP   200000 -> 30000     expected 0
// EXPRES   200000 -> 30000     should have been rejected`, "Main.java"),
        p("Three separate bugs hide in 15 lines:"),
        bullets([
            "**Fall-through.** The `STANDARD` case has no `break`. In an old switch statement, execution does not stop at the next `case` label: it simply runs on into the `EXPRESS` code and adds the surcharge. A standard order of 200,000 VND pays 30,000 + 25,000 = 55,000, and a free-shipping order pays 0 + 25,000.",
            "**A new value nobody handled.** `PICKUP` got a constant and a button in the checkout page, but nobody added a `case` for it. It lands in `default`, which does nothing, so the customer pays the 30,000 base fee for collecting the books themselves.",
            "**Any text is accepted.** `method` is a `String`, so `\"EXPRES\"`, `\"express\"` or `\"\"` are all valid arguments. A switch on a String compares with `equals`, nothing matches, and `default` quietly returns 30,000.",
        ]),
        p("`javac Main.java` compiles all of this without a single message. Only the optional lint check notices the first bug:"),
        code("text", `
$ javac -Xlint:fallthrough Main.java OrderService.java
OrderService.java:13: warning: [fallthrough] possible fall-through into case
            case EXPRESS:
            ^
1 warning`),
        p("The other two bugs come from the type: a `String` can hold any text, and the compiler has no idea which texts are shipping methods. Java has a type for exactly this job."),

        h2("3. Enums: a type with a fixed list of values"),
        p("An **enum** (enumeration) declares a type together with the complete list of its values. Each value is called an **enum constant**:"),
        code("java", `
import java.util.Arrays;

public class Main {
    enum ShippingMethod { STANDARD, EXPRESS, PICKUP }

    public static void main(String[] args) {
        ShippingMethod m = ShippingMethod.EXPRESS;
        System.out.println(m);                                  // EXPRESS
        System.out.println(m == ShippingMethod.EXPRESS);        // true
        System.out.println(Arrays.toString(ShippingMethod.values()));
        // [STANDARD, EXPRESS, PICKUP]
        System.out.println(ShippingMethod.valueOf("PICKUP"));   // PICKUP
        System.out.println(m.name() + " " + m.ordinal());       // EXPRESS 1
        for (String s : new String[] {"EXPRES", "express"}) {
            try {
                ShippingMethod.valueOf(s);
            } catch (IllegalArgumentException e) {
                System.out.println(e);
            }
        }
        // java.lang.IllegalArgumentException: No enum constant Main.ShippingMethod.EXPRES
        // java.lang.IllegalArgumentException: No enum constant Main.ShippingMethod.express
    }
}`, "Main.java"),
        bullets([
            "**Only these three values exist** (plus `null`, like any object reference). A method declared as `shippingFee(ShippingMethod method, long subtotal)` cannot be called with `\"EXPRES\"`: passing a `String` is a compile error, so the typo cannot even reach the fee code.",
            "**`==` is safe for enums.** Each constant is a single object created once, when the enum is loaded, so `m == ShippingMethod.EXPRESS` is the normal way to compare. This is different from Strings read at runtime, where `==` compares objects and you need `equals` (lesson \"Types, strings & text blocks\").",
            "**`values()`** returns a new array of all constants in declaration order. Use it to build a dropdown, or to loop over every method in a report.",
            "**`valueOf(String)`** turns text into a constant. It accepts only the exact constant name: `\"express\"` is not `EXPRESS`. Anything else throws `IllegalArgumentException` with the message `No enum constant` plus the enum's full name and the text, here `Main.ShippingMethod.EXPRES` because the enum is declared inside `Main`. `valueOf(null)` throws `NullPointerException: Name is null`.",
        ]),
        p("So `valueOf` is the door from untrusted text (a form field, a CSV column, a line of input) into the enum. Treat it like any other parse: decide what letter case you accept (normalize with `toUpperCase(Locale.ROOT)` if users may type `express`), and handle the exception for names that do not exist instead of letting one bad line crash a whole batch. A `try` / `catch (IllegalArgumentException e)` around the call is enough for now; the lesson \"Exceptions & try-with-resources\" covers exceptions in depth."),

        h3("Fields, a constructor and methods"),
        p("An enum is a real class. Each constant can carry data passed to a constructor, and the enum can have methods. The constants must come first, followed by a `;`:"),
        code("java", `
public class Main {
    enum ShippingMethod {
        STANDARD("Standard delivery, 3-5 days", 30_000),
        EXPRESS("Express delivery, next day", 55_000),
        PICKUP("Store pickup", 0);

        private final String label;
        private final long baseFee;

        ShippingMethod(String label, long baseFee) {
            this.label = label;
            this.baseFee = baseFee;
        }

        String label() { return label; }
        long baseFee() { return baseFee; }
        boolean isDelivery() { return this != PICKUP; }

        @Override
        public String toString() { return label; }
    }

    public static void main(String[] args) {
        ShippingMethod m = ShippingMethod.EXPRESS;
        System.out.println(m);                    // Express delivery, next day
        System.out.println(m.name());             // EXPRESS
        System.out.println(m.label() + " " + m.baseFee() + " " + m.isDelivery());
        // Express delivery, next day 55000 true
        System.out.println(ShippingMethod.valueOf("EXPRESS").baseFee());   // 55000
    }
}`, "Main.java"),
        bullets([
            "**The constructor is always private** (you may leave out the word). Nobody can create a fourth `ShippingMethod` with `new`.",
            "**`name()` vs `toString()`.** `name()` always returns the constant's name exactly as declared, `\"EXPRESS\"`, and cannot be overridden. `toString()` returns the same text by default, but you may override it for display, as above. `valueOf` works with `name()`, so store and parse names, and show `toString()` or a `label()` to people.",
            "**Data that belongs to one constant goes in a field** (`baseFee`, `label`). Rules that combine several inputs, such as \"standard is free above 500,000 VND\", read better in a switch, which comes next.",
        ]),
        callout("warning", "Do not store ordinal()",
            "ordinal() is the position in the declaration: STANDARD is 0, EXPRESS 1, PICKUP 2. If someone later inserts SAME_DAY before PICKUP, PICKUP becomes 3 and every 2 already saved in the database or a file now means SAME_DAY. Save name() (\"PICKUP\") and read it back with valueOf. The same goes for arrays indexed by ordinal(): use a field or an EnumMap instead."),

        h2("4. The switch statement and fall-through"),
        p("The switch in the incident is a **switch statement** with `case X:` labels, the form Java inherited from C. A label is only an entry point: execution jumps to the matching label and then runs every following line, through other labels, until a `break` or the end of the switch. Running on into the next case is called **fall-through**."),
        bullets([
            "Fall-through is sometimes used on purpose to share code: `case STANDARD: case EXPRESS: fee = 30_000; break;`. That is exactly why the compiler cannot treat a missing `break` as an error.",
            "Plain `javac` says nothing about it. `javac -Xlint:fallthrough` (or `-Xlint:all`) prints the warning you saw above, and most IDEs underline it.",
            "A switch statement does not have to handle every value. If `PICKUP` has no case and there is no `default`, the switch does nothing and `fee` keeps whatever value it had before. With an enum this still compiles without a warning.",
        ]),

        h2("5. Switch expressions: arrows, several labels, yield"),
        p("Since Java 14, `switch` can also be an **expression**: it produces a value that you can return or assign. Arms are written with `->` instead of `:`, and exactly one arm runs:"),
        code("java", `
static String eta(ShippingMethod method, String region) {
    return switch (method) {
        case STANDARD, EXPRESS -> {
            int days = method == ShippingMethod.EXPRESS ? 1 : 3;
            if (!region.equals("HN") && !region.equals("HCM")) {
                days += 2;
            }
            yield days + " day(s)";
        }
        case PICKUP -> "ready in 2 hours";
    };
}

// eta(ShippingMethod.STANDARD, "DN")  -> 5 day(s)
// eta(ShippingMethod.EXPRESS, "HN")   -> 1 day(s)
// eta(ShippingMethod.PICKUP, "HCM")   -> ready in 2 hours`, "Main.java"),
        bullets([
            "**No fall-through.** After `->` comes one expression, one block or one `throw`. When it is done, the switch is done. There is no `break` to forget.",
            "**Several labels in one arm**: `case STANDARD, EXPRESS ->` replaces the deliberate fall-through of the old form, and says so explicitly.",
            "**`yield` gives a block its value.** When an arm needs several statements, put them in `{ }` and end with `yield value;`. `return` inside the block would try to return from the whole method and does not compile there.",
            "**Inside an enum switch, the bare constant name is enough**: `case PICKUP`. The type of the selector tells Java which enum it belongs to.",
            "The whole switch is one expression, so the statement ends with `;` after the closing `}`.",
            "The arrow form also works in a switch **statement** (`case STANDARD -> fee = 30_000;`) and removes fall-through there too, but only the expression form gets the exhaustiveness check below.",
        ]),
        image("fall-through-vs-switch-expression", {
            alt: "Diagram with two panels for method STANDARD and subtotal 200,000 VND, where standard delivery should cost 30,000. Left, red, the old switch statement: execution enters at case STANDARD, runs the free-shipping check, then, because there is no break, runs on into case EXPRESS, adds the 25,000 surcharge and stops at break, so the fee is 55,000. Right, green, the switch expression: only the arm case STANDARD -> subtotal >= FREE ? 0 : BASE runs, the EXPRESS and PICKUP arms are skipped, and the fee is 30,000. Bottom: when a teammate adds SAME_DAY to the enum, the switch statement still compiles and SAME_DAY gets a wrong fee, while a switch expression without a default arm fails with error: the switch expression does not cover all possible input values. A default arm turns that check off.",
            caption: "A case label in a switch statement is only an entry point; an arrow arm in a switch expression is the whole answer for that value.",
        }),
        callout("info", "More switch power later",
            "Switch can also match on types and record shapes (case Book b ->, case null ->, guards with when). That is pattern matching for switch, in the lesson \"Sealed interfaces & pattern matching for switch\". This lesson stays with enum constants."),

        h2("6. Exhaustiveness: let the compiler find every switch"),
        p("A switch expression must produce a value for **every** possible input. For an enum, that means a case for every constant or a `default` arm. Suppose a teammate adds same-day delivery to the enum and forgets one of the switches:"),
        code("java", `
public class Main {
    enum ShippingMethod { STANDARD, EXPRESS, PICKUP, SAME_DAY }

    static long fee(ShippingMethod method, long subtotal) {
        return switch (method) {
            case STANDARD -> subtotal >= 500_000 ? 0 : 30_000;
            case EXPRESS -> 55_000;
            case PICKUP -> 0;
        };
    }

    public static void main(String[] args) {
        System.out.println(fee(ShippingMethod.EXPRESS, 1));
    }
}

// $ javac Main.java
// Main.java:5: error: the switch expression does not cover all possible input values
//         return switch (method) {
//                ^
// 1 error`, "Main.java"),
        p("This is the feature that would have saved the PICKUP launch. Adding a constant breaks the build at every switch expression that does not handle it yet, and the error list is your to-do list. Compare the alternatives with the same `SAME_DAY` constant, all of which compile without a message and give `SAME_DAY` whatever fee the code falls back to (the value `fee` already had, or the `default`):"),
        bullets([
            "an old switch statement with `case STANDARD:` / `case EXPRESS:` / `case PICKUP:` and no `default`;",
            "a switch statement with arrows (`case STANDARD -> fee = 30_000;`);",
            "a switch expression that ends with `default -> 0;`.",
        ]),
        p("So for an enum you own, list every constant and **leave out `default`**. Keep `default` for selectors that really are open-ended, like a `String` or an `int`."),
        callout("tip", "null is not a constant",
            "A switch over an enum variable that holds null throws NullPointerException before any arm runs. Turn untrusted text into a constant at the boundary (and reject what fails), so the code with the switch only ever sees real constants."),

        h3("EnumMap: a map keyed by an enum"),
        p("When you need a value per constant that changes at runtime, such as a count or a running total per shipping method, use `EnumMap`. It is a `Map` (lesson \"Choosing List, Set or Map\") that stores its entries in an internal array and always iterates in declaration order:"),
        code("java", `
Map<ShippingMethod, Integer> counts = new EnumMap<>(ShippingMethod.class);
for (ShippingMethod m : List.of(ShippingMethod.PICKUP, ShippingMethod.STANDARD,
                                ShippingMethod.PICKUP, ShippingMethod.EXPRESS)) {
    counts.merge(m, 1, Integer::sum);       // add 1, starting from 1 for a new key
}
System.out.println(counts);                 // {STANDARD=1, EXPRESS=1, PICKUP=2}`, "Main.java"),

        h2("7. Build it: a shipping fee calculator"),
        p("Time to put the pieces together. Orders arrive as text lines like `EXPRESS 3 DN` or `standard 1 HCM`, and some contain a method that does not exist. Parse the method safely into the enum, then compute the fee with a switch expression. The runner prints one line per order and a total."),
        challenge("chal_coding_javaf_131", "Normalize the letter case before valueOf and turn the IllegalArgumentException into a null instead of letting it escape. For the fee, write one switch expression with an arm per constant and no default, and work out the region extra once before the switch, remembering that PICKUP never pays it."),

        h2("8. The fix"),
        p("Replace the Strings with the enum, the switch statement with a switch expression, and reject unknown text where it enters the system:"),
        code("java", `
public enum ShippingMethod { STANDARD, EXPRESS, PICKUP }`, "ShippingMethod.java"),
        code("java", `
public class OrderService {
    static final long BASE_FEE = 30_000;
    static final long EXPRESS_SURCHARGE = 25_000;
    static final long FREE_STANDARD_FROM = 500_000;

    static long shippingFee(ShippingMethod method, long subtotal) {
        return switch (method) {
            case STANDARD -> subtotal >= FREE_STANDARD_FROM ? 0 : BASE_FEE;
            case EXPRESS -> BASE_FEE + EXPRESS_SURCHARGE;
            case PICKUP -> 0;
        };
    }
}`, "OrderService.java"),
        code("java", `
static String checkout(String methodFromForm, long subtotal) {
    ShippingMethod method;
    try {
        method = ShippingMethod.valueOf(methodFromForm);
    } catch (IllegalArgumentException e) {
        return "400 Bad Request: unknown shipping method " + methodFromForm;
    }
    return method + " " + subtotal + " -> " + OrderService.shippingFee(method, subtotal);
}

// checkout("STANDARD", 200_000)  -> STANDARD 200000 -> 30000
// checkout("STANDARD", 650_000)  -> STANDARD 650000 -> 0
// checkout("EXPRESS", 200_000)   -> EXPRESS 200000 -> 55000
// checkout("PICKUP", 200_000)    -> PICKUP 200000 -> 0
// checkout("EXPRES", 200_000)    -> 400 Bad Request: unknown shipping method EXPRES`, "CheckoutController.java"),
        numbered([
            "**The type does the checking.** `shippingFee` takes a `ShippingMethod`, so a typo can no longer reach it. The admin form builds its dropdown from `ShippingMethod.values()`, and the one place that turns text into the enum rejects anything else with a clear error.",
            "**One arm per method.** Each arm is the complete rule for that method, so standard orders cannot pick up the express surcharge, and free shipping really is 0.",
            "**No `default`.** The next time someone adds `SAME_DAY`, `OrderService` stops compiling until somebody decides what same-day delivery costs.",
            "**The numbers have names.** `BASE_FEE`, `EXPRESS_SURCHARGE` and `FREE_STANDARD_FROM` are `long` constants in VND, so changing a price is a one-line change.",
        ]),

        h2("9. Pitfalls"),
        bullets([
            "**A missing `break` in a `case X:` switch falls through.** Plain `javac` does not warn; compile with `-Xlint:all` and prefer arrow arms.",
            "**`default` in a switch over your own enum hides new constants.** The code compiles and the new value gets whatever `default` returns.",
            "**`valueOf` is exact and strict.** `valueOf(\"express\")` and `valueOf(\"EXPRES\")` throw `IllegalArgumentException`, `valueOf(null)` throws `NullPointerException`. Normalize the case first, and catch the exception at the boundary.",
            "**`toString()` can be overridden, `name()` cannot.** Never parse or store `toString()`; it may be a display label.",
            "**`ordinal()` changes when constants are reordered or inserted.** Do not save it, send it or use it as an array index.",
            "**A switch on a `null` enum throws `NullPointerException`.** Keep `null` out with checks at the boundary (more in \"Optional & null safety\").",
            "**`return` inside an arm block does not compile in a switch expression.** Use `yield` to give the block its value.",
        ]),

        h2("10. Checklist"),
        bullets([
            "A fixed set of values (shipping methods, order statuses, payment types) is an `enum`, not a set of `String` or `int` constants.",
            "Text from outside is converted with `valueOf` in one place, with the case normalized and `IllegalArgumentException` handled; the rest of the code only sees constants.",
            "Enum constants are compared with `==` or in a switch, never by `toString()`.",
            "Per-constant data lives in fields set by the enum constructor; values that change at runtime live in an `EnumMap`.",
            "Names are stored and exchanged with `name()`, never `ordinal()`.",
            "Switches over an enum are switch expressions with `->` arms, one per constant, several labels where they share a rule, `yield` in block arms, and no `default`.",
            "The project compiles with `-Xlint:all`, and adding a constant is followed by fixing every compile error it causes.",
        ]),
    ],
});
