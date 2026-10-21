// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - test cases and the solution live in challenges.json / challenges/ (-> Postgres).
// Every C block that contains a backslash uses String.raw, so "\n" and '\0' reach Sanity as typed.
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-cf-4-1",
    title: "Reading input safely: fgets, strtol",
    slug: { _type: "slug", current: "c-reading-input-safely-fgets-strtol" },
    description:
        "An operator types \"12a\" at the quantity prompt of scanner SCN-07 and the program prints \"invalid, try again\" forever; another scans a barcode into the same prompt and 1250 units are booked. Learn why scanf(\"%d\") and atoi cannot be trusted with input, how to read whole lines with fgets (and what it does with the newline and with long lines), and how to convert and validate numbers with strtol, endptr, errno and a range check.",
    estimatedTime: 22,

    scenario: {
        role: "Junior C developer on Lotus Mart's warehouse tools team",
        problem:
            "The receiving program on the handheld scanners asks for a quantity after each scanned item: \"qty> \". On Monday SCN-07 froze: an operator typed \"12a\" by mistake, and the screen filled with \"invalid, try again\" until someone pulled the battery. On Tuesday the night report showed 1250 units of TEA-500 received for an order of 12: an operator had scanned the product barcode while the cursor was in the quantity field. The quantity is read with scanf(\"%d\", &qty) and checked with if (qty < 1 || qty > 9999). The check is there. It never sees what was typed.",
    },

    content: [
        h2("1. The incident: a frozen scanner and 1250 boxes of tea"),
        p("This is the quantity prompt from the receiving program, cut down to the part that matters:"),
        code("c", String.raw`
#include <stdio.h>

int main(void) {
    int qty;
    while (true) {                           // one quantity per scanned item
        printf("qty> ");
        if (scanf("%d", &qty) != 1) {        // scanf returns how many values it stored
            printf("invalid, try again\n");
            continue;
        }
        if (qty < 1 || qty > 9999) {
            printf("out of range, try again\n");
            continue;
        }
        printf("booked %d units\n", qty);
    }
}`, "receive.c"),
        p("It looks careful: it checks what `scanf` returns and it checks the range. Two incidents in one week say otherwise. After \"12a\" the scanner printed \"invalid, try again\" in an endless loop. After the barcode `8933531976930` was scanned into the field, it booked 1250 units without any message. Nothing crashed, nothing was logged, and the range check passed."),

        h2("2. Reproduce it"),
        p("Here is the same loop limited to 4 rounds, plus two calls to `atoi` (\"ASCII to int\", from `<stdlib.h>`), which the label printer code uses for the same job. Save it as `repro.c`, compile with `gcc -std=c23 -Wall -Wextra -g repro.c -o repro` and feed it input with `printf`:"),
        code("c", String.raw`
#include <stdio.h>
#include <stdlib.h>

int main(void) {
    int qty = 0;
    for (int round = 1; round <= 4; round++) {   // the scanner loops forever; 4 rounds here
        printf("qty> ");
        int got = scanf("%d", &qty);
        if (got != 1) {
            printf("scanf returned %d, invalid, try again\n", got);
            continue;
        }
        if (qty < 1 || qty > 9999) {
            printf("out of range, try again\n");
            continue;
        }
        printf("booked %d units\n", qty);
    }
    printf("atoi(\"12kg\") = %d, atoi(\"abc\") = %d\n", atoi("12kg"), atoi("abc"));
}`, "repro.c"),
        code("text", `
$ printf '12a\\n' | ./repro
qty> booked 12 units
qty> scanf returned 0, invalid, try again
qty> scanf returned 0, invalid, try again
qty> scanf returned 0, invalid, try again
atoi("12kg") = 12, atoi("abc") = 0

$ printf '8933531976930\\n' | ./repro
qty> booked 1250 units
qty> scanf returned -1, invalid, try again
qty> scanf returned -1, invalid, try again
qty> scanf returned -1, invalid, try again
atoi("12kg") = 12, atoi("abc") = 0`),
        p("Four separate bugs are in this output:"),
        numbered([
            "**\"12a\" booked 12.** `%d` reads digits for as long as it can and stops at `a`. It does not care what follows the number.",
            "**The `a` is never removed.** When a conversion fails, `scanf` returns 0 and leaves the bad character in the input. The next call sees the same `a`, fails again, and so on forever. That is the frozen SCN-07.",
            "**End of input loops too.** At the end of input `scanf` returns `EOF` (the macro `EOF` is a negative `int`, -1 here). `!= 1` treats it like bad input and asks again, forever.",
            "**The barcode became 1250.** `8933531976930` does not fit in an `int` (`INT_MAX` is 2147483647, lesson 1.1). The C standard says: if the result of a `%d` conversion cannot be represented in the `int`, the behaviour is **undefined**. glibc happened to store the low 32 bits, which are 1250, so the range check saw a perfectly normal quantity. A different C library may store something else; UB means the standard promises nothing.",
        ]),
        p("`atoi` has the same holes with fewer return values: `\"12kg\"` gives 12, `\"abc\"` gives 0, and you cannot tell \"0\" from \"not a number\". It has no way to report an error, and a value that does not fit is UB as well. Sanitizers do not help here: the overflow happens inside the C library, and UBSan only instruments your own code. Running `repro` with `-fsanitize=address,undefined` prints exactly the same output."),
        callout("warning", "The rule",
            "Never convert input straight from the stream. Read one whole line into a buffer, then convert the text with a function that tells you how many characters it used and whether the value fit. In C that is fgets plus strtol."),

        h2("3. Read a whole line: fgets"),
        p("Reading a line first fixes the stuck input for free: whatever the line contains, it is consumed, and the next read starts at the next line. The obvious function for that, `gets(buf)`, cannot be used safely at all: it is not told how big `buf` is, so a long line writes past the end of the array (a buffer overflow, lesson 2.2). It was deprecated in 2007 (a correction to C99) and **removed from the language in C11**. With `-std=c23` glibc does not even declare it, and gcc 15 refuses to compile the call:"),
        code("text", `
main.c: In function ‘main’:
main.c:5:5: error: implicit declaration of function ‘gets’; did you mean ‘fgets’? [-Wimplicit-function-declaration]
    5 |     gets(line);
      |     ^~~~`),
        p("`fgets(buf, size, stream)` is the bounded version. `stream` is a `FILE *`; `stdin` is the standard input. Its rules are short and you need all of them:"),
        bullets([
            "It reads **at most `size - 1` characters** and always adds a `'\\0'`, so it never writes past `buf[size - 1]`.",
            "It stops after the newline and **keeps the `'\\n'`** in the buffer: the line `TEA-500` arrives as `\"TEA-500\\n\"`.",
            "If the line is longer than `size - 1` characters, it stops early **without** a `'\\n'`. The rest of the line stays in the stream, and the next `fgets` returns it as if it were a new line.",
            "It returns `buf` on success and a null pointer at end of input (or on a read error) when it read nothing. Test it with `!= nullptr` (or `!= NULL`).",
            "The last line of a file may have no `'\\n'` at all, so \"no newline\" alone does not prove the line was cut.",
        ]),
        p("See it with a deliberately tiny buffer. The program prints every chunk `fgets` returns, with the newline shown as `\\n`:"),
        code("c", String.raw`
#include <stdio.h>
#include <string.h>

int main(void) {
    char buf[8];                        // room for 7 characters + '\0'
    int call = 0;
    while (fgets(buf, sizeof buf, stdin) != nullptr) {
        call++;
        printf("call %d: len=%zu [", call, strlen(buf));
        for (char *c = buf; *c != '\0'; c++) {
            if (*c == '\n') printf("\\n");     // show the newline as \n
            else putchar(*c);
        }
        printf("]\n");
    }
}`, "split.c"),
        code("text", `
$ printf 'TEA-500\\nLM-1042-EXPRESS\\n42\\nSCN-07' | ./split
call 1: len=7 [TEA-500]
call 2: len=1 [\\n]
call 3: len=7 [LM-1042]
call 4: len=7 [-EXPRES]
call 5: len=2 [S\\n]
call 6: len=3 [42\\n]
call 7: len=6 [SCN-07]`),
        p("Three lessons in seven calls. `TEA-500` has exactly 7 characters, so it filled the buffer and its newline came back alone in call 2, as an \"empty line\". `LM-1042-EXPRESS` was split into three pieces, and a program that treats every chunk as a line would process `-EXPRES` as a second order id. And `SCN-07`, the last line, has no newline because the input ended. `sizeof buf` is right here because `buf` is a real array; inside a function that receives `char *buf`, `sizeof buf` is the size of a pointer (8), so pass the size as a parameter."),

        h2("4. Strip the newline, detect a line that did not fit"),
        p("`strcspn(s, \"\\n\")` (from `<string.h>`) returns the number of characters at the start of `s` that are **not** in the second string: the index of the first `'\\n'`, or the length of `s` if there is none. Writing `'\\0'` at that index removes the newline when there is one and does nothing harmful when there is not:"),
        code("c", String.raw`
#include <stdio.h>
#include <string.h>

int main(void) {
    char a[16] = "TEA-500\n";            // what fgets stores for a normal line
    char b[16] = "SCN-07";               // last line of a file without '\n'
    printf("%zu %zu\n", strcspn(a, "\n"), strcspn(b, "\n"));   // 7 6
    a[strcspn(a, "\n")] = '\0';          // replaces the '\n'
    b[strcspn(b, "\n")] = '\0';          // overwrites the '\0' with '\0': harmless
    printf("[%s] [%s]\n", a, b);         // [TEA-500] [SCN-07]
}`, "strip.c"),
        p("The same index tells you whether the whole line fit. If `buf[len]` is `'\\n'`, it did. If not, either the line was too long or it was the last line without a newline. Read one more character to find out: a `'\\n'` or `EOF` means the line fit (exactly, or at the end of input); anything else means it was cut, and you must read and discard the rest up to the newline, or the tail comes back as the next \"line\". `fgetc(stream)` returns the next character as an `int`, or `EOF`, which is why `c` is an `int` and not a `char`."),
        p("An `enum` gives the three outcomes names. `enum line_status { LINE_OK, LINE_TOO_LONG, LINE_EOF };` declares a type whose values are named integer constants (0, 1, 2); it reads better than returning magic numbers:"),
        code("c", String.raw`
#include <stdio.h>
#include <string.h>

enum line_status { LINE_OK, LINE_TOO_LONG, LINE_EOF };

// Reads one line into buf without its '\n'. A longer line is discarded up to its '\n'.
static enum line_status read_line(char *buf, size_t size, FILE *in) {
    if (fgets(buf, (int)size, in) == nullptr)
        return LINE_EOF;                     // end of input (or a read error)
    size_t len = strcspn(buf, "\n");
    if (buf[len] == '\n') {                  // the whole line fit
        buf[len] = '\0';
        return LINE_OK;
    }
    int c = fgetc(in);                       // no '\n' in buf: what comes next?
    if (c == '\n' || c == EOF)
        return LINE_OK;                      // it fit exactly, or it was the last line
    while (c != '\n' && c != EOF)            // too long: throw away the rest of the line
        c = fgetc(in);
    return LINE_TOO_LONG;
}`, "read_line.c"),
        p("`static` here means the function is private to this file. The `(int)size` cast is needed because `fgets` takes its size as an `int`, not a `size_t`. Report a cut line as an error; never silently use its first half, or `LM-1042-EXPRESS` becomes order `LM-1042`."),

        h2("5. Convert the text: strtol, endptr and errno"),
        p("`long strtol(const char *s, char **endptr, int base)` (from `<stdlib.h>`) converts the start of `s` to a `long` and tells you two things `atoi` never could:"),
        bullets([
            "**Where it stopped.** You pass the address of a `char *` variable (`&end`, so `endptr` has type `char **`: a pointer to a pointer). `strtol` stores in `end` a pointer to the first character it did **not** use. If it found no number at all, `end` is set to `s` itself.",
            "**Whether the value fit.** If the number is too big for a `long`, `strtol` returns `LONG_MAX` (or `LONG_MIN` for a too-negative number) and sets `errno` to `ERANGE`. `errno` is a global error code from `<errno.h>`. Library functions only **set** it on error and never clear it, so you set `errno = 0` yourself right before the call.",
        ]),
        p("What `strtol` accepts: first any amount of whitespace (spaces, tabs, `'\\n'`...), then an optional `+` or `-`, then digits. It stops at the first character that cannot continue the number. **Always pass base 10** for quantities: base 0 means \"guess from the prefix\", so `\"0x1A\"` becomes 26 and `\"010\"` becomes 8 (octal), which is not what an operator who typed a leading zero meant. Here is what it does with the inputs from the incident and more (`used` is `end - s`, the number of characters consumed; `long` is 64 bits on x86-64 Linux):"),
        code("c", String.raw`
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>

static void show(const char *s) {
    char *end;
    errno = 0;                              // strtol only SETS errno on error
    long v = strtol(s, &end, 10);
    int err = errno;                        // save it before printf can change it
    char quoted[32];
    snprintf(quoted, sizeof quoted, "\"%s\"", s);
    printf("%-24s -> %20ld  used %2td  rest \"%s\"%s\n",
           quoted, v, end - s, end, err == ERANGE ? "  ERANGE" : "");
}

int main(void) {
    const char *inputs[] = {
        "42", "  42", "+42", "-1", "0042", "42 ", "12a", "12kg", "0x1A",
        "abc", "", "-", "99999999999999999999", "-99999999999999999999",
    };
    for (size_t i = 0; i < sizeof inputs / sizeof inputs[0]; i++)
        show(inputs[i]);
}`, "strtol_table.c"),
        code("text", `
"42"                     ->                   42  used  2  rest ""
"  42"                   ->                   42  used  4  rest ""
"+42"                    ->                   42  used  3  rest ""
"-1"                     ->                   -1  used  2  rest ""
"0042"                   ->                   42  used  4  rest ""
"42 "                    ->                   42  used  2  rest " "
"12a"                    ->                   12  used  2  rest "a"
"12kg"                   ->                   12  used  2  rest "kg"
"0x1A"                   ->                    0  used  1  rest "x1A"
"abc"                    ->                    0  used  0  rest "abc"
""                       ->                    0  used  0  rest ""
"-"                      ->                    0  used  0  rest "-"
"99999999999999999999"   ->  9223372036854775807  used 20  rest ""  ERANGE
"-99999999999999999999"  -> -9223372036854775808  used 21  rest ""  ERANGE`),
        p("Read the table by the `rest` column, not by the value. The value is `0` for `\"0x1A\"`, `\"abc\"`, `\"\"` and `\"-\"`, exactly as it would be for a real `\"0\"`. What tells them apart is `end`: for `\"abc\"`, `\"\"` and `\"-\"` it did not move (`used 0`, no digits at all); for `\"0x1A\"` it moved past the `0` and stopped at `x`. In base 10, `\"0x1A\"` is the number 0 followed by the garbage `x1A`. `%td` is the `printf` format for a `ptrdiff_t`, the type of a pointer difference (lesson 2.1)."),
        image("where-strtol-stops", {
            alt: "Three rows, each showing the 8 cells [0] to [7] of char line[8] after fgets, with arrows for line (the start) and end (where strtol stopped). Row 1, red: \"12a\" after the newline was stripped - cells 1, 2, a, \\0 (marked 'was \\n'), \\0, then three unused cells; line points at [0], end points at [2] which holds 'a'; v = 12, errno = 0, end - line = 2, *end is 'a', which is neither whitespace nor '\\0': reject, trailing characters. Row 2, green: \"  42\\n\" straight from fgets, not stripped - cells space, space, 4, 2, \\n, \\0, two unused; line points at [0], end points at [4], the '\\n'; v = 42, errno = 0, end - line = 4; skipping whitespace from end passes the '\\n' and reaches '\\0': ok, the whole line was a number. Row 3, red: \"\" an empty line after stripping - cells \\0 (was \\n), \\0, six unused; line and end both point at [0]; v = 0 and errno = 0 look like a valid zero, but end == line means no digits were read: reject, no number at all. Footer: checks in order - end == line means no number; after skipping spaces *end must be '\\0'; then errno == ERANGE and the min..max range.",
            caption: "The value alone cannot tell \"0\" from \"nothing\" or \"12\" from \"12a\". The end pointer can.",
        }),

        h2("6. Decide the policy, then range-check before you narrow"),
        p("`strtol` tells you facts; your code decides what is acceptable. For the warehouse the team wrote down this policy:"),
        bullets([
            "**No digits** (`end == s`) is an error. This catches `\"\"`, `\"abc\"`, `\"-\"`.",
            "**Leading whitespace and a sign** are accepted, because `strtol` accepts them: `\" 42\"` and `\"+42\"` are 42, and `\"-1\"` is the number -1, which the range check then rejects.",
            "**Trailing whitespace is accepted**, anything else after the number is an error. Some scanners send `\"42\\r\\n\"` (Windows line endings); after the `'\\n'` is stripped, the `'\\r'` is whitespace and should not reject a good quantity. `\"12a\"`, `\"1 2\"` and `\"0x1A\"` are rejected.",
            "**`errno == ERANGE`** is an error, then the value must be within the allowed range.",
        ]),
        p("To skip whitespace use `isspace` from `<ctype.h>`, and cast the `char` to `unsigned char` first: `isspace((unsigned char)*end)`. The `<ctype.h>` functions are only defined for values of `unsigned char` and `EOF`, and on x86-64 a plain `char` holding a byte above 127 (a UTF-8 byte of \"Bình Dương\", say) is negative, which is UB."),
        p("The range check must happen **on the `long`, before you store into a smaller type**. Converting a `long` that does not fit into an `int` is not UB, but the result is implementation-defined; gcc keeps the low 32 bits. So `4294967338` (2^32 + 42) fits in a 64-bit `long`, raises no `ERANGE`, and silently becomes 42 if you narrow first:"),
        code("c", String.raw`
#include <stdio.h>
#include <stdlib.h>

int main(void) {
    char *end;
    long big = strtol("4294967338", &end, 10);   // 2^32 + 42, fits in a 64-bit long
    int qty = big;                                // narrowing: not checked first
    printf("long %ld -> int %d\n", big, qty);     // long 4294967338 -> int 42
}`, "narrow.c"),
        p("`-Wall -Wextra` does not warn about `int qty = big;`. `-Wconversion` does (\"conversion from ‘long int’ to ‘int’ may change value\"), which is a good reason to try it on input-handling code. With the policy settled, the reusable helper is short. It returns `true` and stores the value only when the whole string is one number within `[min, max]`:"),
        code("c", String.raw`
#include <ctype.h>
#include <errno.h>
#include <stdlib.h>

// Policy: spaces around the number are allowed (" 42", "42 ", "42\r"); anything else is not.
static bool parse_long(const char *s, long min, long max, long *out) {
    char *end;
    errno = 0;                               // strtol sets errno only on error
    long v = strtol(s, &end, 10);
    if (end == s)                            // no digits: "", "abc", "-"
        return false;
    while (isspace((unsigned char)*end))
        end++;
    if (*end != '\0')                        // something after the number: "12a", "1 2", "0x1A"
        return false;
    if (errno == ERANGE || v < min || v > max)
        return false;
    *out = v;
    return true;
}`, "parse_long.c"),
        p("Why check `ERANGE` when the range check would reject `LONG_MAX` anyway? Because the helper is generic: called with `max = LONG_MAX`, the clamped `LONG_MAX` from `\"99999999999999999999\"` would pass the range check and be accepted as a real value. The out-parameter `out` is only written on success, so the caller's variable keeps its old value on an error. Now write a version that also says **why** a line was rejected, which is what the operator needs to see on the scanner screen:"),
        challenge("chal_coding_cf_411", "Do the checks in the order the header lists them: first look for any non-whitespace character at all, then call strtol and compare end with the start of the line, then skip whitespace from end and look for '\\0', and only then look at errno and the range - on the long, before you convert to int."),

        h2("7. The fix"),
        p("The receiving program now reads a line, rejects lines that are too long, parses with the helper and only narrows to `int` after the range check. The quantity buffer is 16 characters: far more than `9999` needs, small enough that a scanned barcode with its 13 digits still fits and is rejected by the range check with a clear message, and longer garbage is reported as too long:"),
        code("c", String.raw`
#include <ctype.h>
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

enum line_status { LINE_OK, LINE_TOO_LONG, LINE_EOF };

static enum line_status read_line(char *buf, size_t size, FILE *in);   // section 4
static bool parse_long(const char *s, long min, long max, long *out);  // section 6

int main(void) {
    char line[16];
    long qty = 0;
    while (true) {
        printf("qty> ");
        fflush(stdout);                      // show the prompt before waiting for input
        enum line_status st = read_line(line, sizeof line, stdin);
        if (st == LINE_EOF) {
            printf("no quantity entered\n");
            return 1;
        }
        if (st == LINE_TOO_LONG) {
            printf("line too long, try again\n");
            continue;
        }
        if (!parse_long(line, 1, 9999, &qty)) {
            printf("\"%s\" is not a quantity 1..9999, try again\n", line);
            continue;
        }
        break;
    }
    int units = (int)qty;                    // safe: 1..9999 fits in an int
    printf("booked %d units\n", units);
}

// ... read_line and parse_long exactly as above ...`, "receive.c"),
        code("text", `
$ printf '12a\\nabc\\n\\n8933531976930\\n12kg\\nTEA-500-TEA-500-TEA-500\\n 42 \\n' | ./receive
qty> "12a" is not a quantity 1..9999, try again
qty> "abc" is not a quantity 1..9999, try again
qty> "" is not a quantity 1..9999, try again
qty> "8933531976930" is not a quantity 1..9999, try again
qty> "12kg" is not a quantity 1..9999, try again
qty> line too long, try again
qty> booked 42 units`),
        numbered([
            "**`read_line` consumes the whole line**, good or bad, so a typo can never get stuck in the input. The frozen-scanner loop is gone.",
            "**End of input ends the program** with an exit code of 1 instead of looping; `fgets` returning a null pointer is the signal.",
            "**A cut line is an error**, and the rest of it is discarded, so its tail cannot pose as the next answer.",
            "**`strtol` with `end`, `errno` and base 10** rejects `\"12a\"`, `\"12kg\"`, `\"abc\"` and the empty line, and turns the barcode into a range error instead of UB.",
            "**The range check runs on the `long`**, and the cast to `int` comes after it, when it cannot change the value.",
            "`fflush(stdout)` makes sure the prompt is on the screen before the program waits: output to a terminal is line-buffered, and `\"qty> \"` has no newline.",
        ]),
        p("Compiled with `-fsanitize=address,undefined`, the fixed program prints the same lines and no sanitizer report, for every input above."),

        h2("8. Pitfalls"),
        bullets([
            "**Forgetting `errno = 0`.** A successful call does not reset `errno`. After `strtol(\"99999999999999999999\", ...)`, a later `strtol(\"42\", ...)` returns 42 and `errno` is **still** `ERANGE`, so a correct quantity is rejected as out of range. Set it to 0 right before every call, and read it right after (any library call in between, `printf` included, may change it).",
            "**Using `end` without checking `end == s`.** For `\"abc\"`, `end` points at `a` and your trailing-characters check fires, which is the wrong message; for `\"\"` the trailing check passes and you accept 0. Test \"no digits\" first.",
            "**`sizeof` on a pointer parameter.** `fgets(buf, sizeof buf, in)` inside a function that received `char *buf` passes 8, not the buffer size. Pass the size along, like `read_line` does.",
            "**Mixing `scanf` and `fgets`.** `scanf(\"%d\")` leaves the `'\\n'` after the number in the input, so the next `fgets` returns an empty line immediately. Use `fgets` for every read and convert afterwards.",
            "**Base 0 or base 8 surprises.** With base 0, `\"010\"` is 8 and `\"0x1A\"` is 26. Use base 10 unless the format really allows other bases.",
            "**`atoi`, `atol` and `sscanf(\"%d\")`** have the same problems as `scanf`: no way to report trailing garbage reliably, and UB when the number does not fit. Use `strtol`/`strtoll` (and `strtoul`/`strtoull` for unsigned, which accept a `-` sign and negate the value, so check for `-` yourself).",
        ]),

        h2("9. Checklist"),
        bullets([
            "Read input one line at a time with `fgets(buf, size, stream)`; never `gets` (removed in C11), never `scanf` straight into a number.",
            "Strip the newline with `buf[strcspn(buf, \"\\n\")] = '\\0'`; treat a missing newline as \"too long\" unless the next character is `'\\n'` or `EOF`, and discard the rest of a long line.",
            "Convert with `strtol(s, &end, 10)` after `errno = 0`.",
            "Reject when `end == s` (no digits), when anything except whitespace follows the number, and when `errno == ERANGE`.",
            "Write the whitespace policy down, and use `isspace((unsigned char)c)`.",
            "Range-check the `long` before you narrow it to `int` or any smaller type; turn on `-Wconversion` to find silent narrowings.",
            "Write the result through an out-parameter only on success, and give the user a message that says what was wrong.",
        ]),
    ],
});
