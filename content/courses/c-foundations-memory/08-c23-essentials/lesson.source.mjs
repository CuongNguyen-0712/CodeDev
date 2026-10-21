// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers live in challenges.json (-> Postgres).
// C code blocks that contain backslashes use String.raw, so "\n" reaches Sanity as the two characters the learner types.
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-cf-4-2",
    title: "C23 essentials: bool, nullptr, constexpr, typeof",
    slug: { _type: "slug", current: "c-c23-essentials-bool-nullptr-constexpr-typeof" },
    description:
        "A fragile order left the warehouse with a normal label because an old header stored the FRAGILE flag 0x100 in an unsigned char \"BOOL\", and a #define made a buffer half the size everybody assumed. Learn the C23 replacements for those old idioms - bool, constexpr, nullptr, typeof and auto - plus [[nodiscard]], static_assert, digit separators, binary literals, = {}, unreachable() and memset_explicit, and modernize the header step by step.",
    estimatedTime: 22,

    scenario: {
        role: "Junior C developer on Lotus Mart's warehouse tools team",
        problem:
            "Order LM-1042 (a ceramic mug, MUG-01) arrived in Cần Thơ in pieces. The packing station had printed a normal label instead of one with \"HANG LE VO\" (fragile). The order record is correct: its flags contain FRAGILE (0x100). The label printer program is new, but it includes label_legacy.h, a header copied from a 1990s printer SDK with its own TRUE, FALSE, BOOL and MAX_LABEL. Your lead asks you to find the bug and bring the header up to C23.",
    },

    content: [
        h2("1. The incident: a fragile mug with a normal label"),
        p("The label program decides whether to print the fragile warning from the order's flag bits. The relevant part of the old header and the code that uses it:"),
        code("c", String.raw`
/* label_legacy.h - copied from a 1990s printer SDK */
#define TRUE  1
#define FALSE 0
typedef unsigned char BOOL;
#define MAX_LABEL 32 + 1          /* 32 characters + the terminator */
#define FLAG_FRAGILE 0x100

/* label.c */
BOOL fragile = flags & FLAG_FRAGILE;
if (fragile == TRUE)
    print_fragile_label(order);
else
    print_normal_label(order);

char two_lines[MAX_LABEL * 2];     /* room for two label lines */`, "label_legacy.h"),
        p("C89, the C of 1989, had no boolean type, so every library invented one: `typedef int BOOL`, `typedef unsigned char BOOL`, `#define TRUE 1`. A `typedef` gives an existing type a new name (lesson 3.2); it creates nothing new. `#define` is a **macro**: before compiling, the preprocessor replaces the name with the text after it, character for character. Both details are about to matter."),

        h2("2. Reproduce it"),
        p("The whole incident fits in one file. `flags` holds two bits: FRAGILE (`0x100`) and EXPRESS (`0x004`). `&` is bitwise AND: it keeps only the bits that are set in both operands, so `flags & 0x100` is `0x100`, which is 256."),
        code("c", String.raw`
#include <stdio.h>

#define TRUE  1
#define FALSE 0
typedef unsigned char BOOL;
#define MAX_LABEL 32 + 1          /* 32 characters + the terminator */
#define FLAG_FRAGILE 0x100

int main(void)
{
    unsigned flags = 0x100 | 0x004;    /* order LM-1042: FRAGILE + EXPRESS */
    BOOL fragile = flags & FLAG_FRAGILE;
    printf("fragile = %d\n", fragile);
    if (fragile == TRUE)
        printf("print: HANG LE VO (fragile)\n");
    else
        printf("print: normal label\n");

    char two_lines[MAX_LABEL * 2];     /* room for two lines, or so we think */
    printf("sizeof two_lines = %zu\n", sizeof two_lines);
    return 0;
}`, "repro.c"),
        code("text", `
$ gcc -std=c23 -Wall -Wextra -g repro.c -o repro && ./repro
fragile = 0
print: normal label
sizeof two_lines = 34`),
        p("Two bugs, and not one warning with `-Wall -Wextra`:"),
        bullets([
            "**`fragile` is 0.** 256 does not fit in an `unsigned char` (0 to 255). Converting to an unsigned type keeps the value modulo 2^8 (lesson 1.1), and 256 mod 256 is 0. The FRAGILE bit is simply gone. Only `-Wconversion` reports it: `conversion from 'unsigned int' to 'BOOL' {aka 'unsigned char'} may change value`.",
            "**`two_lines` has 34 bytes, not 66.** The preprocessor pastes text, so `MAX_LABEL * 2` becomes `32 + 1 * 2`, and `*` binds tighter than `+`. Any code that trusts \"66\" writes past the end of the array, which is undefined behaviour (lesson 1.2).",
        ]),
        p("This lesson replaces each old idiom with the C23 feature made for it. C23 is the 2024 edition of the C standard; gcc 15 implements it with `-std=c23` (and uses `-std=gnu23`, C23 plus GNU extensions, when you give no `-std` at all)."),

        h2("3. bool, true and false are part of the language"),
        p("In C23 `bool`, `true` and `false` are **keywords**: no header needed. (Before C23 you needed `#include <stdbool.h>`; it still exists and is harmless.) The rule that fixes the incident is the conversion rule: **converting any number or pointer to `bool` gives `false` if it is zero and `true` otherwise**. Nothing is truncated."),
        code("c", String.raw`
#include <stdio.h>

int main(void)
{
    unsigned flags = 0x100 | 0x004;
    bool fragile = flags & 0x100;      /* any non-zero value becomes true */
    unsigned char byte = flags & 0x100;
    printf("bool: %d   unsigned char: %d\n", fragile, byte);
    printf("sizeof(bool) = %zu, true + true = %d\n", sizeof(bool), true + true);
    bool half = 0.5;
    printf("bool half = %d\n", half);
    return 0;
}`, "bool23.c"),
        code("text", `
bool: 1   unsigned char: 0
sizeof(bool) = 1, true + true = 2
bool half = 1`),
        p("A `bool` holds only 0 or 1. `true` and `false` have type `bool` and take part in arithmetic as 1 and 0, so `true + true` is 2 (an `int`). `sizeof(bool)` is implementation-defined; it is 1 on x86-64 Linux. `printf` has no `bool` conversion: a `bool` argument is promoted to `int`, so print it with `%d`."),
        image("bool-vs-byte-flag", {
            alt: "Top left, red panel \"BOOL fragile = flags & 0x100;\" with typedef unsigned char BOOL: the int 256 is drawn as four byte cells at offsets +0 to +3 holding 00 01 00 00 (little-endian x86-64); the 1 bit lives in byte +1. An arrow from byte +0 leads to a one-byte cell 00: 256 mod 256 = 0, so fragile = 0, there is no warning with -Wall -Wextra and a normal label is printed. Top right, green panel \"bool fragile = flags & 0x100;\": the same four bytes, an arrow from the whole value leads to a one-byte cell 01: non-zero becomes true, so the label prints HANG LE VO. Bottom table, old idiom to C23 replacement and why: #define MAX_LABEL 32 + 1 becomes constexpr int MAX_LABEL = 32 + 1 (MAX_LABEL * 2 is 34 as text, 66 as an object); BOOL f = x; f == TRUE becomes bool f = x; if (f) (bool turns every non-zero value into 1); print_skus(..., 0) becomes print_skus(..., nullptr) (0 is a 4-byte int, nullptr has pointer size 8); memset(pin, 0, 8) becomes memset_explicit(pin, 0, 8) (-O2 may delete the memset, this call stays).",
            caption: "An unsigned char keeps the low 8 bits; a bool asks \"is it zero?\". Below: the old idioms of this lesson and their C23 replacements.",
        }),
        h3("Never compare with TRUE"),
        p("Changing the typedef to `int` hides the first bug but not the second. With `typedef int BOOL`, `fragile` is 256: true in an `if`, but not equal to `TRUE`, which is 1:"),
        code("c", String.raw`
#include <stdio.h>
#define TRUE 1
typedef int BOOL;

int main(void)
{
    unsigned flags = 0x100 | 0x004;
    BOOL fragile = flags & 0x100;
    printf("fragile = %d\n", fragile);
    if (fragile)          printf("if (fragile)         -> taken\n");
    if (fragile == TRUE)  printf("if (fragile == TRUE) -> taken\n");
    else                  printf("if (fragile == TRUE) -> NOT taken\n");
    return 0;
}`, "boolint.c"),
        code("text", `
fragile = 256
if (fragile)         -> taken
if (fragile == TRUE) -> NOT taken`),
        p("Write `if (fragile)` and `if (!fragile)`. One more surprise: comparisons and `!`, `&&`, `||` still give an `int` (0 or 1) in C23, not a `bool`. That is harmless, because the value is always 0 or 1."),

        h2("4. constexpr: a named constant that is a real object"),
        p("`#define MAX_LABEL 32 + 1` is text, not a value. The classic patch is parentheses, `#define MAX_LABEL (32 + 1)`, and you will see it in every old codebase. C23 gives a better tool: a **`constexpr` object**. It has a type, a name the debugger knows, and a value the compiler computes at compile time:"),
        code("c", String.raw`
#include <stdio.h>

constexpr int MAX_LABEL = 32 + 1;      /* a real int object, value fixed at compile time */
static char line_buf[MAX_LABEL * 2];   /* file-scope array: needs a constant size */
static_assert(MAX_LABEL * 2 == 66);

int main(void)
{
    printf("sizeof line_buf = %zu\n", sizeof line_buf);
    return 0;
}`, "constexpr.c"),
        code("text", `
sizeof line_buf = 66`),
        p("Why not `const`? A `const int` is a read-only variable, not a constant expression. At file scope it cannot size an array, and inside a function `char buf[n]` with a `const int n` silently becomes a variable-length array:"),
        code("c", `
const int MAX_LABEL = 33;
static char line_buf[MAX_LABEL];
// error: variably modified 'line_buf' at file scope`),
        p("`constexpr` is also strict where a macro is careless. The initializer must be a constant expression, and the value must fit the type exactly - no silent truncation like the `BOOL` bug:"),
        code("c", `
int width = 40;
constexpr int a = width;
// error: initializer element is not constant
constexpr unsigned char b = 0x100;
// error: 'constexpr' initializer not representable in type of object`),
        callout("info", "constexpr in C is smaller than in C++",
            "In C23 only objects can be constexpr, not functions. A constexpr object is also const, and at file scope it has internal linkage (like static), so you can define it in a header that many .c files include. Keep #define for things that must be text: include guards, and values that #if has to test."),

        h2("5. nullptr: a null pointer with its own type"),
        p("Lesson 2.1 used `NULL` for \"points nowhere\". The catch: the standard lets `NULL` be any null pointer constant - `0`, `0L` or `((void *)0)` - so its **type** depends on your library. C23 adds the keyword `nullptr`, whose type is always `nullptr_t` (defined in `<stddef.h>`). `_Generic` chooses an expression by the type of its first operand, which makes types visible:"),
        code("c", String.raw`
#include <stdio.h>
#include <stddef.h>

#define TYPE_NAME(x) _Generic((x),   \
    int:       "int",                \
    long:      "long",               \
    void *:    "void *",             \
    nullptr_t: "nullptr_t",          \
    default:   "something else")

int main(void)
{
    printf("0       : %-9s size %zu\n", TYPE_NAME(0), sizeof 0);
    printf("NULL    : %-9s size %zu\n", TYPE_NAME(NULL), sizeof NULL);
    printf("nullptr : %-9s size %zu\n", TYPE_NAME(nullptr), sizeof nullptr);

    char *name = nullptr;              /* converts to any pointer type */
    if (name == nullptr && !name)
        printf("name is a null pointer\n");
    return 0;
}`, "nulltype.c"),
        code("text", `
0       : int       size 4
NULL    : void *    size 8
nullptr : nullptr_t size 8
name is a null pointer`),
        p("On glibc `NULL` happens to be `((void *)0)`. On another library it may be a plain `0`: an `int`, 4 bytes on this platform, while a pointer is 8. Most of the time the difference never shows, because the compiler converts `0` to the pointer type a parameter expects. It shows where the compiler does **not** know the expected type."),
        h3("Variadic functions and the sentinel"),
        p("A **variadic** function takes a variable number of arguments, written `...`, like `printf`. `<stdarg.h>` reads them one by one: `va_start` begins, `va_arg(args, T)` reads the next argument as type `T`, `va_end` finishes. The function cannot know how many arguments came, so a common convention ends the list with a null pointer, the **sentinel** (POSIX `execl` works this way):"),
        code("c", String.raw`
#include <stdio.h>
#include <stdarg.h>

/* Prints each SKU; the list ends with a null pointer (the "sentinel"). */
void print_skus(const char *first, ...)
{
    va_list args;
    va_start(args, first);
    for (const char *s = first; s != nullptr; s = va_arg(args, const char *))
        printf("SKU %s\n", s);
    va_end(args);
}

int main(void)
{
    print_skus("TEA-500", "RICE-5KG", "MUG-01", nullptr);
    return 0;
}`, "skus.c"),
        code("text", `
SKU TEA-500
SKU RICE-5KG
SKU MUG-01`),
        p("For the `...` arguments there is no parameter type, so the compiler passes each value as it is. `print_skus(\"TEA-500\", 0)` passes a 4-byte `int` where the function reads an 8-byte `const char *`: that is **undefined behaviour**, even if it seems to work on your machine. `nullptr` always has the size and representation of a `void *`, and C23 allows reading it with `va_arg` as `void *` or a character pointer. gcc can check the convention if you mark the function with the GNU attribute `[[gnu::sentinel]]`:"),
        code("c", `
[[gnu::sentinel]] void print_skus(const char *first, ...);

print_skus("TEA-500", "MUG-01", 0);
// warning: missing sentinel in function call [-Wformat=]
print_skus("TEA-500", "MUG-01", nullptr);   // no warning`),

        h2("6. typeof, typeof_unqual and auto"),
        p("`typeof(x)` is \"the type of `x`\": a GNU extension for decades, standard since C23. It does not evaluate `x`. A classic use is a macro that works for any type. `typeof_unqual(x)` is the same type without qualifiers such as `const`:"),
        code("c", String.raw`
#include <stdio.h>

#define SWAP(a, b) do { typeof(a) tmp_ = (a); (a) = (b); (b) = tmp_; } while (0)

int main(void)
{
    long front = 1'250'000, back = 300'000;     /* VND */
    SWAP(front, back);
    printf("front=%ld back=%ld\n", front, back);

    const int limit = 33;
    typeof(limit) a = 1;           /* const int: a cannot change */
    typeof_unqual(limit) b = 1;    /* int: const removed */
    b += 1;
    printf("sizeof(typeof(front)) = %zu, b = %d, a = %d\n", sizeof(typeof(front)), b, a);

    auto grams = 1'500;            /* int */
    auto price = 45'000.0;         /* double */
    auto sku = "TEA-500";          /* char * (the array decays) */
    printf("%d %.1f %s\n", grams, price, sku);
    printf("%zu %zu %zu\n", sizeof grams, sizeof price, sizeof sku);
    return 0;
}`, "typeof.c"),
        code("text", `
front=300000 back=1250000
sizeof(typeof(front)) = 8, b = 2, a = 1
1500 45000.0 TEA-500
4 8 8`),
        p("`a = 2;` would stop the build with `error: assignment of read-only variable 'a'`, because `typeof` keeps `const`. The `do { ... } while (0)` wrapper makes the macro behave like one statement after an `if`."),
        p("C23 also gives the old keyword `auto` a new job: `auto x = expression;` declares `x` with the type of the expression. The type comes from C's ordinary rules, so `auto sku = \"TEA-500\"` is a `char *` (the string array decays to a pointer, lesson 2.1) and `sizeof sku` is 8 because a pointer has 8 bytes here. That it equals the 8 bytes of `\"TEA-500\"` plus its terminator is a coincidence: `auto sku = \"RICE-5KG\"` gives 8 as well. Use `auto` where the type is obvious from the right-hand side or long to write; spell the type out when its size matters, such as counters and amounts."),

        h2("7. Attributes: [[nodiscard]] and [[maybe_unused]]"),
        p("An **attribute** in double square brackets tells the compiler something about a declaration. `[[nodiscard]]` says: ignoring this function's return value is probably a bug. An optional string explains why:"),
        code("c", String.raw`
#include <stdio.h>

[[nodiscard]] bool printer_ready(int printer_id)
{
    return printer_id == 7;
}

[[nodiscard("a failed print must be retried")]] int print_label(const char *sku)
{
    return printf("label %s\n", sku) < 0 ? -1 : 0;
}

void on_paper_out([[maybe_unused]] int printer_id, int code)
{
    printf("paper out, code %d\n", code);
}

void unused_param(int printer_id, int code)
{
    printf("code %d\n", code);
}

int main(void)
{
    printer_ready(7);                    /* warning */
    print_label("TEA-500");              /* warning with the reason */
    if (printer_ready(7) && print_label("MUG-01") == 0)
        printf("ok\n");
    (void)print_label("RICE-5KG");       /* deliberately ignored: no warning */
    on_paper_out(7, 3);
    unused_param(7, 3);
    return 0;
}`, "attributes.c"),
        code("text", `
$ gcc -std=c23 -Wall -Wextra -g attributes.c -o attributes
attributes.c:18:23: warning: unused parameter 'printer_id' [-Wunused-parameter]
attributes.c:25:5: warning: ignoring return value of 'printer_ready', declared with attribute 'nodiscard' [-Wunused-result]
attributes.c:26:5: warning: ignoring return value of 'print_label', declared with attribute 'nodiscard': "a failed print must be retried" [-Wunused-result]`),
        p("They are warnings, so the program still builds and runs. `[[maybe_unused]]` silences the \"unused\" warning for one name: `on_paper_out` gets no warning, `unused_param` does. That matters for a callback that must accept a parameter it does not need. Casting a call to `(void)` documents \"I ignore this result on purpose\", and gcc stays quiet about it."),

        h2("8. Small C23 features you will use every day"),
        code("c", String.raw`
#include <stdio.h>
#include <stddef.h>
#include <string.h>
#include <stdbit.h>

static_assert(sizeof(int) == 4);          /* no message, no header needed */

enum label_kind { LABEL_NORMAL, LABEL_FRAGILE, LABEL_COLD };

const char *kind_name(enum label_kind k)
{
    switch (k) {
    case LABEL_NORMAL:  return "normal";
    case LABEL_FRAGILE: return "fragile";
    case LABEL_COLD:    return "cold";
    }
    unreachable();                         /* we promise: never reached */
}

struct label { char sku[16]; int grams; bool fragile; };

int main(void)
{
    unsigned flags = 0b1'0000'0100;        /* bit 8 FRAGILE, bit 2 EXPRESS */
    printf("flags = %u = %#x = %#b\n", flags, flags, flags);
    printf("bits set: %u\n", stdc_count_ones(flags));

    struct label l = {};                   /* every member zero: "", 0, false */
    int counts[7] = {};
    printf("sku=\"%s\" grams=%d fragile=%d counts[6]=%d\n", l.sku, l.grams, l.fragile, counts[6]);

    printf("%s\n", kind_name(LABEL_COLD));

    char pin[8] = "4711";                  /* printer service PIN */
    memset_explicit(pin, 0, sizeof pin);   /* not removed by the optimizer */
    printf("pin[0] = %d\n", pin[0]);
    return 0;
}`, "c23_tour.c"),
        code("text", `
flags = 260 = 0x104 = 0b100000100
bits set: 2
sku="" grams=0 fragile=0 counts[6]=0
cold
pin[0] = 0`),
        bullets([
            "**`static_assert(condition);`** checks a constant condition at compile time. It is a keyword now and the message is optional. Use it to write down assumptions such as \"an `int` has 4 bytes\" (true here, implementation-defined in general).",
            "**Digit separators** `1'000'000` and **binary literals** `0b1'0000'0100` make sizes, amounts and bit masks readable. The separator `'` is ignored by the compiler. `printf` gained `%b` for binary output in C23 (glibc supports it; `%#b` adds the `0b` prefix).",
            "**`= {}`** initializes every member and element to zero (null for pointers, `false` for `bool`), exactly like a static object. Before C23 you had to write `= {0}`.",
            "**`unreachable()`** from `<stddef.h>` tells the compiler a point can never be reached, so it may optimize as if it is true. Reaching it anyway is **undefined behaviour**, not a guaranteed crash. With `-fsanitize=undefined`, calling `kind_name` with the value 5 (say, a corrupted byte from a config file) reports `runtime error: execution reached an unreachable program point`. Use it only after you have handled every valid case.",
            "**`memset_explicit(p, c, n)`** from `<string.h>` is a `memset` that the compiler must not remove. A plain `memset` on a buffer that is never read again is a \"dead store\", and the optimizer may delete it: in a function that zeroes a local PIN buffer before returning, `gcc -O2` emits no `memset` at all, while `memset_explicit` stays as a call. Use it to wipe passwords, PINs and keys. The glibc 2.43 used here provides it; an older C library may not have it yet, even with `-std=c23`.",
            "**`<stdbit.h>`** adds bit utilities such as `stdc_count_ones` (how many bits are set) and `stdc_bit_width`. **`#embed \"logo.bin\"`** inside an array initializer includes a file's bytes at compile time, for example a printer logo. Both are good to know; you will meet them in later courses.",
        ]),
        p("Check that you can predict what these replacements really do:"),
        challenge("chal_quiz_cf_421"),

        h2("9. The fix: the header in C23"),
        p("The modernized header has no text macros except the include guard. Every constant is a typed `constexpr` object, the flags are binary literals, the flag test returns a real `bool`, and the print function's result cannot be ignored by accident:"),
        code("c", `
/* label.h - modernized for C23 */
#ifndef LABEL_H
#define LABEL_H

constexpr int LABEL_MAX = 32 + 1;          /* 32 characters + the terminator */
constexpr unsigned FLAG_EXPRESS = 0b0000'0100;
constexpr unsigned FLAG_FRAGILE = 0b1'0000'0000;
static_assert(LABEL_MAX * 2 == 66);

struct label {
    char sku[LABEL_MAX];
    int  grams;
    bool fragile;
};

[[nodiscard]] static inline bool has_flag(unsigned flags, unsigned flag)
{
    return (flags & flag) != 0;
}

[[nodiscard]] int print_label(const struct label *l);

#endif`, "label.h"),
        code("c", String.raw`
/* print.c */
#include <stdio.h>
#include "label.h"

int print_label(const struct label *l)
{
    if (l == nullptr)
        return -1;
    int n = printf("%-*s %6d g%s\n", LABEL_MAX - 1, l->sku, l->grams, l->fragile ? "  HANG LE VO" : "");
    return n < 0 ? -1 : 0;
}

/* main.c */
#include <stdio.h>
#include "label.h"

int main(void)
{
    unsigned flags = FLAG_FRAGILE | FLAG_EXPRESS;     /* order LM-1042 */
    struct label l = {};
    snprintf(l.sku, sizeof l.sku, "%s", "MUG-01");
    l.grams = 350;
    l.fragile = has_flag(flags, FLAG_FRAGILE);

    char two_lines[LABEL_MAX * 2];
    printf("fragile=%d sizeof two_lines=%zu\n", l.fragile, sizeof two_lines);
    if (print_label(&l) != 0)
        return 1;
    return 0;
}`, "print.c + main.c"),
        code("text", `
$ gcc -std=c23 -Wall -Wextra -g main.c print.c -o label && ./label
fragile=1 sizeof two_lines=66
MUG-01                              350 g  HANG LE VO`),
        numbered([
            "**`bool` plus `!= 0`** turns the FRAGILE bit into exactly `true`, whatever bit position a flag uses. Callers write `if (l.fragile)`, never `== TRUE`.",
            "**`constexpr int LABEL_MAX`** is one typed value: `LABEL_MAX * 2` is 66 everywhere, and `static_assert` stops the build if someone edits it into something else.",
            "**Binary literals with separators** show which bit each flag uses; a `constexpr` flag that does not fit its type is a compile error, not a silent 0.",
            "**`nullptr`** in the pointer check, and **`= {}`** so a label never starts with garbage bytes (lesson 2.2).",
            "**`[[nodiscard]]`** on `print_label` makes \"we never checked whether the print worked\" a warning. `static inline` lets the small helper live in the header.",
            "The two files were built together with `-fsanitize=address,undefined` too: same output, no reports. Both include the header, and the `constexpr` objects do not clash at link time because they have internal linkage.",
        ]),

        h2("10. Pitfalls"),
        bullets([
            "**Old headers still define `TRUE`, `FALSE` or `BOOL`.** In C23 `bool`, `true` and `false` are keywords, so a header that declares `typedef int bool;` or `enum { false, true };` uses keywords as names and stops compiling with `-std=c23`. Delete those lines rather than renaming around them, and grep for `== TRUE`.",
            "**`bool` fixes storage, not logic.** `bool fragile = flags & FLAG_COLD;` compiles fine and tests the wrong bit. Name flags clearly and test them in one helper.",
            "**`constexpr` is not `const`.** Only `constexpr` (or a literal, or an `enum` constant) gives you a constant expression for a file-scope array size, a `case` label or a `static_assert`.",
            "**`auto` copies C's type rules, surprises included.** In C a character literal such as `'A'` has type `int`, an integer literal too large for `int` becomes `long`, and `1 / 2` is the `int` 0. `auto` keeps all of that; it does not guess what you meant.",
            "**`NULL` is fine for ordinary pointer parameters**, because the compiler converts it. Prefer `nullptr` in new code anyway, and always use it (or a cast pointer) to end a variadic list.",
            "**`unreachable()` is a promise, not a check.** If the promise is false, the behaviour is undefined. For data from outside the program (a config file, a scanner), handle the bad value with an error message instead.",
            "**C23 needs a C23 toolchain.** `memset_explicit`, `%b` in `printf` and `<stdbit.h>` come from the C library, not the compiler: gcc 15 with an old glibc accepts `-std=c23` but may not provide them.",
        ]),

        h2("11. Checklist"),
        bullets([
            "Use `bool`, `true`, `false`; convert flags with `!= 0` or a plain `bool` assignment, and test with `if (x)`, never `x == TRUE`.",
            "Replace numeric `#define`s with `constexpr` objects; keep macros for include guards and `#if`.",
            "Write `nullptr` for null pointers, and always for the sentinel at the end of a variadic list.",
            "Use `typeof` in type-generic macros and `typeof_unqual` when you need a modifiable copy of a `const` value; use `auto` only where the type is obvious.",
            "Mark functions whose result must be checked with `[[nodiscard]]`; silence a deliberate ignore with `(void)`.",
            "Write assumptions down with `static_assert(...)`; initialize with `= {}`; wipe secrets with `memset_explicit`.",
            "Build with `-std=c23 -Wall -Wextra`, add `-Wconversion` when you hunt truncation bugs, and run tests with `-fsanitize=address,undefined`.",
        ]),

        h2("12. Where next"),
        p("This was the last lesson of C Foundations. You can now reason about types and overflow, arrays and off-by-one errors, pointers, strings and their terminators, `malloc` and `free`, structs and growable arrays, safe input parsing and modern C23. The follow-up course **C Systems Programming** takes these programs from the scanner into the operating system: reading and writing files with error handling, starting and waiting for processes, talking to the label printers over sockets, and running work in parallel with threads - with the same habit of reproducing every bug first and checking it with the sanitizers."),
    ],
});
