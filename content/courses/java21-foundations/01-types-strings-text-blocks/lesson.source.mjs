// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-javaf-1-1",
    title: "Types, strings & text blocks",
    slug: { _type: "slug", current: "java-types-strings-text-blocks" },
    description:
        "Mekong Books shipped a checkout release whose unit test was green, yet in production the BOOK10 coupon never applied, a school's bulk order printed a negative invoice, and the 10% discount was always 0 VND. Learn how a Java 21 program runs, primitive and reference types, var, integer division and overflow, why money lives in a long, why == is wrong for strings, the String methods that clean up input, String.format with Locale.ROOT, and text blocks for email templates.",
    estimatedTime: 22,

    scenario: {
        role: "Junior backend developer, Mekong Books checkout team",
        problem:
            "The new checkout applies the coupon BOOK10 for 10% off. Its unit test passes. In production, customers who type BOOK10 pay full price, a secondary school that ordered 25,000 copies of a 120,000 VND textbook receives an invoice of -1,294,967,296 VND, and when a teammate patches the coupon check, the discount is still 0 VND.",
    },

    content: [
        h2("1. The incident: a coupon that only works in tests"),
        p("Mekong Books sells books online across Vietnam. For the back-to-school season the checkout team added a coupon: customers who type `BOOK10` get 10% off. Prices are whole Vietnamese dong (VND), so a 120,000 VND book is stored as the number `120000`. This is the code that shipped:"),
        code("java", `
public class OrderService {
    static final String BOOK10 = "BOOK10";

    // Percent off for the coupon the customer typed at checkout.
    static int discountPercent(String couponCode) {
        if (couponCode == BOOK10) {
            return 10;
        }
        return 0;
    }

    // Order total in whole dong.
    static int orderTotal(int quantity, int unitPrice, String couponCode) {
        int subtotal = quantity * unitPrice;
        int discount = subtotal * (discountPercent(couponCode) / 100);
        return subtotal - discount;
    }
}`, "OrderService.java"),
        p("The test checked the coupon rule with `discountPercent(\"BOOK10\")` and it returned `10`. Green build, release on Friday. On Monday three things were on the support board:"),
        bullets([
            "**Customers who typed `BOOK10` paid full price.** The web layer reads the code from the request, removes spaces and upper-cases it, so `\" book10 \"` becomes `\"BOOK10\"`. The check still said no.",
            "**A negative invoice.** Trường THCS Lê Quý Đôn ordered 25,000 copies of a 120,000 VND textbook. The invoice said `-1294967296` VND.",
            "**The \"fix\" did not fix it.** A teammate replaced `==` with `equals`. Now the coupon was accepted, but the discount line still said 0 VND.",
        ]),
        p("Three bugs, three basic rules of Java's types. Before reading on, try to spot each one in the code."),

        h2("2. Reproduce it"),
        h3("How a Java 21 program runs"),
        p("Java code lives in **classes**. A program starts in a method with exactly this header, inside a public class whose name matches the file name:"),
        code("java", `
public class Main {
    public static void main(String[] args) {
        System.out.println("Xin chào, Mekong Books");
    }
}`, "Main.java"),
        bullets([
            "**`javac Main.java`** compiles the source into bytecode (`Main.class`). Type errors are reported here, before anything runs.",
            "**`java Main`** starts the Java Virtual Machine (JVM) and runs `Main.main`. It prints `Xin chào, Mekong Books`.",
            "**`java Main.java`** does both in one step for a single-file program (source-file mode). Handy for experiments like the ones in this lesson.",
            "`static` means the method belongs to the class, not to an object, so it can be called without `new`. `String[] args` holds command-line arguments. You will meet objects properly in the lesson **Classes, records & equals/hashCode**.",
        ]),
        h3("The repro"),
        p("Put this file next to `OrderService.java`, compile both with `javac Main.java OrderService.java` and run `java Main`. The coupon from the request is simulated with the same clean-up the web layer does:"),
        code("java", `
public class Main {
    public static void main(String[] args) {
        // In production the code comes from the HTTP request and is cleaned up at runtime:
        String fromRequest = " book10 ".strip().toUpperCase();

        System.out.println("test:       " + OrderService.discountPercent("BOOK10"));
        System.out.println("production: " + OrderService.discountPercent(fromRequest));
        System.out.println("same text?  " + fromRequest.equals("BOOK10"));
        System.out.println("2 books:    " + OrderService.orderTotal(2, 120_000, "BOOK10"));
        System.out.println("school:     " + OrderService.orderTotal(25_000, 120_000, ""));
    }
}

// test:       10
// production: 0
// same text?  true
// 2 books:    240000
// school:     -1294967296`, "Main.java"),
        p("The same text gives `10` in the test and `0` in production. Two books with a 10% coupon cost 240,000 VND instead of 216,000 VND, even when the check passes. And 25,000 x 120,000, which is 3,000,000,000, comes out negative. No exception, no warning from the compiler. To see why, you need to know what kinds of values Java has."),

        h2("3. Primitive types, reference types and var"),
        p("Every variable in Java has a **type** fixed at compile time. There are two families:"),
        bullets([
            "**Primitive types** hold the value directly in the variable. The ones you need now: `int` (32-bit whole number, up to 2,147,483,647), `long` (64-bit whole number, up to about 9.2 x 10^18), `double` (64-bit floating point number), `boolean` (`true` or `false`) and `char` (one character, written in single quotes: `'B'`).",
            "**Reference types** are everything else: `String`, arrays, your own classes. The variable holds a **reference**, an arrow to an object stored elsewhere in memory (the **heap**). Two variables can point to two different objects that happen to contain the same text.",
        ]),
        code("java", `
public class Main {
    public static void main(String[] args) {
        int quantity = 3;                // 32-bit whole number
        long unitPrice = 120_000L;       // 64-bit whole number: money in dong
        double weightKg = 0.45;          // 64-bit floating point: measurements, not money
        boolean giftWrap = true;         // true or false
        char shelf = 'B';                // one character, in single quotes
        String title = "Clean Code";     // a reference type: the variable points to an object

        var subtotal = quantity * unitPrice;  // var: the compiler infers long
        System.out.println(subtotal);                     // 360000
        System.out.println(weightKg * quantity);          // 1.35
        System.out.println(giftWrap + " " + shelf);       // true B
        System.out.println(title.length());               // 10
        System.out.println(Integer.MAX_VALUE);            // 2147483647
        System.out.println(Long.MAX_VALUE);               // 9223372036854775807
    }
}`, "Main.java"),
        bullets([
            "**Underscores in numbers** (`120_000`) are only for reading; the value is 120000. The `L` suffix makes a `long` literal.",
            "**`var`** lets the compiler work out the type from the right-hand side. `subtotal` is still a `long`, fixed forever; `var` is not a dynamic type. Use it when the type is obvious from the line, and write the type when it is not.",
            "**Mixed arithmetic widens**: `int * long` is computed as `long`. `int * int` stays `int`, which is exactly the problem in the next section.",
        ]),

        h2("4. Integer arithmetic: division, overflow and money"),
        h3("Integer division throws away the fraction"),
        p("When both sides of `/` are whole-number types, Java does **integer division**: the result is a whole number and the fraction is dropped (rounded toward zero). `10 / 100` is `0`, so `subtotal * (10 / 100)` is `subtotal * 0`. That is the third bug, and the reason the teammate's `equals` fix still gave 0 VND:"),
        code("java", `
long subtotal = 240_000;
System.out.println(10 / 100);                    // 0
System.out.println(subtotal * (10 / 100));       // 0
System.out.println(subtotal * 10 / 100);         // 24000
System.out.println(299_997L * 10 / 100);         // 29999
System.out.println(subtotal * 10 / 100.0);       // 24000.0`, "Main.java"),
        p("Multiply first, divide last: `subtotal * 10 / 100` keeps every digit until the final division, which then rounds down to whole dong (29,999.7 becomes 29,999). Dividing by `100.0` makes the result a `double`, which you do not want for money."),
        h3("Overflow wraps around silently"),
        p("An `int` has 32 bits. When a result does not fit, Java does not stop: it keeps the low 32 bits and the number **wraps around**, often to a negative value. 25,000 x 120,000 = 3,000,000,000 is above 2,147,483,647, so the school's subtotal became `-1294967296`. Storing the result in a `long` afterwards is too late, because the multiplication itself was done in `int`:"),
        code("java", `
int copies = 25_000;
int price = 120_000;
long wrong = copies * price;
System.out.println(wrong);                       // -1294967296
System.out.println((long) copies * price);       // 3000000000
System.out.println(Integer.MAX_VALUE + 1);       // -2147483648
System.out.println(Math.multiplyExact(copies, price));

// Exception in thread "main" java.lang.ArithmeticException: integer overflow
// 	at java.base/java.lang.Math.multiplyExact(Math.java:992)
// 	at Main.main(Main.java:16)`, "Main.java"),
        bullets([
            "**`(long) copies * price`** casts one operand to `long` first, so the multiplication is done in 64 bits. The cast binds tighter than `*`.",
            "**`Math.multiplyExact`** (and `addExact`, `subtractExact`) throw `ArithmeticException` instead of wrapping. With two `int` arguments it checks the `int` range; with a `long` argument it checks the `long` range. A crash with a clear message is much better than a negative invoice.",
            "**Keep money in `long`.** A `long` holds about 9.2 quintillion dong; no bookstore order gets near it.",
        ]),
        h3("Why not double for money"),
        p("A `double` stores numbers in binary, and most decimal fractions such as 0.1 have no exact binary form. Small errors appear and casting to `long` cuts them off in the wrong direction:"),
        code("java", `
System.out.println(0.1 + 0.2);                   // 0.30000000000000004
System.out.println(0.1 + 0.2 == 0.3);            // false
System.out.println((long) (11_000 * 0.70));      // 7699  (70% of 11,000 is 7,700)
System.out.println(11_000L * 70 / 100);          // 7700`, "Main.java"),
        callout("tip", "Money rule for this course",
            "Prices and totals are whole dong in a long. Percentages are whole numbers, applied as amount * percent / 100. For currencies with cents, Java has java.math.BigDecimal; you will not need it at Mekong Books."),

        h2("5. Strings: immutable objects, compared with equals"),
        p("A `String` is an object. Two facts explain the coupon bug:"),
        numbered([
            "**`==` on references compares the arrows, not the text.** It is `true` only when both variables point to the same object.",
            "**Strings are immutable.** No method changes a `String`. `strip()`, `toUpperCase()`, `replace()` and friends build and return a **new** `String`, and the original stays as it was.",
        ]),
        p("Java keeps one shared object for each string **literal** in the source (the **string pool**), so `\"BOOK10\" == \"BOOK10\"` is `true`. That is why the unit test passed: it passed a literal, and so did the constant. Text built at runtime, from a request, a file, stdin or `toUpperCase()`, is a new object, and `==` says `false` even when every character matches."),
        image("string-identity-vs-equality", {
            alt: "Diagram. Left panel, variables inside main: int quantity holds the value 2 directly; String literal = \"BOOK10\" holds an arrow; String code = \" book10 \".strip().toUpperCase() holds another arrow. Right panel, objects on the heap: String object #1 \"BOOK10\" in the string pool, made from the literal, which every \"BOOK10\" literal points to; String object #2 \"BOOK10\", built at runtime by toUpperCase, same characters but a different object. The literal's arrow points to object #1, code's arrow points to object #2. Bottom left, red: code == literal is false because it compares the two arrows and object #2 is not object #1; text read from a request, a file or stdin is never the pooled literal, so the coupon check always fails. Bottom right, green: code.equals(literal) is true because it compares the characters B O O K 1 0; equalsIgnoreCase also ignores upper and lower case; for int, long, char and boolean, == is right.",
            caption: "A primitive holds its value; a String variable holds a reference. == compares references, equals compares characters.",
        }),
        code("java", `
public class Main {
    public static void main(String[] args) {
        String literal = "BOOK10";
        String typed = " book10 ";                    // what the customer sent
        String code = typed.strip().toUpperCase();    // a NEW string, built at runtime

        System.out.println(code);                     // BOOK10
        System.out.println(code == literal);          // false: two different objects
        System.out.println(code.equals(literal));     // true: same characters
        System.out.println(typed.strip().equalsIgnoreCase(literal)); // true
        System.out.println("BOOK10" == literal);      // true: both are the same pooled literal

        typed.toUpperCase();                          // result thrown away
        System.out.println("[" + typed + "]");        // [ book10 ]  - typed never changes
        System.out.println("   ".isBlank());          // true
        System.out.println("   ".isEmpty());          // false
        System.out.println("Clean Code".replace(' ', '-').toLowerCase()); // clean-code
    }
}`, "Main.java"),
        bullets([
            "**`equals`** compares character by character and is case-sensitive. **`equalsIgnoreCase`** ignores upper and lower case.",
            "**`strip()`** removes whitespace at both ends (including Unicode spaces). The older `trim()` only removes ASCII control characters and spaces; prefer `strip()`.",
            "**`isBlank()`** is `true` for an empty string or one with only whitespace; **`isEmpty()`** is `true` only for `\"\"`.",
            "**Calls chain** because each returns a new `String`: `typed.strip().toUpperCase()`. A call whose result you do not store, like `typed.toUpperCase();` on its own, does nothing useful.",
            "**`null` is not a string.** Calling a method on a `null` variable throws `NullPointerException`. When the value may be missing, check it first or write the literal on the left: `\"BOOK10\".equals(code)` returns `false` for `null`. The lesson **Optional & null safety** goes further.",
        ]),
        challenge("chal_quiz_javaf_111", "Ask two questions for each line: is this comparing objects or characters, and in which type is the arithmetic done before the value is stored?"),

        h2("6. Formatting text and text blocks"),
        h3("String.format and formatted"),
        p("`String.format(pattern, values...)` fills **format specifiers** in a pattern: `%s` for any value as text, `%d` for a whole number, `%,d` for a whole number with grouping separators. `pattern.formatted(values...)` does the same as an instance method:"),
        code("java", `
import java.util.Locale;

System.out.println("Order %s: %d book(s)".formatted("MB-1042", 3));          // Order MB-1042: 3 book(s)
System.out.println(String.format(Locale.ROOT, "%,d", 1234567));             // 1,234,567
System.out.println(String.format(Locale.forLanguageTag("vi-VN"), "%,d", 1234567)); // 1.234.567`, "Main.java"),
        p("The grouping separator depends on the **locale**. `formatted(...)` and `String.format` without a locale use the default locale of the machine, so the same receipt shows `1,234,567` on an English server and `1.234.567` on a laptop set to Vietnamese. When the output must be the same everywhere (receipts, logs, files another program reads), pass `Locale.ROOT`, the neutral locale. The same applies to `toUpperCase`: with a Turkish default locale, `\"title\".toUpperCase()` gives `TİTLE` with a dotted İ, so write `toUpperCase(Locale.ROOT)` for codes and identifiers."),
        h3("Text blocks"),
        p("A **text block** is a multi-line string literal between `\"\"\"` delimiters (final since Java 15). It is ideal for templates such as the order confirmation email:"),
        code("java", String.raw`
import java.util.Locale;

public class Main {
    public static void main(String[] args) {
        String template = """
                Xin chào %s,

                Thank you for shopping at Mekong Books. \
                Your order %s is confirmed.

                  Books:  %d
                  Total:  %,d VND

                Mekong Books team
                """;
        String email = String.format(Locale.ROOT, template, "Nguyễn Thị Lan", "MB-1042", 3, 329_000);
        System.out.print(email);
    }
}

// Xin chào Nguyễn Thị Lan,
//
// Thank you for shopping at Mekong Books. Your order MB-1042 is confirmed.
//
//   Books:  3
//   Total:  329,000 VND
//
// Mekong Books team`, "Main.java"),
        bullets([
            "**The opening `\"\"\"` must end its line**; the content starts on the next line. Because the closing `\"\"\"` is on its own line, the text ends with a newline, so `print` (not `println`) is enough.",
            "**Incidental indentation is removed.** Java finds the smallest indentation among the content lines and the closing delimiter and strips that much from every line. The two extra spaces before `Books:` are kept because they are more than the minimum.",
            "**A `\\` at the end of a line** joins it with the next line: the source stays readable, the email gets one long line.",
            "**Trailing spaces are stripped** from each line. When you need one, write `\\s`, which is a single space that survives.",
            "Placeholders work as usual: pass the text block to `String.format(Locale.ROOT, ...)`, or call `.formatted(...)` when there is no `%,d` or decimal in it.",
        ]),
        p("Move the closing delimiter to the left and that whitespace becomes part of every line, because now the delimiter has the smallest indentation:"),
        code("java", String.raw`
String shifted = """
        Order %s
          Status: %s
    """.formatted("MB-1042", "packed");
System.out.print(shifted);
//     Order MB-1042
//       Status: packed

String kept = """
    Total:\s
    """;
System.out.println(kept.length() + " " + kept.endsWith(" \n"));   // 8 true`, "Main.java"),
        callout("info", "Text blocks are plain Strings",
            "A text block creates an ordinary String, equal to the same text written with \\n escapes. Everything in section 5 applies: it is immutable, and you compare it with equals."),

        h2("7. Build it: the checkout receipt"),
        p("Time to write the checkout part again, correctly. The test runner reads the coupon line exactly as typed and the order lines, then prints the receipt using four small methods that you write: the line total, the coupon percent, the discount amount and the money format. The starter contains the incident's mistakes on purpose. One hidden test is the school order."),
        challenge("chal_coding_javaf_112", "Fix one method at a time: widen to long before multiplying, clean up the typed code before comparing it as text, multiply before dividing, and format with Locale.ROOT and the grouping flag. Run the example from the header comment after each change."),

        h2("8. The fix"),
        code("java", `
public class OrderService {
    static final String BOOK10 = "BOOK10";

    static int discountPercent(String couponCode) {
        if (couponCode == null || couponCode.isBlank()) {
            return 0;
        }
        return couponCode.strip().equalsIgnoreCase(BOOK10) ? 10 : 0;
    }

    static long orderTotal(int quantity, long unitPrice, String couponCode) {
        long subtotal = Math.multiplyExact(quantity, unitPrice);    // long math, throws instead of wrapping
        long discount = subtotal * discountPercent(couponCode) / 100;  // multiply first: rounds down to whole dong
        return subtotal - discount;
    }
}`, "OrderService.java"),
        numbered([
            "**Text is compared with `equalsIgnoreCase` after `strip()`.** The coupon no longer depends on whether the string came from a literal or from a request. A missing or blank code means no discount, without a `NullPointerException`.",
            "**Money is `long`, and the multiplication is done in `long`.** `unitPrice` is a `long`, so `Math.multiplyExact` uses its `long` version: 3,000,000,000 VND is fine, and a truly impossible total throws instead of turning negative.",
            "**Multiply before dividing.** `subtotal * 10 / 100` keeps the discount; `subtotal * (10 / 100)` is always 0.",
            "**The invoice formats totals with `%,d` and `Locale.ROOT`**, so 3,000,000,000 VND looks the same on every server.",
        ]),
        p("And the test that was green on Friday now uses input built at runtime, the way production does, plus the school order:"),
        code("java", `
String typed = new String(" book10 ");
check(OrderService.discountPercent(typed) == 10, "coupon typed by a customer");
check(OrderService.orderTotal(2, 120_000, "BOOK10") == 216_000, "10% off two books");
check(OrderService.orderTotal(25_000, 120_000, "") == 3_000_000_000L, "school order");`, "OrderServiceTest.java"),

        h2("9. Pitfalls"),
        bullets([
            "**`==` on strings.** It compares references. Tests with literals pass because literals are pooled; production input never is. Use `equals` or `equalsIgnoreCase`.",
            "**Ignoring the result of a String method.** `code.strip();` on its own changes nothing. Write `code = code.strip();` or use the result directly.",
            "**`int * int` stored in a `long`.** `long total = copies * price;` overflows before the assignment. Cast one operand: `(long) copies * price`, or use `Math.multiplyExact`.",
            "**`(long) (copies * price)` is the same bug.** The cast happens after the `int` multiplication has already wrapped.",
            "**Percentages with integer division.** `10 / 100` is `0`. Multiply first, divide last.",
            "**`double` for money.** `(long) (11_000 * 0.70)` is `7699`. Keep whole dong in a `long`.",
            "**Locale-dependent output.** `\"%,d\".formatted(n)` and `toUpperCase()` follow the machine's default locale. Pass `Locale.ROOT` for anything machine-read or tested.",
            "**Text block indentation.** The position of the closing `\"\"\"` decides how much indentation is removed. Trailing spaces disappear unless you write `\\s`.",
        ]),

        h2("10. Checklist"),
        bullets([
            "You can run a single file with `java Main.java`, or compile with `javac` and run with `java Main`.",
            "Whole numbers that can grow (money, totals, counts times prices) are `long`, and the arithmetic is done in `long` before the value is stored.",
            "Overflow-sensitive multiplications use `Math.multiplyExact` or a `long` operand.",
            "Percentages are `amount * percent / 100` with whole numbers, never `percent / 100` first and never `double`.",
            "Strings are compared with `equals` / `equalsIgnoreCase`, after `strip()` for anything a person typed; `==` is only for primitives.",
            "Every String method result is stored or used; nothing expects a String to change in place.",
            "Output with `%,d` uses `String.format(Locale.ROOT, ...)`; codes are upper-cased with `toUpperCase(Locale.ROOT)`.",
            "Multi-line templates are text blocks, with the closing `\"\"\"` aligned to the content and `\\` or `\\s` where needed.",
        ]),
    ],
});
