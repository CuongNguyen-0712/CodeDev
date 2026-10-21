// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// C code blocks use String.raw, so "\n" reaches Sanity as the two characters the learner types.
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-cf-1-1",
    title: "Types, sizes & integer overflow",
    slug: { _type: "slug", current: "c-types-sizes-integer-overflow" },
    description:
        "The nightly stock report says Lotus Mart has 4294967295 boxes of TEA-500, and a café chain's loyalty points total is negative. Write and compile your first C program, then learn what C's integer types really hold on x86-64 Linux, why unsigned arithmetic wraps while signed overflow is undefined behaviour, the conversions that silently change values, and how C23's ckd_add catches overflow before it reaches a report.",
    estimatedTime: 22,

    scenario: {
        role: "Junior C developer on Lotus Mart's warehouse tools team",
        problem:
            "Every night a small C tool reads the warehouse scanner logs and prints the stock report and the loyalty points of business customers. This morning the report claims 4294967295 boxes of TEA-500 (the shelf is empty), and Cafe Soc Trang, a café chain that buys tea wholesale, shows -1924967 loyalty points. Nobody changed the code. Nobody knew the numbers had limits.",
    },

    content: [
        h2("1. The incident: 4,294,967,295 boxes of tea"),
        p("The warehouse team in Bình Dương opens the nightly report at 7:00 and sees this:"),
        code("text", `
NIGHTLY STOCK REPORT  2026-10-20
SKU        STOCK
TEA-500    4294967295
MUG-01     38

LOYALTY    Cafe Soc Trang    points: -1924967`),
        p("The TEA-500 shelf is empty: the last boxes were sold yesterday. A damaged box was then sent back to the supplier, and the tool subtracted 1 from a count that was already 0. Cafe Soc Trang spent about 2.37 billion VND this year, so it should have about 2.37 million points, not a negative number. Two different bugs, one cause: **a C integer has a fixed size, and the code went past its edge.**"),
        p("Before we take the tool apart, you need to be able to write, compile and run a C program yourself."),

        h2("2. Your first C program"),
        p("Save this as `hello.c`:"),
        code("c", String.raw`
#include <stdio.h>

int main(void)
{
    printf("Hello, Lotus Mart!\n");
    return 0;
}`, "hello.c"),
        bullets([
            "`#include <stdio.h>` pulls in the declarations of the standard input/output functions, such as `printf`. Lines starting with `#` are handled by the **preprocessor** before compiling.",
            "`int main(void)` is where every C program starts. `void` means it takes no arguments; `int` means it returns a whole number to the operating system.",
            "`printf` prints text. `\\n` inside the quotes is a newline. Every statement ends with `;`.",
            "`return 0;` tells the operating system \"success\". Any other value means failure.",
        ]),
        p("C is a **compiled** language: a compiler turns the source file into a program file, and you run that file. On Linux with gcc 15:"),
        code("bash", `
gcc -std=c23 -Wall -Wextra -g hello.c -o hello
./hello
# Hello, Lotus Mart!`),
        bullets([
            "`-std=c23` selects the C23 language version used in this course.",
            "`-Wall -Wextra` turn on most useful **warnings**. A warning does not stop the build, but it usually points at a real bug.",
            "`-g` adds debug information, so tools can show you file names and line numbers.",
            "`-o hello` names the output program; `./hello` runs it from the current folder.",
        ]),
        p("Warnings are free bug reports. This program has two mistakes; the compiler finds both:"),
        code("c", String.raw`
#include <stdio.h>

int main(void)
{
    int boxes = 12;
    int unused = 3;
    printf("boxes: %d, bytes in an int: %d\n", boxes, sizeof boxes);
    return 0;
}`, "warn.c"),
        code("text", `
warn.c:7:42: warning: format '%d' expects argument of type 'int', but argument 3 has type 'long unsigned int' [-Wformat=]
warn.c:6:9: warning: unused variable 'unused' [-Wunused-variable]`),
        p("`printf` does not know the types of its arguments: the **format specifiers** tell it. `%d` prints an `int`, `%u` an `unsigned int`, `%lld` a `long long` and `%zu` a `size_t` (the type of `sizeof`, see section 4). A wrong specifier is undefined behaviour, so fix every `-Wformat` warning. Without `-Wall`, gcc stays silent about the unused variable. Treat a warning as an error until you can explain why it is harmless."),

        h2("3. Reproduce it"),
        p("The real tool reads the scanner logs; this copy hard-codes the numbers from the incident. Numbers in C23 may use `'` as a **digit separator**: `950'000'000` is 950 million. `//` starts a comment."),
        code("c", String.raw`
#include <stdio.h>

int main(void)
{
    // TEA-500: the system already counted 0 boxes when one went back to the supplier
    unsigned int stock = 0;
    unsigned int sent_back = 1;
    stock = stock - sent_back;
    printf("TEA-500 stock: %u\n", stock);

    // Cafe Soc Trang, orders this year in VND
    int spent = 0;
    spent = spent + 950'000'000;
    spent = spent + 780'000'000;
    spent = spent + 640'000'000;
    int points = spent / 1000;          // 1 point per 1,000 VND
    printf("spent: %d VND, points: %d\n", spent, points);
    return 0;
}`, "repro.c"),
        code("text", `
$ gcc -std=c23 -Wall -Wextra -g repro.c -o repro && ./repro
TEA-500 stock: 4294967295
spent: -1924967296 VND, points: -1924967`),
        p("No warning, no crash, wrong numbers. Now build it again with the **sanitizers**: `-fsanitize=address,undefined` adds checks to the program, AddressSanitizer (ASan) for memory errors and UndefinedBehaviorSanitizer (UBSan) for undefined behaviour. They make the program slower, so use them while developing and testing:"),
        code("text", `
$ gcc -std=c23 -Wall -Wextra -g -O0 -fsanitize=address,undefined repro.c -o repro && ./repro
repro.c:15:11: runtime error: signed integer overflow: 1730000000 + 640000000 cannot be represented in type 'int'
TEA-500 stock: 4294967295
spent: -1924967296 VND, points: -1924967`),
        p("UBSan points at the third addition of `spent`. It says nothing about the stock line, and that is not an oversight: as you will see, the two bugs are different kinds of wrong."),

        h2("4. Integer types and their sizes"),
        p("C has several integer types. Each one is a fixed number of bytes (a byte is 8 bits here), so each can hold only a fixed range of values:"),
        bullets([
            "`char`, `short`, `int`, `long`, `long long`, from small to large. Each exists as `signed` (negative and positive, the default for all except `char`) and `unsigned` (0 and positive only, about twice the positive range).",
            "`sizeof` gives the size of a type or variable in bytes. Its result has type `size_t`, an unsigned type big enough for the size of any object; print it with `%zu`.",
            "`<limits.h>` names the limits: `INT_MIN`, `INT_MAX`, `UINT_MAX`, `LLONG_MAX` ...",
            "`<stdint.h>` adds **fixed-width** types whose size is in the name: `int32_t` (exactly 32 bits, signed), `uint8_t` (8 bits, unsigned), `int64_t`, and their limits `INT32_MAX`, `INT32_MIN` ... Use them when the size matters, for example a 32-bit field in a file or database.",
        ]),
        code("c", String.raw`
#include <limits.h>
#include <stdint.h>
#include <stdio.h>

int main(void)
{
    printf("char      %zu\n", sizeof(char));
    printf("short     %zu\n", sizeof(short));
    printf("int       %zu\n", sizeof(int));
    printf("long      %zu\n", sizeof(long));
    printf("long long %zu\n", sizeof(long long));
    printf("size_t    %zu\n", sizeof(size_t));
    printf("int32_t %zu, uint8_t %zu, int64_t %zu\n", sizeof(int32_t), sizeof(uint8_t), sizeof(int64_t));
    printf("INT_MIN   %d\n", INT_MIN);
    printf("INT_MAX   %d\n", INT_MAX);
    printf("UINT_MAX  %u\n", UINT_MAX);
    printf("LLONG_MAX %lld\n", LLONG_MAX);
    return 0;
}`, "sizes.c"),
        code("text", `
char      1
short     2
int       4
long      8
long long 8
size_t    8
int32_t 4, uint8_t 1, int64_t 8
INT_MIN   -2147483648
INT_MAX   2147483647
UINT_MAX  4294967295
LLONG_MAX 9223372036854775807`),
        p("So on this machine an `int` holds -2,147,483,648 to 2,147,483,647: about ±2.1 billion. Cafe Soc Trang's 2.37 billion VND does not fit. An `unsigned int` holds 0 to 4,294,967,295, which is exactly the number in the stock report."),
        callout("info", "Most sizes are implementation-defined",
            "The C standard only fixes minimums: int at least 16 bits, long at least 32, long long at least 64, and sizeof(char) is always 1. The output above is for x86-64 Linux, where gcc uses the LP64 model (long and pointers are 64 bits). On 64-bit Windows, long is only 4 bytes. If your code needs an exact size, use int32_t or int64_t; if it needs \"at least 64 bits\", long long is guaranteed everywhere."),

        h2("5. Past the edge: unsigned wraps, signed overflow is undefined"),
        h3("Unsigned arithmetic wraps around"),
        p("For unsigned types the standard defines what happens: results are reduced **modulo 2^N**, where N is the number of bits. Go below 0 and you land at the maximum; go above the maximum and you land at 0, like a car's odometer:"),
        code("c", String.raw`
#include <stdint.h>
#include <stdio.h>

int main(void)
{
    unsigned int boxes = 0;
    boxes = boxes - 1;
    printf("%u\n", boxes);              // 4294967295
    boxes = boxes + 1;
    printf("%u\n", boxes);              // 0

    uint8_t level = 250;                // 8 bits: 0..255
    level = level + 10;
    printf("%d\n", level);              // 4  (260 - 256)
    return 0;
}`, "wrap.c"),
        p("This is **defined behaviour**: every compiler gives these results, and UBSan does not complain, which is why it ignored the stock line. Defined does not mean right. For a stock count, \"0 minus 1 is 4294967295\" is nonsense that looks like data."),
        h3("Signed overflow is undefined behaviour"),
        p("For signed types there is no such rule. If the exact result of `+`, `-` or `*` does not fit in the type, the behaviour is **undefined** (UB): the standard places no requirement on the program at all. A **function** is introduced here too: `add_points` takes two `int` parameters and returns their sum."),
        code("c", String.raw`
#include <limits.h>
#include <stdio.h>

int add_points(int total, int earned)
{
    return total + earned;
}

int main(void)
{
    int total = INT_MAX - 5;
    total = add_points(total, 10);
    printf("total: %d\n", total);
    return 0;
}`, "overflow.c"),
        code("text", `
$ gcc -std=c23 -Wall -Wextra -g -O0 -fsanitize=address,undefined overflow.c -o overflow && ./overflow
overflow.c:6:18: runtime error: signed integer overflow: 2147483642 + 10 cannot be represented in type 'int'
total: -2147483644`),
        p("This build printed a wrapped value, like the incident. Do not build on that: because the program has UB, the compiler may assume the overflow never happens. Optimizers really use that assumption, for example to delete a check such as `if (total + 10 < total)` as \"always false\". The value you saw is one possible outcome, not a rule."),
        image("wrap-vs-ub", {
            alt: "Three panels and a bottom strip. Left, red: an unsigned int stock is 4 byte cells 00 00 00 00 at byte offsets +0 to +3; after stock - 1 it wraps modulo 2^32 to FF FF FF FF, so the report shows 4294967295 boxes - defined behaviour, but wrong for a count. Middle, red: an int spent holds INT_MAX 2147483647, stored lowest byte first as FF FF FF 7F; spent + 1 does not fit, the result cells are drawn as ?? because the standard promises no value (undefined behaviour), and UBSan reports signed integer overflow. Right, green: ckd_add, ckd_sub and ckd_mul from stdckdint.h return true when the exact result does not fit; alternatively a wider long long of 8 bytes holds 2147483648 (bytes 00 00 00 80 00 00 00 00); overflow is reported, never wrapped. Bottom: the same four FF bytes read as unsigned int with %u are 4294967295 and read as int with %d are -1, because C23 requires two's complement; sizes are for x86-64 Linux, and the standard only promises minimum sizes.",
            caption: "Unsigned types wrap by definition, signed overflow is undefined; checked arithmetic reports instead of guessing.",
        }),

        h2("6. Conversions C does behind your back"),
        p("C converts integer values between types automatically. Three rules cause most surprises."),
        h3("Integer promotion"),
        p("Arithmetic on types smaller than `int` (`char`, `short`, `uint8_t` ...) is never done in that small type. Both operands are first **promoted** to `int`:"),
        code("c", String.raw`
#include <stdint.h>
#include <stdio.h>

int main(void)
{
    uint8_t a = 200;
    uint8_t b = 100;
    printf("%d\n", a + b);              // the sum is an int
    printf("%zu\n", sizeof(a + b));
    uint8_t c = a + b;                  // stored back into 8 bits
    printf("%d\n", c);
    return 0;
}`, "promo.c"),
        code("text", `
300
4
44`),
        p("`a + b` is an `int` with the value 300. Only when you store it back into a `uint8_t` is it reduced modulo 256 to 44, and `-Wall -Wextra` print no warning for that line. Promotion is also why `uint8_t level = 250; level + 10` in section 5 did not wrap until the assignment."),
        h3("Signed meets unsigned"),
        p("When an operator gets an `int` and an `unsigned int`, the `int` is converted to `unsigned int` first. A negative number becomes a huge positive one, so comparisons lie:"),
        code("c", String.raw`
#include <stdio.h>

int main(void)
{
    int change = -1;
    unsigned int stock = 0;
    if (change < stock)
        printf("-1 is less than 0\n");
    else
        printf("-1 is NOT less than 0u\n");
    printf("as unsigned: %u\n", (unsigned int)change);
    return 0;
}`, "compare.c"),
        code("text", `
compare.c:7:16: warning: comparison of integer expressions of different signedness: 'int' and 'unsigned int' [-Wsign-compare]
    7 |     if (change < stock)
      |                ^
-1 is NOT less than 0u
as unsigned: 4294967295`),
        p("`(unsigned int)change` is a **cast**: an explicit conversion to the type in parentheses. The same happens with constants: `-1 < 0u` (the `u` suffix makes `0u` an unsigned int) evaluates to 0, false. In C, `-Wsign-compare` is part of `-Wextra`, not `-Wall`: one more reason to always use both. The fix is not a cast that hides the warning; it is choosing types so that values that can be negative are compared as signed."),
        h3("Integer division truncates"),
        p("Dividing two integers gives an integer: the fraction is dropped, rounding **toward zero**. `%` gives the remainder, with the sign of the left operand. Make one operand a `double` (a floating-point number) to get a fraction:"),
        code("c", String.raw`
#include <stdio.h>

int main(void)
{
    int boxes = 7;
    int scanners = 2;
    printf("%d\n", boxes / scanners);        // 3
    printf("%d\n", boxes % scanners);        // 1
    printf("%d\n", -7 / 2);                  // -3
    printf("%d\n", -7 % 2);                  // -1
    printf("%.1f\n", boxes / 2.0);           // 3.5
    printf("%.1f\n", (double)boxes / scanners);   // 3.5
    printf("%.1f\n", (double)(boxes / scanners)); // 3.0: divided first, then converted
    return 0;
}`, "div.c"),
        p("That is how `spent / 1000` turned -1924967296 into -1924967 points: the division was exact enough, the input was already wrong. Dividing by zero is UB for integers, so check the divisor first. Test your intuition about these rules:"),
        challenge("chal_quiz_cf_111"),

        h2("7. Checked arithmetic with <stdckdint.h>"),
        p("C23 added three macros that do the arithmetic **and** tell you whether the result fits: `ckd_add`, `ckd_sub` and `ckd_mul`. Each takes where to store the result, then the two operands, and returns a `bool` (`true` or `false`, keywords in C23):"),
        code("c", String.raw`
#include <limits.h>
#include <stdckdint.h>
#include <stdio.h>

int main(void)
{
    int total = INT_MAX - 5;
    int result;
    if (ckd_add(&result, total, 10))
        printf("overflow, result holds %d\n", result);
    else
        printf("ok: %d\n", result);

    if (ckd_add(&result, total, 5))
        printf("overflow\n");
    else
        printf("ok: %d\n", result);

    unsigned int stock = 0;
    if (ckd_sub(&stock, stock, 1u))
        printf("cannot take 1 from %u\n", 0u);

    long long grams;
    if (!ckd_mul(&grams, 3'000'000, 1'000))
        printf("grams: %lld\n", grams);
    return 0;
}`, "ckd.c"),
        code("text", `
overflow, result holds -2147483644
ok: 2147483647
cannot take 1 from 0
grams: 3000000000`),
        bullets([
            "`&result` is \"the address of `result`\": it lets the macro write into your variable. Lesson 2.1 explains addresses and pointers; for now read it as \"store the answer in `result`\".",
            "The macro computes the **exact** mathematical result, as if the integers had no limit, then checks whether it fits in the result's type. `true` means it did not fit. There is no UB, even for signed types.",
            "On overflow the result variable still gets the wrapped value. Never use it: report the error instead.",
            "It works for unsigned types too: `ckd_sub` on an `unsigned int` returns `true` when the result would be negative. That is the check the stock tool was missing.",
            "The operands may have different types from the result. `ckd_mul(&grams, 3'000'000, 1'000)` multiplies two `int`s whose product does not fit in an `int`, but it fits in `grams`, a `long long`, so the call succeeds.",
            "`!` means \"not\": `if (!ckd_mul(...))` reads \"if the multiplication did not overflow\".",
        ]),
        p("Now write the checked total the nightly tool should have used. Every running total of a day's scans must fit in the 32-bit field the tool writes it to:"),
        challenge("chal_coding_cf_112", "Keep the running total in an int32_t and add each quantity with ckd_add(&sum, sum, qty[i]). When it returns true, return the line number right away; remember that the first quantity is line 1, not line 0. Test with values that end exactly at INT32_MAX and INT32_MIN, not only past them."),

        h2("8. The fix"),
        p("Two changes, one per bug. The stock is checked **before** it is changed, and a refused movement is reported instead of stored. The money total uses a type with room (`long long`, at least 64 bits on every C23 compiler) and is still checked, because one day the inputs will be bigger than you expect. `||` means \"or\": the chain stops at the first `ckd_add` that reports an overflow."),
        code("c", String.raw`
#include <stdckdint.h>
#include <stdio.h>

int main(void)
{
    // stock: check BEFORE you subtract; ckd_sub refuses to go below 0 for unsigned
    unsigned int stock = 0;
    unsigned int sent_back = 1;
    unsigned int new_stock;
    if (ckd_sub(&new_stock, stock, sent_back))
        printf("TEA-500: cannot send back %u, stock is %u - recount the shelf\n", sent_back, stock);
    else
        stock = new_stock;

    // money: a type wide enough (long long is at least 64 bits), and still checked
    long long spent = 0;
    if (ckd_add(&spent, spent, 950'000'000)
        || ckd_add(&spent, spent, 780'000'000)
        || ckd_add(&spent, spent, 640'000'000)) {
        printf("spent overflowed - stop, do not print points\n");
        return 1;
    }
    long long points = spent / 1000;    // 1 point per 1,000 VND, rounded down
    printf("spent: %lld VND, points: %lld\n", spent, points);
    return 0;
}`, "fix.c"),
        code("text", `
$ gcc -std=c23 -Wall -Wextra -g -O0 -fsanitize=address,undefined fix.c -o fix && ./fix
TEA-500: cannot send back 1, stock is 0 - recount the shelf
spent: 2370000000 VND, points: 2370000`),
        numbered([
            "**The stock count stays unsigned**, because a count cannot be negative, but no subtraction reaches it unchecked. A refused movement is visible in the log, and the warehouse recounts the shelf instead of trusting a wrapped number.",
            "**Money and points use `long long`.** 2.37 billion VND needs more than 32 bits; 64 bits hold about 9.2 x 10^18.",
            "**The additions are still checked.** A wider type moves the edge; `ckd_add` tells you when you reach it.",
            "**The build is clean with `-Wall -Wextra`, and the tests run with `-fsanitize=address,undefined`**, so the next overflow is reported by UBSan in testing instead of by the warehouse team at 7:00.",
        ]),

        h2("9. Pitfalls"),
        bullets([
            "**\"It printed a negative number, so overflow wraps.\"** One build did. Signed overflow is UB; the next compiler version or `-O2` may behave differently, including removing your overflow checks.",
            "**Checking after the fact.** `sum = sum + x; if (sum < 0) ...` either runs after UB already happened (signed) or confuses a real negative total with an overflow (wrapped unsigned). Check with `ckd_add` before you use the result.",
            "**Using `unsigned` to \"prevent negatives\".** It prevents nothing: the negative result wraps to a huge positive one, and every later `< 0` test is false.",
            "**Mixing signed and unsigned in a comparison.** `-1 < 0u` is false. Read every `-Wsign-compare` warning.",
            "**Assuming `long` is 64 bits.** It is 4 bytes on 64-bit Windows. Use `int64_t` or `long long` when you need 64 bits.",
            "**Wrong `printf` specifier.** `%d` for a `size_t` or `long long` is UB. Use `%zu`, `%lld`, `%u` and fix every `-Wformat` warning.",
            "**Expecting a fraction from `/`.** `7 / 2` is 3 and `-7 / 2` is -3. Convert to `double` before dividing if you need 3.5.",
        ]),

        h2("10. Checklist"),
        bullets([
            "Compile with `gcc -std=c23 -Wall -Wextra -g`, and test with `-fsanitize=address,undefined`; treat warnings as bugs.",
            "Know the range of every integer you store: `sizeof`, `<limits.h>`, `<stdint.h>`. Use fixed-width types when the size is part of a file, database or protocol.",
            "Signed overflow is undefined behaviour; unsigned arithmetic wraps modulo 2^N. Neither is an error message.",
            "Use `ckd_add`, `ckd_sub`, `ckd_mul` wherever a sum, difference or product can reach the limits, and handle `true` as an error.",
            "Check before subtracting from a count; never let an unsigned value \"go negative\".",
            "Watch implicit conversions: small types are promoted to `int`, signed meets unsigned becomes unsigned, integer division truncates toward zero.",
            "Test at the exact edges: `INT_MAX`, `INT_MIN`, 0, and one step past each.",
        ]),
    ],
});
