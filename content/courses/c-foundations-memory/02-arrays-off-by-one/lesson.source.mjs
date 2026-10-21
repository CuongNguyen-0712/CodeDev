// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - test cases and the solution live in challenges.json / challenges/ (-> Postgres).
// C blocks that contain backslashes use String.raw, so "\n" reaches Sanity as the 2 characters the learner types.
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-cf-1-2",
    title: "Arrays & loops: the off-by-one",
    slug: { _type: "slug", current: "c-arrays-loops-the-off-by-one" },
    description:
        "The weekly report for scanner SCN-07 says 35902 scans, the rerun says 35901, and the real number is 3137; the same report names Thu-Sat as the busiest three days although Fri-Sun had more scans. Learn how C arrays are laid out and indexed, why i < n and half-open ranges [start, end) prevent off-by-one bugs, why reading past an array is undefined behaviour and how AddressSanitizer reports it, and why a function that takes an array also needs its length.",
    estimatedTime: 20,

    scenario: {
        role: "Junior C developer on Lotus Mart's warehouse tools team",
        problem:
            "Every Monday a small C tool reads last week's log of each handheld scanner in the Bình Dương warehouse and prints the total number of scans and the busiest three days in a row; the staffing planner uses it to book extra pickers. This Monday the report says SCN-07 made 35902 scans. The daily dashboard adds up to 3137. A rerun of the same log prints 35901. And the report says the busiest days were Thursday to Saturday, while everybody in the warehouse remembers the Sunday rush.",
    },

    content: [
        h2("1. The incident: a weekly total that changes on every run"),
        p("The tool reads seven lines from the scanner log, one per day from Monday to Sunday. Each line holds the number of scans and the number of barcodes the scanner could not read. Then it adds up the week:"),
        code("c", String.raw`
#include <stdio.h>

int main(void)
{
    int scans[7];                    /* one count per day, Mon..Sun */
    int rejected[7];                 /* barcodes the scanner could not read */

    for (int d = 0; d < 7; d++)
        if (scanf("%d %d", &scans[d], &rejected[d]) != 2)
            return 1;

    int total = 0;
    for (int i = 0; i <= 7; i++)
        total += scans[i];

    printf("SCN-07 weekly scans: %d\n", total);
    return 0;
}`, "repro.c"),
        p("The week has 7 days, the loop runs for `i` = 0, 1, ..., 7. That is **8** iterations. The last one reads `scans[7]`, an element that does not exist. The second bug lives in the \"busiest three days\" function, which we look at in section 4: it never checks the last window, Friday to Sunday."),
        callout("info", "New in this lesson: scanf",
            "scanf(\"%d %d\", &scans[d], &rejected[d]) reads two whole numbers from the input into the two array elements. The & gives scanf the address to write to (lesson 2.1 explains addresses). It returns how many values it read, so != 2 catches a short or broken log. Lesson 4.1 shows why real tools read lines with fgets instead."),

        h2("2. Reproduce it"),
        p("Here is the log of SCN-07 as a file, `week.txt`:"),
        code("text", `
412 3
389 1
450 0
401 2
467 5
488 0
530 4`, "week.txt"),
        p("Build it the way you build on your laptop, without optimization (`-O0`), and feed it the log with `<`:"),
        code("bash", `
gcc -std=c23 -Wall -Wextra -g -O0 repro.c -o repro
./repro < week.txt`),
        code("text", `
SCN-07 weekly scans: 3137`),
        p("No warning, and 3137 is the right number. Now build it like the nightly job does, with `-O2`:"),
        code("bash", `
gcc -std=c23 -Wall -Wextra -g -O2 repro.c -o repro
./repro < week.txt
./repro < week.txt`),
        code("text", `
repro.c: In function ‘main’:
repro.c:14:23: warning: iteration 7 invokes undefined behavior [-Waggressive-loop-optimizations]
   14 |         total += scans[i];
      |                  ~~~~~^~~
repro.c:13:23: note: within this loop
   13 |     for (int i = 0; i <= 7; i++)
      |                     ~~^~~~
SCN-07 weekly scans: 35902
SCN-07 weekly scans: 35901`),
        p("Same source, same input, three different answers. The 8th read takes whatever 4 bytes happen to lie right after the array. In the `-O0` build they were 0, in the `-O2` build they are part of something else on the stack, and that something changes from run to run. The compiler even told us: with optimization on, gcc analyses the loop, sees that iteration 7 reads past the array and prints a warning. The nightly build log had that line all along."),
        callout("warning", "Undefined behaviour is not \"a random number\"",
            "Reading scans[7] is undefined behaviour (UB): the C standard places no requirement at all on what the program does. Printing 3137, printing 35902, crashing, or letting the optimizer delete code it can prove is unreachable are all allowed. \"It printed the right number on my laptop\" proves nothing. The only fix is to never execute the bad access."),

        h2("3. Arrays in C"),
        p("`int scans[7];` declares an **array**: 7 `int` objects stored next to each other in memory, with no gaps. The size is part of the type (`int[7]`) and is fixed when the program is compiled. There is no hidden length field and no automatic growing."),
        bullets([
            "**Indexes start at 0.** The elements are `scans[0]` to `scans[6]`. The last valid index is always `n - 1`.",
            "**`sizeof` gives bytes.** `int` is 4 bytes on x86-64 Linux (implementation-defined, lesson 1.1), so `sizeof scans` is 28. The number of elements is `sizeof scans / sizeof scans[0]`.",
            "**C does not check indexes.** `scans[7]` and `scans[-1]` compile. At run time the program computes an address and reads or writes it. If that address is outside the array, the behaviour is undefined.",
        ]),
        p("An **initializer** in braces gives the elements their first values. Elements you leave out become 0, and if you leave out the size, the compiler counts the initializer for you:"),
        code("c", String.raw`
#include <stdio.h>

int main(void)
{
    int week[7] = {412, 389, 450};          /* the rest become 0 */
    int sizes[] = {250, 500, 1000};         /* length from the initializer: 3 */
    int empty[7] = {0};                     /* all seven are 0 */

    for (size_t i = 0; i < 7; i++)
        printf("%d ", week[i]);
    printf("\n");
    printf("sizeof week = %zu, sizeof week[0] = %zu\n", sizeof week, sizeof week[0]);
    printf("sizes has %zu elements, empty[6] = %d\n", sizeof sizes / sizeof sizes[0], empty[6]);
    return 0;
}`, "init.c"),
        code("text", `
412 389 450 0 0 0 0
sizeof week = 28, sizeof week[0] = 4
sizes has 3 elements, empty[6] = 0`),
        p("Without an initializer, a local array like `int scans[7];` in `main` holds **indeterminate** values: whatever was in that memory before. Reading one before you store into it is a bug, which is why the incident code fills every element with `scanf` first."),

        h2("4. Loops and half-open ranges"),
        p("A C `for` loop has three parts in the parentheses: `for (init; condition; step)`. `init` runs once, the `condition` is checked **before** every iteration, and `step` runs after every iteration. The standard loop over an array of `n` elements is:"),
        code("c", String.raw`
for (size_t i = 0; i < n; i++)
    total += scans[i];`),
        p("`i` takes the values 0, 1, ..., n - 1: exactly `n` iterations, and every index is valid. Write it this way every time. `i <= n` runs `n + 1` times and the last index is invalid; `i <= n - 1` is correct but breaks when `n` is 0 (section 8). The index type is `size_t`, the unsigned type that `sizeof` returns (lesson 1.1). Comparing an `int` index with a `size_t` length makes gcc warn with `-Wextra` (`-Wsign-compare`), because a negative `int` turns into a huge unsigned value in that comparison."),
        h3("Think in [start, end)"),
        p("The loop above walks the **half-open range** `[0, n)`: the start is included, the end is not. C code uses half-open ranges everywhere, because they make the arithmetic simple:"),
        bullets([
            "The **length** of `[start, end)` is `end - start`. No `+ 1` to forget.",
            "The range is **empty** when `start == end`, so \"no data\" needs no special case.",
            "Two ranges **join without a gap or an overlap**: `[0, 3)` and `[3, 7)` together are `[0, 7)`. Monday to Wednesday, then Thursday to Sunday.",
            "The end is the first index **past** the data. For an array of `n` elements, `n` itself is never a valid index, which also makes it a natural \"not found\" answer.",
        ]),
        h3("The second bug: windows of k days"),
        p("The staffing planner wants the busiest **3 days in a row**. A window of `k` days that starts at day `start` is the range `[start, start + k)`. Here is the function from the weekly tool:"),
        code("c", String.raw`
#include <stdio.h>

/* Start day (0 = Mon) of the busiest 3-day window in a 7-day week. */
size_t busiest_3_days(const int scans[])
{
    size_t best_start = 0;
    int best_total = 0;
    for (size_t start = 0; start + 3 < 7; start++) {
        int total = scans[start] + scans[start + 1] + scans[start + 2];
        if (total > best_total) {
            best_total = total;
            best_start = start;
        }
    }
    return best_start;
}

int main(void)
{
    int scans[7] = {412, 389, 450, 401, 467, 488, 530};
    size_t s = busiest_3_days(scans);
    printf("busiest 3 days start at day %zu: %d scans\n",
           s, scans[s] + scans[s + 1] + scans[s + 2]);
    return 0;
}`, "window.c"),
        code("text", `
busiest 3 days start at day 3: 1356 scans`),
        p("Day 3 is Thursday. But Friday to Sunday has 467 + 488 + 530 = 1485 scans. Count the windows: a window fits as long as its end `start + 3` is at most 7, so the starts are 0, 1, 2, 3 and **4**. The condition `start + 3 < 7` stops at 3. This bug reads nothing outside the array, so no tool will complain; it just gives the wrong answer, every time."),
        p("The rule for windows: in `n` elements, a `k`-element window can start at `0` to `n - k`, which is `n - k + 1` windows. The loop condition that says exactly that is `start + k <= n`: \"the end of this window is still inside the array\"."),
        image("seven-days-half-open", {
            alt: "Top panel: the array scans drawn as seven memory cells with indexes [0] to [6], values 412, 389, 450, 401, 467, 488, 530 and byte offsets +0 to +24, followed by a dashed red eighth cell [7] at offset +28 with the value ???. A green bracket under the seven real cells is labelled for (size_t i = 0; i < 7; i++), 7 reads, last index 6 = n - 1, length of [start, end) is end - start; a red note under the eighth cell says i <= 7 reads this too: UB. Bottom left, red: the condition start + 3 < 7 checks only the windows starting at 0 to 3 (totals 1251, 1240, 1318, 1356) and picks start 3 as best, while the window starting at 4 is drawn dashed and marked skipped. Bottom right, green: the condition start + k <= n checks starts 0 to n - k, which is n - k + 1 = 5 windows, and the window starting at 4, Friday to Sunday, wins with 1485.",
            caption: "Loop over [0, n) with i < n; a k-day window [start, start + k) fits while start + k <= n.",
        }),

        h2("5. Passing an array to a function"),
        p("`busiest_3_days(const int scans[])` looks like it receives the array. It does not. When you pass an array to a function, C passes the **address of its first element**, and a parameter written as `const int scans[]` is really a pointer, `const int *scans`. Lesson 2.1 explains pointers in detail; for now the consequence matters: inside the function, the length is gone. `sizeof` proves it:"),
        code("c", String.raw`
#include <stdio.h>

void print_count(const int scans[])
{
    printf("inside:  sizeof scans = %zu, count = %zu\n",
           sizeof scans, sizeof scans / sizeof scans[0]);
}

int main(void)
{
    int scans[7] = {412, 389, 450, 401, 467, 488, 530};
    printf("in main: sizeof scans = %zu, count = %zu\n",
           sizeof scans, sizeof scans / sizeof scans[0]);
    print_count(scans);
    return 0;
}`, "sizeof.c"),
        code("text", `
sizeof.c: In function ‘print_count’:
sizeof.c:6:19: warning: ‘sizeof’ on array function parameter ‘scans’ will return size of ‘const int *’ [-Wsizeof-array-argument]
    6 |            sizeof scans, sizeof scans / sizeof scans[0]);
      |                   ^~~~~
in main: sizeof scans = 28, count = 7
inside:  sizeof scans = 8, count = 2`),
        p("In `main`, `scans` is the real array: 28 bytes, 7 elements. In `print_count` it is an 8-byte address, and 8 / 4 gives a \"count\" of 2. gcc warns about this exact mistake (it prints the same warning a second time for the second `sizeof`). The rule follows directly:"),
        bullets([
            "**`sizeof arr / sizeof arr[0]` only works where `arr` is declared as an array.** Compute the count there, once.",
            "**A function that takes an array also takes its length**, as a `size_t n` parameter, and loops over `[0, n)`. The function cannot find the length by itself.",
            "**`const`** in `const int scans[]` is a promise: this function only reads the elements. If it tries `scans[0] = 0;`, the compiler stops with an error.",
            "Fixed sizes such as 7 days get a name with `#define DAYS 7`: the preprocessor replaces every `DAYS` with `7` before the compiler runs, so the size is written once. (Lesson 4.2 shows C23 `constexpr`, a typed alternative.)",
        ]),
        p("The weekly tool's window function only works for 3 days out of 7. The planner now wants any window length for any log. Fix the general version:"),
        challenge("chal_fix_cf_121", "Write each window as the half-open range [start, start + k) and ask: which starts still fit? Then check the guard at the top against the case where the window is the whole log, and think about what >= does when two windows have the same total."),

        h2("6. Let the tools find it"),
        p("The window bug is a logic error: only a test with a known answer catches it. The `i <= 7` bug is a memory error, and the compiler can build a program that checks every access. **AddressSanitizer** (ASan) surrounds every array with \"poisoned\" bytes and stops the program at the first access to them. **UndefinedBehaviorSanitizer** (UBSan) checks other kinds of UB, including indexing a real array out of bounds. Turn both on, and build without optimization so the line numbers match the source:"),
        code("bash", `
gcc -std=c23 -Wall -Wextra -g -O0 -fsanitize=address,undefined repro.c -o repro
./repro < week.txt`),
        code("text", `
repro.c:14:23: runtime error: index 7 out of bounds for type 'int [7]'
repro.c:14:23: runtime error: load of address 0x7822c93d003c with insufficient space for an object of type 'int'
=================================================================
==31989==ERROR: AddressSanitizer: stack-buffer-overflow on address 0x7822c93d003c at pc 0x5ac3f13fe5fb bp 0x7ffe8364dc90 sp 0x7ffe8364dc80
READ of size 4 at 0x7822c93d003c thread T0
    #0 0x5ac3f13fe5fa in main repro.c:14
    ...
Address 0x7822c93d003c is located in stack of thread T0 at offset 60 in frame
    #0 0x5ac3f13fe2d8 in main repro.c:4

  This frame has 2 object(s):
    [32, 60) 'scans' (line 5) <== Memory access at offset 60 overflows this variable
    [96, 124) 'rejected' (line 6)
SUMMARY: AddressSanitizer: stack-buffer-overflow repro.c:14 in main
...
==31989==ABORTING`),
        p("Read it from the top:"),
        numbered([
            "**UBSan** speaks first: line 14 uses **index 7** on a value of type **`int [7]`**. That alone names the bug.",
            "**`stack-buffer-overflow`**: the bad address belongs to a local variable (local variables live on the **stack**, lesson 3.1). **`READ of size 4`**: the program read one `int`; a write would say `WRITE`.",
            "**`#0 ... in main repro.c:14`**: the line that did it, `total += scans[i];`.",
            "**`[32, 60) 'scans'`**: ASan prints the array's bytes in the stack frame as a half-open range. 60 - 32 = 28 bytes, exactly `sizeof scans`, and the access at offset 60 is the first byte after it.",
        ]),
        p("The program stops with exit code 1 instead of printing a wrong total. Sanitizers only see accesses that really execute, so they need input that reaches the bug, and they make the program slower and bigger. Use them for every test run and debug build, not for the shipped tool."),

        h2("7. The fix"),
        p("Both bugs go away when every loop walks a half-open range and every function gets its length. One helper sums any range `[start, end)`; the week is `[0, DAYS)` and a window is `[start, start + k)`:"),
        code("c", String.raw`
#include <stdio.h>

#define DAYS 7

/* Sum of scans[start] .. scans[end - 1]: the half-open range [start, end). */
long sum_range(const int scans[], size_t start, size_t end)
{
    long total = 0;
    for (size_t i = start; i < end; i++)
        total += scans[i];
    return total;
}

/* Start of the busiest k-day window in scans[0..n), or n if no window fits. */
size_t best_window(const int scans[], size_t n, size_t k)
{
    if (k == 0 || k > n)
        return n;
    size_t best_start = 0;
    long best_total = -1;
    for (size_t start = 0; start + k <= n; start++) {   /* last start is n - k */
        long total = sum_range(scans, start, start + k);
        if (total > best_total) {                        /* ties: earliest wins */
            best_total = total;
            best_start = start;
        }
    }
    return best_start;
}

int main(void)
{
    int scans[DAYS];
    int rejected[DAYS];
    for (size_t d = 0; d < DAYS; d++)
        if (scanf("%d %d", &scans[d], &rejected[d]) != 2)
            return 1;

    printf("SCN-07 weekly scans: %ld\n", sum_range(scans, 0, DAYS));

    size_t start = best_window(scans, DAYS, 3);
    if (start == DAYS)
        printf("no 3-day window\n");
    else
        printf("busiest 3 days: [%zu, %zu), %ld scans\n",
               start, start + 3, sum_range(scans, start, start + 3));
    return 0;
}`, "weekly_report.c"),
        code("text", `
SCN-07 weekly scans: 3137
busiest 3 days: [4, 7), 1485 scans`),
        numbered([
            "**`i < end`** in `sum_range`: the loop reads `scans[start]` to `scans[end - 1]` and nothing else.",
            "**`start + k <= n`**: every window that fits is checked, the last one starts at `n - k`. Writing it as an addition also avoids computing `n - k`, which wraps around for `size_t` when `k > n` (section 8).",
            "**The guard `k == 0 || k > n` returns `n`**: there is no window, and `n` is never a valid start, so the caller can test for it. `k == n` is allowed: one window, the whole week.",
            "**The length travels with the array**: `DAYS` in `main`, `n` in the functions. No function guesses a size.",
            "**`long` totals**: a sum of many `int` counts can overflow an `int` (signed overflow is UB, lesson 1.1); `long` is 64 bits on this platform.",
        ]),
        p("The same build with `-O2` now prints no warning, and with `-fsanitize=address,undefined` it runs clean and prints the same two lines."),

        h2("8. Pitfalls"),
        bullets([
            "**`<=` with a length.** `i <= n`, `i <= 7`, `i <= sizeof a / sizeof a[0]`: if the right side is a count, the operator is `<`.",
            "**`n - k` with `size_t`.** Unsigned arithmetic wraps (lesson 1.1): with `n = 7` and `k = 8`, `n - k` is `18446744073709551615`, so `start <= n - k` lets the loop run far past the array. Compare with additions (`start + k <= n`) or check `k <= n` first.",
            "**Counting down with `size_t`.** `for (size_t i = n - 1; i >= 0; i--)` never ends: `i >= 0` is always true for an unsigned type, and gcc says so (`comparison of unsigned expression in ‘>= 0’ is always true`). It also breaks for `n == 0`. Count down over `[0, n)` with `for (size_t i = n; i > 0; i--)` and use `scans[i - 1]` in the body.",
            "**`sizeof` on a parameter.** Inside a function, an array parameter is a pointer: `sizeof` gives 8 here, not the array size. Pass `n`.",
            "**Writing out of bounds is worse than reading.** `scans[7] = 0;` is UB too, and in practice it can silently change a neighbouring variable such as `rejected`. ASan reports it as `WRITE of size 4`.",
            "**Testing only the middle.** Off-by-one bugs live at the edges: the first and last element, `k == 1`, `k == n`, an empty input. Put those in the tests.",
        ]),

        h2("9. Checklist"),
        bullets([
            "Loop over an array with `for (size_t i = 0; i < n; i++)`; the last valid index is `n - 1`.",
            "Describe ranges as half-open `[start, end)`: length `end - start`, empty when equal, `end` is never read.",
            "A `k`-element window fits while `start + k <= n`: starts `0` to `n - k`, `n - k + 1` windows.",
            "Compute `sizeof arr / sizeof arr[0]` only where `arr` is a real array; every function that takes an array also takes `size_t n`.",
            "Mark read-only array parameters `const`.",
            "Treat every out-of-bounds access as UB, even when the output looks right; read and fix gcc warnings from optimized builds.",
            "Run tests with `-fsanitize=address,undefined`, and include edge cases: first, last, `k == 1`, `k == n`, `k > n`, ties.",
        ]),
    ],
});
