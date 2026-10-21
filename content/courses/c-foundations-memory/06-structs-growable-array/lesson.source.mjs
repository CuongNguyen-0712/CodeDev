// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - test cases and the reference solution live in challenges.json / challenges/ (-> Postgres).
// C code blocks use String.raw, so "\n" and '\0' reach Sanity as the characters the learner types.
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-cf-3-2",
    title: "Structs & a growable array",
    slug: { _type: "slug", current: "c-structs-and-a-growable-array" },
    description:
        "On the night of the Tết sale the warehouse logged 1,300 scans, the nightly scanlog tool could hold only 1,000 records and gave up, and the quick fix grew the array by one record per scan with records = realloc(records, ...). Learn how a struct is laid out in memory (members, padding, sizeof, offsetof), how . and -> work, and how to build a growable array with data, len and cap that doubles its capacity, keeps its data when realloc fails and is freed exactly once.",
    estimatedTime: 22,

    scenario: {
        role: "Junior C developer on Lotus Mart's warehouse tools team",
        problem:
            "scanlog is the C tool that reads the handheld scanners' log every night and prints the stock report the warehouse in Bình Dương reads at 6:00. It stores the scans in struct scan records[1000]. On the night of the Tết campaign the scanners logged 1,300 scans, the tool printed \"more than 1000 scans, giving up\" and the report was empty. A colleague pushed a quick fix at 2:00: grow the array with realloc by one record for every scan. It works, but in code review you have to explain why it is slow, why it can lose all the records, and what to write instead.",
    },

    content: [
        h2("1. The incident: 1,300 scans, room for 1,000"),
        p("Every scan in the log is one line: a SKU and a quantity, for example `RICE-5KG 1`. The tool keeps each scan in a **struct** - one value that groups several named fields - and stores all of them in a global array with a fixed size:"),
        code("c", String.raw`
#include <stdint.h>
#include <stdio.h>

#define MAX_SCANS 1000

struct scan {
    char sku[9];
    int32_t qty;
    int64_t ts;
};

struct scan records[MAX_SCANS];

int main(void) {
    size_t n = 0;
    char sku[9];
    int32_t qty;
    while (scanf("%8s %d", sku, &qty) == 2) {
        if (n == MAX_SCANS) {
            fprintf(stderr, "scanlog: more than %d scans, giving up\n", MAX_SCANS);
            return 1;
        }
        snprintf(records[n].sku, sizeof records[n].sku, "%s", sku);
        records[n].qty = qty;
        records[n].ts = 0;
        n++;
    }
    printf("loaded %zu scans\n", n);
}`, "scanlog.c"),
        p("At least the check stops the loop before `records[1000]`, which would be out of bounds (UB, lesson 1.2). With 1,300 lines on stdin the tool does exactly what it was written to do:"),
        code("text", `
$ ./scanlog < tet-night.log
scanlog: more than 1000 scans, giving up`),
        p("The quick fix replaced the array with a pointer and grew it on every line:"),
        code("c", String.raw`
struct scan *records = nullptr;
size_t n = 0;
struct scan s = {};
while (scanf("%8s %d", s.sku, &s.qty) == 2) {
    records = realloc(records, (n + 1) * sizeof *records);   // one more slot
    records[n++] = s;
}`, "scanlog.c (quick fix)"),
        p("It loads all 1,300 scans. It also has two problems that this lesson is about: it calls `realloc` once **per record**, and when `realloc` fails it overwrites the only pointer to the records with a null pointer."),

        h2("2. Reproduce it"),
        p("To see the cost, wrap `realloc` in a small function that counts the calls and notices when the block had to move (the address is saved as a `uintptr_t` number before the call, because the old pointer may not be used after a successful `realloc`). Compile with `gcc -std=c23 -Wall -Wextra -g repro.c -o repro`:"),
        code("c", String.raw`
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>

struct scan {
    char sku[9];
    int32_t qty;
    int64_t ts;
};

// Measuring wrapper: counts calls, and how often realloc had to move the block.
static size_t calls, moves, bytes_moved;
static void *counted_realloc(void *p, size_t old_bytes, size_t new_bytes) {
    uintptr_t before = (uintptr_t)p;
    void *q = realloc(p, new_bytes);
    calls++;
    if (q != nullptr && p != nullptr && (uintptr_t)q != before) {
        moves++;
        bytes_moved += old_bytes;
    }
    return q;
}

int main(void) {
    struct scan *records = nullptr;
    size_t n = 0;
    struct scan s = {};
    while (scanf("%8s %d", s.sku, &s.qty) == 2) {
        // the quick fix: one more slot for every record
        records = counted_realloc(records, n * sizeof *records, (n + 1) * sizeof *records);
        records[n++] = s;
    }
    printf("loaded %zu scans\n", n);
    printf("realloc calls=%zu, block moved %zu times, %zu bytes copied\n", calls, moves, bytes_moved);
    free(records);
}`, "repro.c"),
        code("text", `
$ ./repro < tet-night.log          # 1,300 lines
loaded 1300 scans
realloc calls=1300, block moved 0 times, 0 bytes copied
$ ./repro < ten-nights.log         # 13,000 lines
loaded 13000 scans
realloc calls=13000, block moved 3 times, 544632 bytes copied`),
        p("One allocator call per scan. In this tiny program nothing else lives on the heap, so glibc could usually extend the block in place. Nothing promises that: whenever something else sits behind the block, `realloc` must allocate a new block and copy every old record. In the worst case pushing record number k copies k - 1 records, so 1,300 pushes copy 0 + 1 + ... + 1,299 = **844,350 records (20,264,400 bytes)**. Section 7 counts it properly."),
        p("The second problem needs a failing `realloc`. On the 64 MB handheld scanners that happens; on a laptop you can force it by asking for an absurd size. `realloc` then returns a null pointer **and leaves the old block untouched** - but the code has just overwritten the only pointer to it:"),
        code("c", String.raw`
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>

struct scan {
    char sku[9];
    int32_t qty;
    int64_t ts;
};

int main(void) {
    struct scan *records = malloc(4 * sizeof *records);
    if (records == nullptr) return 1;
    records[0] = (struct scan){ .sku = "TEA-500", .qty = 2 };

    size_t want = SIZE_MAX / 4;     // an absurd size, so that realloc fails for sure
    records = realloc(records, want);
    if (records == nullptr) {
        fprintf(stderr, "scanlog: out of memory\n");
        return 1;                   // the 4 records are still allocated, but nobody can free them
    }
    free(records);
}`, "leak.c"),
        p("Build it with `-fsanitize=address,undefined` and run it with `ASAN_OPTIONS=allocator_may_return_null=1`, so that ASan's allocator returns a null pointer like the real one instead of stopping the program. LeakSanitizer finds the lost block at exit:"),
        code("text", `
$ ASAN_OPTIONS=allocator_may_return_null=1 ./leak
==31041==WARNING: AddressSanitizer failed to allocate 0x3fffffffffffffff bytes
scanlog: out of memory

=================================================================
==31041==ERROR: LeakSanitizer: detected memory leaks

Direct leak of 96 byte(s) in 1 object(s) allocated from:
    #0 0x... in malloc
    #1 0x... in main leak.c:12

SUMMARY: AddressSanitizer: 96 byte(s) leaked in 1 allocation(s).`),
        p("This version at least checks for the null pointer. The quick fix does not even check: after a failed `realloc` it writes `records[n++] = s` through a null pointer, which is UB. Either way, every record read so far is gone."),

        h2("3. struct, typedef and designated initializers"),
        p("A `struct` declaration describes a new type: a list of **members**, each with its own type and name. `struct scan` is the type's full name - the word `struct` is part of it:"),
        code("c", String.raw`
struct scan {
    char sku[9];      // up to 8 characters + '\0' (lesson 2.2)
    int32_t qty;
    int64_t ts;       // Unix time in seconds
};`, "scan.h"),
        bullets([
            "**Members** are read and written with a dot: `s.qty = 2;`, `printf(\"%s\", s.sku);`.",
            "**Designated initializers** name the members you set: `struct scan a = { .sku = \"TEA-500\", .qty = 2, .ts = 1'790'000'000 };`. Members you leave out are set to zero (`\"\"` for `sku`, `0` for numbers), and the order of the names does not matter. The C23 empty initializer `struct scan s = {};` zeroes every member.",
            "**A compound literal** `(struct scan){ .sku = \"MUG-01\", .qty = 1 }` creates a struct value in the middle of an expression, for example to assign or to pass it to a function.",
            "**Assignment copies every member**: after `struct scan c = a;`, changing `c.qty` does not change `a.qty`. Structs cannot be compared with `==`; `a == b` does not compile (`invalid operands to binary ==`). Compare the members you care about.",
            "**`typedef`** gives an existing type a second name: after `typedef struct scan Scan;` you may write `Scan s;` instead of `struct scan s;`. It is a name only, not a new type. This course keeps writing `struct scan`, so you always see that a value is a struct.",
        ]),

        h2("4. `.` and `->`: passing structs by pointer"),
        p("A function parameter is a copy of the argument (lesson 2.1), and that is true for structs too: a `struct scan` parameter is a fresh 24-byte copy. To change the caller's struct, or just to avoid copying a big one, pass a pointer. Through a pointer you use `->`: `p->qty` means exactly `(*p).qty`."),
        code("c", String.raw`
#include <stdint.h>
#include <stdio.h>

struct scan {
    char sku[9];
    int32_t qty;
    int64_t ts;
};

typedef struct scan Scan;           // "Scan" is now another name for "struct scan"

// by value: the function gets a 24-byte copy
void add_one_copy(struct scan s) {
    s.qty += 1;
}

// by pointer: the function changes the caller's struct
void add_one(struct scan *s) {
    s->qty += 1;                    // same as (*s).qty += 1
}

void print_scan(const struct scan *s) {
    printf("%s qty=%d ts=%lld\n", s->sku, s->qty, (long long)s->ts);
}

int main(void) {
    struct scan a = { .sku = "TEA-500", .qty = 2, .ts = 1'790'000'000 };
    Scan b = { .qty = 5 };          // sku and ts are zero: "" and 0

    a.qty = 3;                      // . on a struct
    struct scan *p = &a;
    p->qty = 4;                     // -> through a pointer

    add_one_copy(a);
    print_scan(&a);
    add_one(&a);
    print_scan(&a);
    print_scan(&b);

    struct scan c = a;              // assignment copies every member
    c.qty = 100;
    printf("a.qty=%d c.qty=%d\n", a.qty, c.qty);
}`, "basics.c"),
        code("text", `
TEA-500 qty=4 ts=1790000000
TEA-500 qty=5 ts=1790000000
 qty=5 ts=0
a.qty=5 c.qty=100`),
        p("`add_one_copy` changed its own copy, so the first line still shows 4. `print_scan` takes a `const struct scan *`: it gets the address (8 bytes) instead of a copy, and `const` promises it only reads. That is the usual signature for a function that looks at a struct; a plain `struct scan *` says \"this function changes it\"."),

        h2("5. Layout: sizeof, alignment and padding"),
        p("The members of a struct are stored in memory **in the order you declare them**, but not always next to each other. Each type has an **alignment**: on x86-64 an `int32_t` must start at an address that is a multiple of 4, an `int64_t` at a multiple of 8. To keep every member aligned, the compiler inserts unused **padding bytes**. `offsetof(type, member)` from `<stddef.h>` tells you where each member starts, and `alignof` (a keyword since C23) gives a type's alignment:"),
        code("c", String.raw`
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>

struct scan {
    char sku[9];      // up to 8 characters + '\0'
    int32_t qty;
    int64_t ts;       // Unix time in seconds
};

struct scan_bad_order {
    char sku[9];
    int64_t ts;
    int32_t qty;
};

int main(void) {
    printf("struct scan: sizeof=%zu alignof=%zu\n", sizeof(struct scan), alignof(struct scan));
    printf("  sku at %zu, qty at %zu, ts at %zu\n",
           offsetof(struct scan, sku), offsetof(struct scan, qty), offsetof(struct scan, ts));
    printf("struct scan_bad_order: sizeof=%zu\n", sizeof(struct scan_bad_order));
    printf("  sku at %zu, ts at %zu, qty at %zu\n",
           offsetof(struct scan_bad_order, sku), offsetof(struct scan_bad_order, ts),
           offsetof(struct scan_bad_order, qty));
    printf("1000 records: %zu vs %zu bytes\n",
           1000 * sizeof(struct scan), 1000 * sizeof(struct scan_bad_order));
}`, "layout.c"),
        code("text", `
struct scan: sizeof=24 alignof=8
  sku at 0, qty at 12, ts at 16
struct scan_bad_order: sizeof=32
  sku at 0, ts at 16, qty at 24
1000 records: 24000 vs 32000 bytes`),
        image("struct-layout-and-vec", {
            alt: "Diagram in three panels. Top: the 24 bytes of struct scan on x86-64 as a row of cells with offsets 0, 9, 12, 16 and 24 below them. Bytes 0 to 8 are sku and hold T, E, A, -, 5, 0, 0 and two null terminators; bytes 9 to 11 are three dashed padding cells marked with a question mark; bytes 12 to 15 are qty, holding 2; bytes 16 to 23 are ts, holding 1790000000. A note says qty must start at a multiple of 4 and ts at a multiple of 8, so the compiler inserts padding, and the order sku, ts, qty would make the struct 32 bytes. Bottom left: struct scan_vec v after 5 pushes. On the stack, the 24-byte header has three fields, data (an address), len 5 and cap 8; an arrow goes from data to a heap block of 8 record slots, slots 0 to 4 filled and marked in use, slots 5 to 7 dashed and empty, room for 3 more pushes. A line underneath says: when len equals cap, tmp = realloc(data, 2 * cap * sizeof *data), and keep data if tmp is a null pointer. Bottom right: 1300 pushes on Tết night. A red box, grow by +1: 1300 realloc calls and up to 844,350 record copies, about 20 MB. A green box, double 4, 8, 16 up to 2048: 10 realloc calls and at most 2,044 record copies, about 49 KB.",
            caption: "struct scan has 3 padding bytes after sku. A growable array is a small header (data, len, cap) that points at a heap block with spare room.",
        }),
        bullets([
            "**`sizeof` of a struct includes the padding**, also padding at the end: the size is always a multiple of the alignment, so that in an array every element's `ts` is aligned again. That is why `struct scan_bad_order` is 32 bytes: 7 padding bytes after `sku` and 4 at the end.",
            "**The exact numbers are implementation-defined.** The standard only says members keep their order, the first member is at offset 0, and there may be padding after any member. Print `sizeof` and `offsetof` instead of adding sizes in your head; the values above are for gcc on x86-64 Linux.",
            "**Order members from the largest alignment to the smallest** when size matters (`int64_t`, then `int32_t`, then `char` arrays). Here the declared order already gives the minimum of 24 bytes.",
            "**Padding bytes have unspecified values.** Never compare two structs with `memcmp`: it compares the padding too.",
        ]),

        h2("6. A growable array: data, len, cap"),
        p("C has no list type that grows by itself. The standard way to build one is a small struct that **owns** a heap block (lesson 3.1) and remembers two numbers:"),
        code("c", String.raw`
struct scan_vec {
    struct scan *data;   // heap block with room for cap records, or nullptr
    size_t len;          // records in use: data[0] .. data[len - 1]
    size_t cap;          // records the block can hold; always len <= cap
};

struct scan_vec v = {};  // {nullptr, 0, 0}: empty, nothing allocated yet`, "scan_vec.h"),
        p("Pushing a record is simple while there is room: write it to `data[len]` and add 1 to `len`. When `len == cap` the block is full and must grow first. `realloc(ptr, bytes)` does that, and it has three rules you must know:"),
        numbered([
            "**`realloc(nullptr, bytes)` works like `malloc(bytes)`.** So an empty vector with `data == nullptr` needs no special first allocation.",
            "**On success it returns the address of a block of the new size** that starts with the old contents. It may be the same address or a new one; if it is new, the old block has been freed, and every pointer into the old block (`&v.data[3]`, saved earlier) is now dangling.",
            "**On failure it returns a null pointer and does not touch the old block.** It is still allocated, still holds your records, and still has to be freed. Since C23, calling `realloc` with a size of 0 is UB; never do it.",
        ]),
        p("Rule 3 is why you never assign the result of `realloc` straight back to the only pointer you have. Store it in a temporary, check it, and only then update the struct. The same pattern, shown on a plain buffer of `int32_t` quantities:"),
        code("c", String.raw`
#include <stdckdint.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>

// Grows *buf to new_cap elements. On failure, *buf and *cap are unchanged.
bool grow_qty(int32_t **buf, size_t *cap, size_t new_cap) {
    size_t bytes;
    if (ckd_mul(&bytes, new_cap, sizeof **buf)) {
        return false;                      // new_cap * 4 does not fit in size_t
    }
    int32_t *tmp = realloc(*buf, bytes);
    if (tmp == nullptr) {
        return false;                      // *buf still points at the old block
    }
    *buf = tmp;
    *cap = new_cap;
    return true;
}

int main(void) {
    int32_t *qty = nullptr;
    size_t cap = 0;
    if (!grow_qty(&qty, &cap, 4)) {        // realloc(nullptr, n) works like malloc(n)
        return 1;
    }
    qty[0] = 2;
    qty[1] = 10;

    bool ok = grow_qty(&qty, &cap, SIZE_MAX / 8);   // asks for SIZE_MAX / 2 bytes
    printf("ok=%d cap=%zu qty[0]=%d qty[1]=%d\n", ok, cap, qty[0], qty[1]);
    ok = grow_qty(&qty, &cap, SIZE_MAX / 2);        // * 4 would wrap around
    printf("ok=%d cap=%zu qty[0]=%d qty[1]=%d\n", ok, cap, qty[0], qty[1]);
    ok = grow_qty(&qty, &cap, 8);
    printf("ok=%d cap=%zu qty[0]=%d qty[1]=%d\n", ok, cap, qty[0], qty[1]);
    free(qty);
}`, "grow.c"),
        code("text", `
ok=0 cap=4 qty[0]=2 qty[1]=10
ok=0 cap=4 qty[0]=2 qty[1]=10
ok=1 cap=8 qty[0]=2 qty[1]=10`),
        p("Both failures leave the buffer, its capacity and its data exactly as they were, so the caller can still print what it has and free it. Note the details:"),
        bullets([
            "**The size in bytes is `count * sizeof *pointer`**, never a hard-coded 4 or 24. `sizeof *tmp` follows the type if it ever changes (the `sizeof *p` idiom from lesson 3.1).",
            "**The multiplication can wrap around.** `size_t` is unsigned, so a huge count times 24 silently wraps modulo 2^64 (lesson 1.1) and you would allocate a tiny block for a huge count. `ckd_mul` from `<stdckdint.h>` reports the overflow instead.",
            "**Update `cap` only after `realloc` succeeded.** If you set it first and the call fails, `cap` claims room that does not exist, and the next push writes past the end of the block.",
        ]),
        p("Freeing a vector is the other half of owning it: `free(v->data)` once, then reset the struct to `{nullptr, 0, 0}`, so that a second free is `free(nullptr)` (which does nothing) and a later push starts again from an empty vector. A struct copy `struct scan_vec w = v;` copies the pointer, not the block: now two headers point at one block, and freeing both is a double free. One block, one owner."),

        h2("7. Why double the capacity: count the copies"),
        p("How much should the block grow when it is full? Count the worst case, in which every `realloc` has to move the block and copy all `len` records that are already in it:"),
        code("c", String.raw`
#include <stdio.h>

// Count reallocs and element copies (worst case: realloc moves the whole old block).
static void count(size_t n, bool doubling) {
    size_t cap = 0, calls = 0, copies = 0;
    for (size_t len = 0; len < n; len++) {
        if (len == cap) {
            size_t new_cap = doubling ? (cap ? cap * 2 : 4) : cap + 1;
            calls++;
            copies += len;          // elements already in the old block
            cap = new_cap;
        }
    }
    printf("%-8s N=%7zu  realloc calls=%7zu  element copies=%12zu  final cap=%zu\n",
           doubling ? "doubling" : "+1", n, calls, copies, cap);
}

int main(void) {
    size_t sizes[] = {1'300, 100'000};
    for (size_t i = 0; i < 2; i++) {
        count(sizes[i], false);
        count(sizes[i], true);
    }
}`, "growth.c"),
        code("text", `
+1       N=   1300  realloc calls=   1300  element copies=      844350  final cap=1300
doubling N=   1300  realloc calls=     10  element copies=        2044  final cap=2048
+1       N= 100000  realloc calls= 100000  element copies=  4999950000  final cap=100000
doubling N= 100000  realloc calls=     16  element copies=      131068  final cap=131072`),
        bullets([
            "**Growing by +1** copies 0 + 1 + 2 + ... + (N - 1) = N(N - 1) / 2 elements: about N²/2. Ten times more scans means a hundred times more copying - 5 billion record copies for 100,000 scans.",
            "**Doubling** copies 4 + 8 + ... + cap/2, which is less than the final capacity, and the final capacity is less than 2N. So N pushes cost fewer than 2N copies in total: on average **at most 2 copies per push**, however big N gets. This is called **amortized constant time**: a single push is sometimes expensive (the one that moves 1,024 records), but the average over all pushes is a small constant.",
            "**The price is unused space**: right after a growth, up to half of the block is empty. 1,300 scans live in a block for 2,048 (49,152 bytes instead of 31,200). That is almost always the better trade. Any constant factor greater than 1 (1.5 is also common) gives the same amortized behaviour; adding a constant (+1, +100) never does.",
        ]),
        challenge("chal_coding_cf_321", "Grow only when len == cap: pick the new capacity (4 when cap is 0, otherwise twice cap), multiply with ckd_mul, call xrealloc into a temporary, and touch v->data and v->cap only after the temporary is not a null pointer. vec_free must leave {nullptr, 0, 0} behind."),

        h2("8. The fix"),
        p("scanlog now keeps the scans in a `struct scan_vec`. `vec_push` is the function you wrote in the challenge above (with the standard `realloc` and `free`); everything else is the tool's new `main`:"),
        code("c", String.raw`
#include <stdckdint.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>

struct scan {
    char sku[9];      // up to 8 characters + '\0'
    int32_t qty;
    int64_t ts;       // Unix time in seconds
};

struct scan_vec {
    struct scan *data;   // heap block with room for cap records, or nullptr
    size_t len;          // records in use: data[0] .. data[len - 1]
    size_t cap;          // records the block can hold; always len <= cap
};

// Appends s. Grows 0 -> 4 -> 8 -> 16 ... when full. Returns false and leaves v
// unchanged when the block cannot grow (your solution of the challenge).
bool vec_push(struct scan_vec *v, struct scan s);

void vec_free(struct scan_vec *v);

int main(void) {
    struct scan_vec v = {};            // {nullptr, 0, 0}: empty, nothing allocated yet
    struct scan s = {};
    while (scanf("%8s %d", s.sku, &s.qty) == 2) {
        if (!vec_push(&v, s)) {
            fprintf(stderr, "scanlog: out of memory after %zu scans\n", v.len);
            vec_free(&v);
            return 1;
        }
    }
    printf("loaded %zu scans, cap %zu, %zu bytes\n", v.len, v.cap, v.cap * sizeof *v.data);
    vec_free(&v);
}`, "scanlog.c"),
        code("text", `
$ gcc -std=c23 -Wall -Wextra -g -fsanitize=address,undefined scanlog.c -o scanlog
$ ./scanlog < tet-night.log
loaded 1300 scans, cap 2048, 49152 bytes`),
        numbered([
            "**No fixed limit.** The vector grows as long as memory lasts; there is no 1,000 to outgrow next Tết.",
            "**10 `realloc` calls instead of 1,300**, and at most 2,044 record copies instead of up to 844,350, because the capacity doubles.",
            "**A failed allocation loses nothing.** `vec_push` returns `false` and leaves `data`, `len` and `cap` unchanged, so the tool reports how many scans it read, frees the block and exits with status 1. The old code overwrote its only pointer to the records.",
            "**One owner, freed once.** `vec_free` releases the block on every path and resets the header, and ASan with LeakSanitizer reports nothing.",
            "**Passing `&v`** lets `vec_push` and `vec_free` change the caller's header; a copy of `v` would grow a block the caller never sees.",
        ]),
        callout("info", "Reading the log line by line", "The tool still reads with scanf(\"%8s %d\", ...), which stops quietly at the first malformed line. Lesson 4.1 replaces it with fgets and strtol, which reject bad lines one by one."),

        h2("9. Pitfalls"),
        bullets([
            "**`p = realloc(p, n)`** loses the block when `realloc` fails. Always use a temporary.",
            "**Pointers into the array dangle after a push.** `struct scan *last = &v.data[v.len - 1];` followed by `vec_push(&v, s)` may move the block; `last` then points into freed memory (use-after-free, lesson 3.1). Keep an index instead of a pointer.",
            "**`realloc(p, 0)` is UB in C23.** Free the block with `free` when you want it gone.",
            "**`sizeof v` is the header, not the data.** For `struct scan_vec` it is 24 bytes, whatever `len` is. The data size is `v.len * sizeof *v.data`.",
            "**Copying the header shares the block.** `struct scan_vec w = v;` makes two owners of one block; freeing both is a double free. Pass `&v` to functions instead.",
            "**Do not compare structs with `memcmp`**: padding bytes have unspecified values. Compare members, and `strcmp` for the `sku` string.",
        ]),

        h2("10. Checklist"),
        bullets([
            "Group related values in a `struct`, initialize it with designated initializers (or `= {}` for all zeros).",
            "Use `.` on a struct and `->` through a pointer; pass `const struct x *` to read and `struct x *` to change.",
            "Print `sizeof` and `offsetof` when layout matters, and order members from the largest alignment to the smallest.",
            "A growable array is `{data, len, cap}` with `len <= cap`, starting as `{nullptr, 0, 0}`.",
            "Grow only when `len == cap`, by a factor (double), never by a constant.",
            "Compute the byte size with `ckd_mul(&bytes, new_cap, sizeof *data)`.",
            "`tmp = realloc(data, bytes)`; on a null pointer change nothing and report the failure; otherwise update `data`, then `cap`.",
            "Free the block once with `free(data)` and reset the header to `{nullptr, 0, 0}`.",
        ]),
    ],
});
