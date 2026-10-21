// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// C code blocks with backslashes use String.raw, so "\n" and '\0' reach Sanity as typed.
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-cf-2-2",
    title: "Strings: terminators & buffer overflows",
    slug: { _type: "slug", current: "c-strings-terminators-buffer-overflows" },
    description:
        "A shipping label for Nguyễn Thị Phương Thảo prints her name in full and the city as \"g Thao\", and the quick fix with strncpy prints garbage after the name instead. Learn what a C string really is (a char array that ends at the first '\\0'), why strlen and sizeof differ, why string literals are read-only and == does not compare text, and how to copy and format into fixed buffers with snprintf and memcpy so the result always fits, always terminates and tells you when it was cut.",
    estimatedTime: 22,

    scenario: {
        role: "Junior C developer on Lotus Mart's warehouse tools team (label printers)",
        problem:
            "The label printers in the Bình Dương warehouse run a small C program that fills a fixed layout: a 16-byte name field and a 16-byte city field. Order LM-1042 for Nguyễn Thị Phương Thảo came out with her full name and the city \"g Thao\" instead of \"Binh Duong\", and the parcel went to the wrong sorting lane. A colleague replaced strcpy with strncpy; now the label reads \"Nguyen Thi PhuonBinh Duong\". You have to make every field fit, stay terminated and report when a value was cut.",
    },

    content: [
        h2("1. The incident: a name that eats the city"),
        p("The printer program sends ASCII to the label head, so names arrive without accents. Two orders from this morning's batch printed like this:"),
        code("text", `
LM-1041 | NAME: Tran Van An | CITY: Thu Duc
LM-1042 | NAME: Nguyen Thi Phuong Thao | CITY: g Thao`),
        p("The sorter reads the CITY field, found no lane called \"g Thao\" and dropped LM-1042 into the manual bin. Look closely: \"g Thao\" is the **end of the customer's name**. The name has 22 letters, its field has 16 bytes, and the rest of the name went somewhere it did not belong."),
        p("A colleague's quick fix switched to `strncpy`, which takes a size. The city came back, but the name did not:"),
        code("text", `
LM-1042 | NAME: Nguyen Thi PhuonBinh Duong | CITY: Binh Duong`),
        p("Both versions are bugs in how C stores text. To fix them you need to know exactly where a C string ends."),

        h2("2. Reproduce it"),
        p("The label code fills two local arrays and prints them. `char name[16];` is an array of 16 `char` (1 byte each, lesson 1.1). `strcpy(dst, src)` from `<string.h>` copies the text at `src` into `dst`. Save as `repro.c`:"),
        code("c", String.raw`
#include <stdio.h>
#include <string.h>

void print_label(const char *order_id, const char *customer, const char *town)
{
    char name[16];
    char city[16];

    strcpy(city, town);
    strcpy(name, customer);
    printf("%s | NAME: %s | CITY: %s\n", order_id, name, city);
}

int main(void)
{
    print_label("LM-1041", "Tran Van An", "Thu Duc");
    print_label("LM-1042", "Nguyen Thi Phuong Thao", "Binh Duong");
    return 0;
}`, "repro.c"),
        p("Compiled without optimization (`gcc -std=c23 -Wall -Wextra -g -O0 repro.c -o repro`), gcc prints **no warning**, and the program reproduces the label exactly:"),
        code("text", `
$ ./repro
LM-1041 | NAME: Tran Van An | CITY: Thu Duc
LM-1042 | NAME: Nguyen Thi Phuong Thao | CITY: g Thao`),
        p("`strcpy` has no idea how big `name` is. It copies characters until the end of the source, 23 bytes in total, into a 16-byte array. Writing past the end of an array is **undefined behaviour** (UB, lesson 1.2): the C standard says nothing about what happens next. On this build `city` happens to sit right after `name` on the stack, so the 7 extra bytes overwrote the start of the city. Build the same file with `-O2` and the result changes completely:"),
        code("text", `
$ gcc -std=c23 -Wall -Wextra -g -O2 repro.c -o repro && ./repro
*** buffer overflow detected ***: terminated
Aborted (core dumped)`),
        p("This distribution's gcc enables the C library's **fortify** checks at `-O2`, which replace `strcpy` with a version that knows the destination size and aborts. That is luck, not a guarantee: another compiler, another layout or a size known only at run time, and the overflow silently corrupts something else. The reliable way to catch it while testing is AddressSanitizer:"),
        code("text", `
$ gcc -std=c23 -Wall -Wextra -g -O0 -fsanitize=address,undefined repro.c -o repro && ./repro
==ERROR: AddressSanitizer: stack-buffer-overflow on address 0x7987d26d00b0 ...
WRITE of size 23 at 0x7987d26d00b0 thread T0
    #0 0x... in strcpy
    #1 0x... in print_label repro.c:10
    #2 0x... in main repro.c:17

Address 0x7987d26d00b0 is located in stack of thread T0 at offset 48 in frame
    #0 0x... in print_label repro.c:5

  This frame has 2 object(s):
    [32, 48) 'name' (line 6)
    [64, 80) 'city' (line 7) <== Memory access at offset 48 partially underflows this variable
SUMMARY: AddressSanitizer: stack-buffer-overflow repro.c:10 in print_label`),
        p("Read it from the top: a **WRITE of size 23** by `strcpy`, called from `print_label` line 10. `name` occupies offsets `[32, 48)` of the stack frame, and the write reaches offset 48, the first byte after it. ASan puts poisoned gaps (\"redzones\") between variables, which is why the bad byte is reported as near `city` even though it never got there this time. The line number and the variable names are what you need."),

        h2("3. What a C string really is"),
        p("C has no string type. A **string** is a sequence of `char` that ends with a byte of value 0, written `'\\0'` and called the **terminator** (or NUL). Functions such as `printf(\"%s\")`, `strlen` and `strcpy` receive only a pointer to the first char (lesson 2.1) and walk forward until they meet a `'\\0'`. Nothing else marks the end: not the size of the array, not the variable name."),
        code("c", String.raw`
#include <stdio.h>
#include <string.h>

void show(const char *s)
{
    printf("in show: sizeof s = %zu, strlen(s) = %zu\n", sizeof s, strlen(s));
}

int main(void)
{
    char sku[] = "TEA-500";          // the compiler counts: 7 letters + '\0'
    char field[16] = "TEA-500";      // 16 bytes, the unused ones are '\0'

    printf("sizeof sku = %zu, strlen(sku) = %zu\n", sizeof sku, strlen(sku));
    printf("sizeof field = %zu, strlen(field) = %zu\n", sizeof field, strlen(field));
    printf("sku[7] = %d\n", sku[7]);
    show(sku);

    sku[3] = '\0';                   // put a terminator in the middle
    printf("sku = \"%s\", strlen = %zu, sizeof = %zu\n", sku, strlen(sku), sizeof sku);
    return 0;
}`, "strings.c"),
        code("text", `
sizeof sku = 8, strlen(sku) = 7
sizeof field = 16, strlen(field) = 7
sku[7] = 0
in show: sizeof s = 8, strlen(s) = 7
sku = "TEA", strlen = 3, sizeof = 8`),
        bullets([
            "**`sizeof`** is decided by the compiler: the number of bytes of the array (8 and 16), or of the pointer inside `show` (8 on x86-64 Linux). It never looks at the contents.",
            "**`strlen`** runs at run time and counts the chars **before** the first `'\\0'`. The terminator is not counted, so a string of length n needs **n + 1 bytes**.",
            "`char sku[] = \"TEA-500\";` lets the compiler size the array, terminator included. `char field[16] = \"TEA-500\";` fills the remaining 9 bytes with zeros.",
            "After `sku[3] = '\\0'` the array still has 8 bytes, but the string is now `\"TEA\"`: the first terminator wins.",
            "Inside a function the parameter is only a pointer, so `sizeof s` cannot tell you the buffer size. That is why every function that **writes** into a buffer must also receive its capacity, exactly like arrays and their length in lesson 1.2.",
        ]),
        image("string-terminator-overflow", {
            alt: "Three rows of 32 byte cells: char name[16] (offsets 0-15) followed directly by char city[16] (offsets 16-31). Row 1, red, strcpy(name, customer): name holds N-g-u-y-e-n Thi Phuon, and the 7 extra bytes \"g Thao\" plus a '\\0' are marked red inside city, followed by the left-over \"ong\", a '\\0' and five never-written cells; the label prints CITY: g Thao. Row 2, red, strncpy(name, customer, 16): name holds exactly 16 chars with no '\\0', city holds \"Binh Duong\" followed by six '\\0' padding bytes; an arrow from name[0] to city[10] shows printf reading 26 bytes until the first '\\0', printing Nguyen Thi PhuonBinh Duong. Row 3, green, snprintf(name, sizeof name, \"%s\", customer) returns 22: name holds \"Nguyen Thi Phuo\" and a '\\0' in its last cell, city keeps \"Binh Duong\" and its '\\0', and 22 >= 16 tells the caller the name was cut.",
            caption: "A string ends at the first '\\0'. strcpy writes past the array, strncpy can leave no terminator, snprintf always fits and reports the full length.",
        }),

        h2("4. Literals are read-only, and == compares addresses"),
        h3("Never write into a string literal"),
        p("A **string literal** such as `\"TEA-500\"` is an array the compiler creates once for the whole program. Modifying it is UB. The catch: in C its type is `char[8]`, not `const char[8]`, so the compiler lets you point a plain `char *` at it:"),
        code("c", String.raw`
#include <stdio.h>

int main(void)
{
    char copy[] = "TEA-500";     // an array of 8 chars, initialized from the literal
    char *lit = "TEA-500";       // a pointer to the literal itself

    copy[0] = 't';               // fine: copy is our own array
    lit[0] = 't';                // UB: writes into a string literal
    printf("%s %s\n", copy, lit);
    return 0;
}`, "literal.c"),
        code("text", `
$ gcc -std=c23 -Wall -Wextra -g -O0 literal.c -o literal && ./literal
Segmentation fault (core dumped)

$ gcc ... -fsanitize=address,undefined literal.c -o literal && ./literal
==ERROR: AddressSanitizer: SEGV on unknown address 0x613b38788080 ...
==The signal is caused by a WRITE memory access.`),
        p("On Linux, gcc places literals in a read-only part of the program, so the write is stopped by the operating system (signal SIGSEGV) and nothing is printed. That is how this platform happens to react; the standard only says UB. Two habits prevent it: point at literals with `const char *` (then `lit[0] = 't'` is a compile error), and add `-Wwrite-strings`, which makes gcc treat literals as `const`:"),
        code("text", `
$ gcc -std=c23 -Wall -Wextra -Wwrite-strings -g -O0 literal.c -o literal
literal.c:6:17: warning: initialization discards 'const' qualifier from pointer target type [-Wdiscarded-qualifiers]`),
        h3("Compare text with strcmp, not =="),
        p("An array used in an expression becomes a pointer to its first element (lesson 2.1). So `==` on two strings compares two **addresses**, never the characters:"),
        code("c", String.raw`
#include <stdio.h>
#include <string.h>

int main(void)
{
    char scanned[8];
    strcpy(scanned, "TEA-500");          // pretend this came from the scanner

    if (scanned == "TEA-500")
        puts("==     : same");
    else
        puts("==     : different");

    if (strcmp(scanned, "TEA-500") == 0)
        puts("strcmp : same");

    printf("%d %d\n", strcmp("TEA-500", "TEA-600") < 0, strcmp("TEA", "TEA-500") < 0);
    return 0;
}`, "compare.c"),
        code("text", `
compare.c:9:17: warning: comparison with string literal results in unspecified behavior [-Waddress]
==     : different
strcmp : same
1 1`),
        p("`strcmp(a, b)` compares byte by byte and returns **0** when the strings are equal, a negative value when `a` sorts first and a positive value otherwise; only the sign is meaningful, not the number. `\"TEA\"` sorts before `\"TEA-500\"` because its terminator (0) is smaller than `'-'`. Always write `strcmp(a, b) == 0`: `if (strcmp(a, b))` reads as \"if equal\" and means the opposite."),

        h2("5. Copying into a fixed buffer"),
        p("Every copy into an array has to answer one question: **how many bytes does the destination have?** The classic functions answer it differently."),
        h3("strcpy and strcat: no limit at all"),
        p("`strcpy(dst, src)` writes `strlen(src) + 1` bytes; `strcat(dst, src)` appends `src` after the string already in `dst`, writing `strlen(dst) + strlen(src) + 1` bytes in total. Neither knows the size of `dst`, so neither can be made safe by the callee. Use them only when you have just checked that the result fits; for data from customers, scanners or files, use one of the bounded tools below."),
        h3("strncpy: bounded, but it may not terminate"),
        p("The colleague's fix used `strncpy(dst, src, n)`. It writes **exactly** `n` bytes: the source chars, then `'\\0'` padding if the source is shorter. If the source has `n` chars or more, it writes `n` chars and **no terminator**:"),
        code("c", String.raw`
    strncpy(city, town, sizeof city);
    strncpy(name, customer, sizeof name);     // copies at most 16 bytes
    printf("%s | NAME: %s | CITY: %s\n", order_id, name, city);`, "repro2.c"),
        code("text", `
LM-1042 | NAME: Nguyen Thi PhuonBinh Duong | CITY: Binh Duong

==ERROR: AddressSanitizer: stack-buffer-overflow on address 0x6ee259ad00b0 ...
READ of size 17 at 0x6ee259ad00b0 thread T0
    #0 0x... in printf_common
    ...
    #3 0x... in print_label repro2.c:11`),
        p("No write went out of bounds this time, but `name` is no longer a string. `printf(\"%s\")` kept reading past its 16 bytes until it found a `'\\0'`, and on this build that was the padding after \"Binh Duong\". Reading past an array is UB too; ASan reports it as a **READ** from `printf`. `strncpy` was designed for fixed-width record fields that are not strings, which is why its padding and missing terminator surprise everyone."),
        h3("snprintf: always fits, always terminates, reports the full length"),
        p("`snprintf(dst, size, format, ...)` from `<stdio.h>` works like `printf`, but into `dst`, and writes **at most `size` bytes including the terminator**. When `size > 0` the result is always terminated. Its return value is the key: the number of chars the **complete** output would have had (without the `'\\0'`), or a negative value on an encoding error. So `n >= size` means \"it was cut\":"),
        code("c", String.raw`
#include <stdio.h>
#include <string.h>

int main(void)
{
    const char *customer = "Nguyen Thi Phuong Thao";
    char name[16];

    int n = snprintf(name, sizeof name, "%s", customer);
    printf("n = %d, name = \"%s\", strlen(name) = %zu\n", n, name, strlen(name));
    if (n < 0 || (size_t)n >= sizeof name)
        printf("truncated: needed %d bytes, had %zu\n", n + 1, sizeof name);

    char line[32];
    n = snprintf(line, sizeof line, "%s x%d %s", "TEA-500", 3, "LM-1042");
    printf("n = %d, line = \"%s\"\n", n, line);
    return 0;
}`, "bounded.c"),
        code("text", `
bounded.c:9:42: warning: '%s' directive output truncated writing 22 bytes into a region of size 16 [-Wformat-truncation=]
n = 22, name = "Nguyen Thi Phuo", strlen(name) = 15
truncated: needed 23 bytes, had 16
n = 18, line = "TEA-500 x3 LM-1042"`),
        p("gcc even warns at compile time when it can see that the text will not fit. At run time the program does not crash and does not overflow: `name` holds 15 chars and a terminator, and `n = 22` tells you how much was lost. Always pass `\"%s\"` as the format and the text as an argument; `snprintf(name, sizeof name, customer)` would treat a `%` inside a customer's name as a format directive."),
        h3("memcpy: you count, you terminate"),
        p("`memcpy(dst, src, n)` from `<string.h>` copies exactly `n` bytes. It does not look for `'\\0'` and does not add one, which makes it the right tool when **you** already know the length:"),
        code("c", String.raw`
#include <stdio.h>
#include <string.h>

int main(void)
{
    const char *customer = "Nguyen Thi Phuong Thao";
    char name[16];

    size_t len = strlen(customer);
    size_t n = len < sizeof name - 1 ? len : sizeof name - 1;   // room for '\0'
    memcpy(name, customer, n);       // copies exactly n bytes, adds nothing
    name[n] = '\0';                  // so we terminate it ourselves
    printf("len = %zu, copied = %zu, name = \"%s\"\n", len, n, name);
    return 0;
}`, "copy.c"),
        code("text", `
len = 22, copied = 15, name = "Nguyen Thi Phuo"`),
        p("`cond ? a : b` (the conditional operator) is `a` when `cond` is true and `b` otherwise; here it picks the smaller of the length and the room left for chars. If the source and destination overlap, `memcpy` is UB; use `memmove`, which handles overlap. Check what you now know about sizes, terminators and truncation:"),
        challenge("chal_quiz_cf_221"),
        p("The printer service needs one small copy function that every field goes through. It must never write outside the slot, even for a slot of 0 bytes, and must tell the caller when a value was cut. The current version has the colleague's off-by-one in it:"),
        challenge("chal_fix_cf_222", "Answer three questions in code: what to return (it never depends on cap), what to do when there is no room at all, and at which index the terminator goes when src is too long. Test cap 0, cap 1 and a source that is exactly one char too long."),

        h2("6. The fix"),
        p("Every label field now goes through one helper built on `snprintf`. A cut value is still printed (the label must come out), but it is logged on `stderr`, the error output stream, so the team sees which orders need a manual check:"),
        code("c", String.raw`
#include <stdio.h>
#include <string.h>

// Copies src into dst (cap bytes) and always terminates. Returns false if src was cut.
bool copy_field(char *dst, size_t cap, const char *src)
{
    int n = snprintf(dst, cap, "%s", src);
    return n >= 0 && (size_t)n < cap;
}

void print_label(const char *order_id, const char *customer, const char *town)
{
    char name[16];
    char city[16];

    if (!copy_field(name, sizeof name, customer))
        fprintf(stderr, "warning: %s: name cut to %zu of %zu chars\n", order_id, strlen(name), strlen(customer));
    if (!copy_field(city, sizeof city, town))
        fprintf(stderr, "warning: %s: city cut to %zu of %zu chars\n", order_id, strlen(city), strlen(town));
    printf("%s | NAME: %s | CITY: %s\n", order_id, name, city);
}

int main(void)
{
    print_label("LM-1041", "Tran Van An", "Thu Duc");
    print_label("LM-1042", "Nguyen Thi Phuong Thao", "Binh Duong");
    return 0;
}`, "label.c"),
        code("text", `
LM-1041 | NAME: Tran Van An | CITY: Thu Duc
LM-1042 | NAME: Nguyen Thi Phuo | CITY: Binh Duong

on stderr:
warning: LM-1042: name cut to 15 of 22 chars`),
        numbered([
            "**One copy path.** `copy_field` is the only place that writes into a label field, and it always passes the real capacity with `sizeof name` - computed where `name` is still an array, not a pointer.",
            "**Always terminated, never past the end.** `snprintf` writes at most `cap` bytes and the last one is `'\\0'`, so the city keeps \"Binh Duong\" and the sorter gets the right lane.",
            "**Truncation is visible.** The return value is compared with the capacity; `n < 0` (an encoding error) also counts as a failure. The output is the same with and without `-fsanitize=address,undefined`, and ASan reports nothing.",
            "**`bool`** is a C23 keyword: no header needed.",
        ]),

        h2("7. Pitfalls"),
        bullets([
            "**`sizeof` on a pointer.** Inside a function `sizeof dst` is 8, the size of the pointer. Pass the capacity as a `size_t` parameter and compute it with `sizeof` where the array is declared.",
            "**Off by one terminator.** A buffer of `cap` bytes holds at most `cap - 1` chars. `char code[7]` cannot hold `\"TEA-500\"`.",
            "**`strncpy` and `strncat` are not \"safe strcpy/strcat\".** `strncpy` may leave no terminator; the `n` of `strncat` limits the chars **appended**, not the size of the buffer, so it still overflows if you pass `sizeof dst`.",
            "**Printing a buffer that may not be terminated.** `printf(\"%.*s\", (int)len, buf)` prints at most `len` bytes and never reads past them; plain `%s` reads until a `'\\0'`, wherever that is.",
            "**Bytes are not letters.** In UTF-8 a Vietnamese letter such as `ễ` takes 3 bytes. A byte limit can cut a letter in half and print garbage on a UTF-8 label; cut at a character boundary if your output is UTF-8 (this printer is ASCII-only).",
            "**`if (strcmp(a, b))` means \"if different\".** Write `strcmp(a, b) == 0` for equality, and never compare strings with `==`.",
            "**Overlapping copies.** `memcpy` and `strcpy` with overlapping source and destination are UB; use `memmove` for overlap.",
        ]),

        h2("8. Checklist"),
        bullets([
            "A string of length n needs n + 1 bytes; the string ends at the first `'\\0'`, not at the end of the array.",
            "`sizeof` is the buffer size (only on a real array), `strlen` is the text length; never mix them up.",
            "Every function that writes text takes the destination capacity; copy with `snprintf(dst, cap, \"%s\", src)` or `memcpy` plus your own terminator.",
            "Check `snprintf`'s return value: negative or `>= cap` means the text did not fit. Decide what happens then (log, reject, cut) and write it down.",
            "Point at string literals with `const char *`, and add `-Wwrite-strings` to your build.",
            "Compare strings with `strcmp(a, b) == 0`.",
            "Run the tests with `-fsanitize=address,undefined`; a clean `-O0` run without it proves nothing about overflows.",
        ]),
    ],
});
