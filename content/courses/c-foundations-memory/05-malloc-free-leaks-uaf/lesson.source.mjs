// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// C blocks that contain backslashes use String.raw, so "\n" and '\0' reach Sanity as typed.
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-cf-3-1",
    title: "malloc/free, leaks & use-after-free",
    slug: { _type: "slug", current: "c-malloc-free-leaks-use-after-free" },
    description:
        "Every row of the warehouse scanner's \"recent scans\" list shows the last product scanned, a colleague's quick fix makes the list print garbage, and the final version leaks memory every shift. Learn where C objects live and for how long (stack vs heap), how to use malloc, calloc, strdup and free correctly, and how to find dangling pointers, use-after-free, double frees and leaks with gcc warnings, AddressSanitizer and LeakSanitizer.",
    estimatedTime: 25,

    scenario: {
        role: "Junior C developer on Lotus Mart's warehouse tools team",
        problem:
            "The handheld scanners in the Bình Dương warehouse show the last eight products a picker scanned, so they can check a basket at a glance. After a firmware update, picker Thảo reports that scanner SCN-07 shows the same product on every row: she scanned tea, coffee and a mug, and the screen says \"MUG-01 Coc su\" three times. A colleague already tried two fixes. The first printed nothing at all, the second printed garbage. The third version finally showed the right names, and then the scanner ran out of memory every afternoon until someone rebooted it.",
    },

    content: [
        h2("1. The incident: three mugs on the screen"),
        p("The firmware reads each scan with `fgets` into one array `line`, then remembers it in the list `recent`. `fgets(line, sizeof line, stdin)` reads one line of input into `line`, including the newline at the end; `line[strcspn(line, \"\\n\")] = '\\0';` cuts that newline off. Lesson 4.1 covers both in detail; here only one thing matters: **every scan goes into the same array**."),
        code("c", String.raw`
#include <stdio.h>
#include <string.h>

int main(void) {
    char line[64];            // ONE input buffer, reused for every scan
    char *recent[8];          // the "recent scans" list
    size_t n = 0;

    while (n < 8 && fgets(line, sizeof line, stdin)) {
        line[strcspn(line, "\n")] = '\0';   // cut the newline
        recent[n++] = line;                 // BUG: stores the address of line
    }
    for (size_t i = 0; i < n; i++)
        printf("%zu: %s\n", i + 1, recent[i]);
    printf("recent[0]=%p recent[1]=%p line=%p\n",
           (void *)recent[0], (void *)recent[1], (void *)line);
}`, "repro.c"),
        p("`recent` is an array of 8 `char *` values: 8 pointers, not 8 strings. `recent[n++] = line;` does not copy any characters. `line` decays to a pointer to its first element (lesson 2.1), so every entry gets the **same address**."),

        h2("2. Reproduce it"),
        p("Feed it the three scans from Thảo's basket:"),
        code("bash", String.raw`
gcc -std=c23 -Wall -Wextra -g repro.c -o repro
printf 'TEA-500 Tra sen\nCOFFEE-1KG Ca phe\nMUG-01 Coc su\n' | ./repro`),
        code("text", `
1: MUG-01 Coc su
2: MUG-01 Coc su
3: MUG-01 Coc su
recent[0]=0x7fffd25d0f30 recent[1]=0x7fffd25d0f30 line=0x7fffd25d0f30`),
        p("No warning, no crash, and the program is not even undefined: it does exactly what it says. Three pointers point at one array, and that array holds whatever was read last. `-Wall -Wextra` cannot help, because storing an address is legal C. To keep three names you need **three copies**, each in memory that lives as long as the list does. That means you need to know where objects live and for how long."),

        h2("3. Stack, heap and lifetimes"),
        p("Every object in C has a **storage duration**: the part of the run during which it exists. A pointer to an object is only usable while the object is alive. Three kinds matter now:"),
        bullets([
            "**Automatic** (\"on the stack\"): local variables and arrays inside a function, such as `line` and `recent`. They are created when the block `{ ... }` is entered and **end when it is left**. Fast and automatic, but they cannot outlive the function.",
            "**Allocated** (\"on the heap\"): memory you request with `malloc`, `calloc` or `strdup`. It lives **until you call `free`** on it, no matter which function created it. You decide the lifetime, and you are responsible for ending it exactly once.",
            "**Static**: global variables and string literals such as `\"TEA-500\"`. They live for the whole run (and literals are read-only, lesson 2.2).",
        ]),
        p("\"Stack\" and \"heap\" are how gcc on x86-64 Linux implements the first two; the C standard only talks about lifetimes. Using an object after its lifetime ended is **undefined behaviour (UB)**: the standard says nothing about what happens. It may print the old value, garbage, nothing, or crash, and it may change with the optimization level."),
        image("stack-vs-heap-copies", {
            alt: "Two panels. Left, red, titled recent[i] = line: on the stack of main sits char line[64] at address 0x7ffd...f30 holding the bytes M U G - 0 1 \\0, overwritten by every fgets. Below it the array char *recent[8]; its entries [0], [1] and [2] all hold 0x7ffd...f30, and three arrows merge into one arrow pointing at line[0]. Caption: printf shows MUG-01, MUG-01, MUG-01; the next scan overwrites line and all three rows change with it. Right, green, titled recent[i] = strdup(line): the same reused line buffer, only read by strdup. recent[0], [1] and [2] hold three different heap addresses, each with an arrow to its own heap block: T E A - 5 0 0 \\0, M U G - 0 1 \\0 and C A R D - T E T \\0. Caption: printf shows TEA-500, MUG-01, CARD-TET; one owner per block, free(recent[i]) exactly once, then recent[i] = NULL. Footer: addresses are illustrative; the stack frame of main lives until main returns, a heap block until free() is called on it.",
            caption: "Copying a pointer shares one buffer. strdup gives every entry its own heap block - and an owner who must free it.",
        }),

        h2("4. Fix attempt 1: return a local array (dangling pointer)"),
        p("A colleague moved the reading into a function, so that each call would \"have its own buffer\":"),
        code("c", String.raw`
#include <stdio.h>
#include <string.h>

char *read_name(void) {
    char buf[64];
    if (!fgets(buf, sizeof buf, stdin))
        return NULL;
    buf[strcspn(buf, "\n")] = '\0';
    return buf;               // address of a local array
}

int main(void) {
    char *first = read_name();
    char *second = read_name();
    printf("%s / %s\n", first ? first : "(null)", second ? second : "(null)");
}`, "dangling.c"),
        p("`buf` is automatic: its lifetime ends at the closing `}` of `read_name`. The returned address points at memory that no longer belongs to any object - a **dangling pointer**. gcc sees it at compile time:"),
        code("text", `
dangling.c: In function ‘read_name’:
dangling.c:9:12: warning: function returns address of local variable [-Wreturn-local-addr]
    9 |     return buf;               // address of a local array
      |            ^~~
(null) / (null)`),
        p("The output is surprising: `(null) / (null)` although the input had two names. Because using such a pointer is UB, gcc 15 is allowed to do anything with it, and it compiles `return buf;` as `return NULL;`. Another compiler, or another version, may return the stale address and print an old name, garbage, or crash. Treat `-Wreturn-local-addr` as an error: the only fixes are to let the **caller** pass the buffer in, or to return heap memory."),

        h2("5. malloc, calloc and free"),
        p("`<stdlib.h>` provides the allocation functions:"),
        bullets([
            "`void *malloc(size_t size)` returns a pointer to `size` new bytes, or `NULL` if it cannot. The bytes are **uninitialized**: reading them before writing is a bug.",
            "`void *calloc(size_t count, size_t size)` allocates `count` elements of `size` bytes and sets every byte to zero. It returns `NULL` if `count * size` would overflow, which is safer than multiplying yourself.",
            "`void free(void *p)` ends the lifetime of a block that `malloc`, `calloc` or `strdup` returned. `free(NULL)` does nothing. Freeing anything else (a local array, a string literal, a pointer into the middle of a block) is UB.",
        ]),
        p("`void *` is a pointer to \"some type\"; in C it converts to `int *` or `char *` without a cast. Two habits make allocations safe: **check for `NULL`** every time, and size the block with **`sizeof *p`** - the size of what `p` points to - so the size stays right if the type of `p` changes:"),
        code("c", String.raw`
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

int main(void) {
    size_t days = 7;

    int *scans = calloc(days, sizeof *scans);     // 7 ints, all zero
    if (scans == NULL) {
        fprintf(stderr, "out of memory\n");
        return 1;
    }
    scans[0] = 120;
    scans[6] = 95;
    printf("sizeof *scans=%zu bytes=%zu\n", sizeof *scans, days * sizeof *scans);
    printf("scans: %d %d %d ... %d\n", scans[0], scans[1], scans[2], scans[6]);

    char *sku = malloc(strlen("TEA-500") + 1);    // +1 for the '\0'
    if (sku == NULL) {
        free(scans);
        return 1;
    }
    memcpy(sku, "TEA-500", strlen("TEA-500") + 1);
    printf("sku=%s len=%zu\n", sku, strlen(sku));

    free(sku);
    sku = NULL;
    free(scans);
    scans = NULL;
    free(scans);                                  // free(NULL) does nothing
    printf("done\n");
}`, "heap.c"),
        code("text", `
sizeof *scans=4 bytes=28
scans: 120 0 0 ... 95
sku=TEA-500 len=7
done`),
        p("`sizeof *scans` is 4 because `int` is 4 bytes on x86-64 Linux (implementation-defined, lesson 1.1); `sizeof` does not evaluate `*scans`, so it is fine even before the allocation. A string needs `strlen(s) + 1` bytes: the `+ 1` is the terminator `'\\0'` (lesson 2.2). Forgetting it makes `memcpy` write one byte past the block - a heap buffer overflow."),
        h3("strdup: malloc plus copy, standard since C23"),
        p("Copying a string to the heap is so common that POSIX systems have had `char *strdup(const char *s)` for decades, and C23 added it (and `strndup`) to `<string.h>`. It allocates `strlen(s) + 1` bytes with `malloc`, copies the characters and the terminator, and returns the copy, or `NULL` when out of memory. The result is an ordinary heap block: **you must `free` it**."),

        h2("6. Fix attempt 2: free too early (use-after-free)"),
        p("The second attempt allocated a fresh buffer for every scan - correct - and then freed it at the end of the loop body so that \"nothing leaks\":"),
        code("c", String.raw`
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

int main(void) {
    char *recent[8];
    size_t n = 0;

    while (n < 8) {
        char *line = malloc(64);
        if (line == NULL)
            return 1;
        if (!fgets(line, 64, stdin)) {
            free(line);
            break;
        }
        line[strcspn(line, "\n")] = '\0';
        recent[n++] = line;
        free(line);                 // "no leaks!" - but recent[n-1] still points here
    }
    for (size_t i = 0; i < n; i++)
        printf("%zu: %s\n", i + 1, recent[i]);
}`, "uaf.c"),
        p("`free(line)` ends the block's lifetime, but `recent[n-1]` still holds its address. Reading through it later is a **use-after-free**: UB. Built normally, this run printed garbage (glibc had reused the freed bytes for its own bookkeeping):"),
        code("text", `
1: ��v
2: ��v
3: ��v`),
        p("Garbage is the lucky outcome. A freed block is soon handed out again by the next `malloc`, so in a bigger program the list would silently show **another** object's data. Build with AddressSanitizer (ASan) and UndefinedBehaviorSanitizer, which add checks to every memory access:"),
        code("bash", String.raw`
gcc -std=c23 -Wall -Wextra -g -O0 -fsanitize=address,undefined uaf.c -o uaf
printf 'TEA-500 Tra sen\nCOFFEE-1KG Ca phe\nMUG-01 Coc su\n' | ./uaf`),
        code("text", `
==28392==ERROR: AddressSanitizer: heap-use-after-free on address 0x75f7a9ee0020 ...
READ of size 2 at 0x75f7a9ee0020 thread T0
    #0 ... in printf_common ...
    #3 ... in main uaf.c:22

0x75f7a9ee0020 is located 0 bytes inside of 64-byte region [0x75f7a9ee0020,0x75f7a9ee0060)
freed by thread T0 here:
    #0 ... in free ...
    #1 ... in main uaf.c:19

previously allocated by thread T0 here:
    #0 ... in malloc ...
    #1 ... in main uaf.c:10

SUMMARY: AddressSanitizer: heap-use-after-free uaf.c:22 in main`),
        p("Read it from the top: **what** happened (a read of freed heap memory), **where** (line 22, the `printf`), **which block** (a 64-byte region), **who freed it** (line 19) and **who allocated it** (line 10). Those three line numbers are the whole bug."),

        h2("7. Double free, and why `p = NULL` is not enough"),
        p("Freeing the same block twice is also UB, and in real allocators it can corrupt the heap's bookkeeping. It usually happens when two pointers hold the same address and both \"clean up\":"),
        code("c", `
#include <stdlib.h>
#include <string.h>

int main(void) {
    char *name = strdup("TEA-500");
    char *alias = name;     // two pointers, one allocation
    free(name);
    free(alias);            // the same block again
}`, "dfree.c"),
        code("text", `
dfree.c:8:5: warning: pointer ‘alias’ used after ‘free’ [-Wuse-after-free]
    8 |     free(alias);            // the same block again
      |     ^~~~~~~~~~~
dfree.c:7:5: note: call to ‘free’ here
==28718==ERROR: AddressSanitizer: attempting double-free on 0x705c3eee0010 in thread T0:
    #1 ... in main dfree.c:8
0x705c3eee0010 is located 0 bytes inside of 8-byte region [0x705c3eee0010,0x705c3eee0018)
freed by thread T0 here:
    #1 ... in main dfree.c:7`),
        p("gcc caught this one at compile time because both frees sit next to each other; across functions it usually cannot, and ASan is your net. Setting a pointer to `NULL` right after `free` is a good habit: a later `free(p)` becomes a no-op and a later `*p` usually crashes at once on Linux (still UB, but loud instead of silent). But it protects **only that variable**. `alias` above would still hold the old address."),
        h3("The one-owner rule"),
        p("The real defence is a rule about ownership: **every heap block has exactly one owner**, the one place in the code that will free it. Other pointers may borrow the address to read, but only while the owner keeps the block alive. Write the rule down in the function's comment:"),
        bullets([
            "`char *strdup(const char *s)`: **returns** ownership. The caller must free the result.",
            "`bool recent_add(..., const char *name)`: **borrows** `name`. It must not free it and must not keep the pointer after it returns - it keeps its own copy instead.",
            "`void recent_free(...)`: **takes back** ownership of every entry and frees each exactly once.",
        ]),

        h2("8. Fix attempt 3: copies that are never freed (leak)"),
        p("The third version used `strdup` for every scan, and the screen was right. At the end of each shift the firmware \"cleared\" the list:"),
        code("c", String.raw`
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

int main(void) {
    char line[64];
    char *recent[8];
    size_t n = 0;

    while (n < 8 && fgets(line, sizeof line, stdin)) {
        line[strcspn(line, "\n")] = '\0';
        char *copy = strdup(line);      // a new heap copy for every scan
        if (copy == NULL)
            return 1;
        recent[n++] = copy;
    }
    for (size_t i = 0; i < n; i++)
        printf("%zu: %s\n", i + 1, recent[i]);
    n = 0;                              // "clear the list" at the end of the shift
}`, "leak.c"),
        p("`n = 0` forgets the pointers, but the blocks are still allocated, and now nothing holds their addresses: nobody can ever free them. That is a **leak**. One shift leaks a few bytes; a scanner that runs for weeks without restarting slowly fills its memory until `malloc` returns `NULL`. ASan includes LeakSanitizer, which checks at exit for blocks that nothing points to any more:"),
        code("text", `
==28570==ERROR: LeakSanitizer: detected memory leaks

Direct leak of 48 byte(s) in 3 object(s) allocated from:
    #0 ... in strdup ...
    #1 ... in main leak.c:12

SUMMARY: AddressSanitizer: 48 byte(s) leaked in 3 allocation(s).`),
        p("48 bytes is exactly the three copies: 16 + 18 + 14, each name's length plus 1 for the terminator. The report names the allocating line; the missing `free` is wherever the owner forgot its job."),
        callout("tip", "Run the sanitizers in every test build",
            "Build tests with -g -O0 -fsanitize=address,undefined. ASan stops at the first invalid access with the three stack traces you saw, and LeakSanitizer runs at exit (on Linux it is on by default with ASan). They slow the program down about 2x and use more memory, so they are for tests and debugging, not for the firmware you ship."),
        p("Check that you can see through all four bugs - shared buffer, dangling pointer, use-after-free or double free, and leak:"),
        challenge("chal_quiz_cf_311"),

        h2("9. The fix"),
        p("Copy every name into a block the list owns, and give the list one function that frees everything it owns:"),
        code("c", String.raw`
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define RECENT_MAX 8

void recent_clear(char *recent[], size_t *n) {
    for (size_t i = 0; i < *n; i++) {
        free(recent[i]);            // the list owns every entry
        recent[i] = NULL;
    }
    *n = 0;
}

int main(void) {
    char line[64];
    char *recent[RECENT_MAX];
    size_t n = 0;

    while (n < RECENT_MAX && fgets(line, sizeof line, stdin)) {
        line[strcspn(line, "\n")] = '\0';
        char *copy = strdup(line);  // a new heap block with the characters
        if (copy == NULL) {
            fprintf(stderr, "out of memory\n");
            break;
        }
        recent[n++] = copy;
    }
    for (size_t i = 0; i < n; i++)
        printf("%zu: %s\n", i + 1, recent[i]);

    recent_clear(recent, &n);       // end of shift: free everything we own
    printf("cleared, n=%zu\n", n);
}`, "fix.c"),
        code("text", `
1: TEA-500 Tra sen
2: COFFEE-1KG Ca phe
3: MUG-01 Coc su
cleared, n=0`),
        numbered([
            "**`strdup(line)`** copies the characters, so the next `fgets` into `line` cannot change an entry. `line` itself stays a reused stack buffer: it is only read.",
            "**The `NULL` check** stops on out-of-memory instead of storing a null pointer that `printf(\"%s\")` would later dereference.",
            "**`recent_clear`** is the owner's cleanup: one `free` per entry, then `NULL`, then `n = 0`. It takes `size_t *n` so it can reset the caller's count (an out-parameter, lesson 2.1).",
            "**ASan and LeakSanitizer are silent** on this program with the same input: no use-after-free, no double free, no leak.",
        ]),
        p("The real scanner keeps only the **last** eight scans, so when the list is full the oldest entry must be dropped - and freed - before the newest is added. That is exactly where the next bug hides. Fix it in the firmware's list functions:"),
        challenge("chal_fix_cf_312", "Ask for every pointer: who owns this block, and who frees it? The caller's name buffer is overwritten after each call. When the list is full, the entry that leaves the list is the one to free - check which pointer is in slot 0 at the moment you free it."),

        h2("10. Pitfalls"),
        bullets([
            "**`free` does not change the pointer.** After `free(p)`, `p` still holds the old address; every copy of it dangles. Set the owner's pointer to `NULL` and make sure no one else keeps the address.",
            "**Free before you overwrite.** `list[i] = strdup(s);` on a slot that already owns a string leaks the old one. Make the new copy first, then free the old one, then store: on `NULL` the slot is unchanged.",
            "**`malloc(strlen(s))` is one byte short.** The terminator needs room: `strlen(s) + 1`, or simply `strdup(s)`.",
            "**`n * sizeof *p` can overflow `size_t`** when `n` comes from input; `calloc(n, sizeof *p)` checks it for you (and `ckd_mul` from lesson 1.1 does it by hand).",
            "**Only free what an allocation function returned.** `free(line)` on a stack array, a string literal or `p + 1` is UB.",
            "**A clean run without sanitizers proves nothing.** The use-after-free printed garbage here; in a bigger program it would print a plausible wrong name, and the dangling pointer printed `(null)` only because of how gcc 15 compiles it.",
        ]),

        h2("11. Checklist"),
        bullets([
            "Storing a `char *` stores an address, not characters. If the source buffer is reused or ends, store a copy (`strdup`).",
            "Never return the address of a local variable; treat `-Wreturn-local-addr` and `-Wuse-after-free` as errors.",
            "Check every `malloc`, `calloc` and `strdup` result for `NULL`; size blocks with `sizeof *p`; strings need `strlen + 1`.",
            "Every heap block has exactly one owner that frees it exactly once; document who owns, who borrows, and who frees.",
            "After `free(p)`, set `p = NULL`, and drop every other copy of the address.",
            "Run tests with `-fsanitize=address,undefined` and read the report: the bad access, the `free`, and the `malloc` lines.",
        ]),
    ],
});
