// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// C code blocks use String.raw, so "\n" reaches Sanity as the two characters the learner should type.
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-cf-2-1",
    title: "Pointers & pointer arithmetic",
    slug: { _type: "slug", current: "c-pointers-and-pointer-arithmetic" },
    description:
        "A customer return is scanned, the program says it was applied, and the stock of TEA-500 still shows 120 boxes, because C passed the function a copy of the number. Learn what an address and a pointer are, how to change the caller's variable through an out-parameter, how pointer arithmetic, a[i] == *(a + i), array decay, the one-past-the-end pointer, const int * and ptrdiff_t work, and how to edit an array in place with two pointers.",
    estimatedTime: 22,

    scenario: {
        role: "Junior C developer on Lotus Mart's warehouse tools team",
        problem:
            "When a customer sends goods back, the returns desk in Bình Dương scans them with SCN-07 and the stock program adds them to the shelf count. Order LM-1042 returned 3 boxes of TEA-500. The scanner beeped, the log says \"return applied\", and the nightly stock report still shows 120 boxes instead of 123. A colleague already tried two quick fixes; one swaps the wrong things, the other compiles with a warning nobody read.",
    },

    content: [
        h2("1. The incident: the return that never arrived"),
        p("The returns code on the scanner is one small function. It gets the current stock and the returned quantity, and adds them:"),
        code("c", String.raw`
void apply_return(int stock, int qty) {
    stock += qty;
}

/* in the scanner loop */
apply_return(tea_500_stock, 3);     /* LM-1042: 3 boxes of TEA-500 back */
log_line("return applied");`, "returns.c"),
        p("The program compiles without a warning, the log line is printed, and the shelf count never changes. Nobody lost tea; the boxes are on the shelf. The **number** in the program is wrong, so tomorrow's pick list will say 120 and the shop will refuse orders it could ship."),

        h2("2. Reproduce it"),
        p("Print the variable before and after the call, and inside the function print where `stock` lives. `&stock` is the **address** of the variable (more in section 3); `printf` prints an address with `%p`, which expects a `void *`, so the address is cast with `(void *)`. Save as `repro.c`, then compile and run with `gcc -std=c23 -Wall -Wextra -g repro.c -o repro` and `./repro`:"),
        code("c", String.raw`
#include <stdio.h>

void apply_return(int stock, int qty) {
    printf("  inside: stock=%d at %p\n", stock, (void *)&stock);
    stock += qty;
    printf("  inside: stock=%d after += %d\n", stock, qty);
}

int main(void) {
    int stock = 120;                     /* TEA-500 on shelf B3 */
    printf("before: stock=%d at %p\n", stock, (void *)&stock);
    apply_return(stock, 3);              /* LM-1042 returns 3 boxes */
    printf("after:  stock=%d\n", stock);
    return 0;
}`, "repro.c"),
        code("text", `
before: stock=120 at 0x7ffcc14f54b4
  inside: stock=120 at 0x7ffcc14f549c
  inside: stock=123 after += 3
after:  stock=120`),
        p("Two different addresses: the `stock` inside the function is a **different variable** that starts as a copy of 120. The addition works - on the copy - and the copy disappears when the function returns. This is **pass by value**: C always passes a copy of every argument. Your addresses will be different on every run (the operating system moves the stack on purpose), but the two addresses will always differ."),

        h2("3. Addresses and pointers"),
        p("Every variable lives somewhere in memory, and every byte of memory has a number: its **address**. The unary operator `&` gives the address of a variable. A **pointer** is a variable that stores an address. Its type says what kind of object lives there:"),
        bullets([
            "`int *p;` declares `p` as a **pointer to int**. Read it right to left: `p` is a `*` (pointer) to `int`.",
            "`p = &stock;` stores the address of `stock` in `p`. We say `p` **points to** `stock`.",
            "`*p` (the **dereference** operator) is the int that `p` points to. You can read it (`x = *p;`) and write it (`*p = 123;`).",
            "`NULL` (from `<stdio.h>`, `<stddef.h>` and others) is the **null pointer**: a pointer value that points to no object. C23 also has the keyword `nullptr` for the same job (lesson 4.2).",
        ]),
        code("c", String.raw`
#include <stdio.h>

int main(void) {
    int stock = 120;
    int *p = &stock;           /* p holds the address of stock */

    printf("stock = %d\n", stock);
    printf("&stock = %p\n", (void *)&stock);
    printf("p      = %p\n", (void *)p);
    printf("*p     = %d\n", *p);

    *p = 123;                  /* write through the pointer */
    printf("stock = %d\n", stock);

    printf("sizeof p = %zu, sizeof *p = %zu\n", sizeof p, sizeof *p);

    int *nothing = NULL;       /* points to no object */
    if (nothing == NULL) {
        printf("nothing points nowhere\n");
    }
    return 0;
}`, "addr.c"),
        code("text", `
stock = 120
&stock = 0x7ffc76d64974
p      = 0x7ffc76d64974
*p     = 120
stock = 123
sizeof p = 8, sizeof *p = 4
nothing points nowhere`),
        p("Writing `*p = 123` changed `stock`, because `p` holds the address of `stock`. The size of a pointer is implementation-defined; on this platform (x86-64 Linux, LP64) every object pointer is 8 bytes, and an `int` is 4 bytes."),
        callout("warning", "Dereferencing NULL is undefined behaviour",
            "*p is only allowed when p points to a live object. Reading or writing through a null pointer, or through a pointer that was never given a value, is undefined behaviour (UB): the standard gives no guarantee at all. On Linux a null read usually stops the program with a segmentation fault, but the compiler may also assume it never happens and remove your checks. Check for NULL before you dereference a pointer you did not create yourself."),
        p("The `*` means two different things depending on where it stands. In a **declaration** (`int *p`) it makes `p` a pointer. In an **expression** (`*p = 123`) it follows the pointer. And `int *a, b;` declares one pointer `a` and one plain `int` `b` - declare one pointer per line."),

        h2("4. Change the caller's variable: out-parameters"),
        p("C still passes a copy - but if the copy is an **address**, the function can follow it to the caller's variable. A parameter that the function writes its result into is called an **out-parameter**:"),
        code("c", String.raw`
#include <stdio.h>

void apply_return(int *stock, int qty) {
    *stock += qty;             /* change the caller's variable */
}

int main(void) {
    int stock = 120;
    apply_return(&stock, 3);
    printf("after: stock=%d\n", stock);
    return 0;
}`, "fixed.c"),
        code("text", `
after: stock=123`),
        p("Read the call site: `&stock` is a visible sign that `apply_return` may change `stock`. That is the main reason C code uses out-parameters: the function's **return value** stays free for a success flag, and the results go through pointers."),
        h3("Colleague's fix 1: swapping the pointers"),
        p("The returns desk also moves boxes between two bins. A colleague wrote a swap the same way and it did nothing:"),
        code("c", String.raw`
#include <stdio.h>

void swap_bins_wrong(int *a, int *b) {
    int *tmp = a;              /* swaps the two local pointer copies */
    a = b;
    b = tmp;
}

void swap_bins(int *a, int *b) {
    int tmp = *a;              /* swaps the two ints they point to */
    *a = *b;
    *b = tmp;
}

int main(void) {
    int bin_a = 40, bin_b = 7;
    swap_bins_wrong(&bin_a, &bin_b);
    printf("wrong: a=%d b=%d\n", bin_a, bin_b);
    swap_bins(&bin_a, &bin_b);
    printf("right: a=%d b=%d\n", bin_a, bin_b);
    return 0;
}`, "swap.c"),
        code("text", `
wrong: a=40 b=7
right: a=7 b=40`),
        p("The pointers `a` and `b` are themselves copies. Swapping them is the same mistake as `stock += qty`, one level up. To change what the caller sees, the function must write through the pointer: assign to `*a`, not to `a`. gcc gives no warning for the wrong version - it is valid C that does nothing useful."),
        h3("Colleague's fix 2: returning the address of a local"),
        p("The second idea was to let a function create the new count and return its address:"),
        code("c", String.raw`
#include <stdio.h>

int *new_stock(int start) {
    int stock = start;
    return &stock;             /* stock dies when the function returns */
}

int main(void) {
    int *p = new_stock(120);
    printf("p = %p\n", (void *)p);
    return 0;
}`, "local.c"),
        code("text", `
main.c: In function 'new_stock':
main.c:5:12: warning: function returns address of local variable [-Wreturn-local-addr]
    5 |     return &stock;             /* stock dies when the function returns */
      |            ^~~~~~
p = (nil)`),
        p("A local variable lives only while its function runs. After `return`, the address points at memory that no longer belongs to `stock` - a **dangling pointer**, and using it is UB. gcc 15 knows this, so it warns and returns a null pointer instead (`(nil)` is how glibc prints a null `%p`); reading `*p` then fails at once, and UBSan reports `runtime error: load of null pointer of type 'int'`. Another compiler may hand you the old address and let the code \"work\" until the memory is reused. Lesson 3.1 shows how to create objects that outlive a function. For now: **never return the address of a local variable**, and treat `-Wreturn-local-addr` as an error."),

        h2("5. Pointer arithmetic and arrays"),
        p("Pointers to array elements can move. Adding an integer to a pointer moves it by that many **elements**, not bytes: `p + 1` points at the next `int`, which on this platform is `sizeof *p` = 4 bytes further."),
        code("c", String.raw`
#include <stdio.h>
#include <stddef.h>

int main(void) {
    int scans[5] = {12, 0, 7, 31, 4};    /* SCN-07, five shifts */
    int *p = scans;                      /* same as &scans[0] */

    printf("p     = %p  *p       = %d\n", (void *)p, *p);
    printf("p + 1 = %p  *(p + 1) = %d\n", (void *)(p + 1), *(p + 1));
    printf("p + 2 = %p  *(p + 2) = %d\n", (void *)(p + 2), *(p + 2));
    printf("step = %td bytes\n", (char *)(p + 1) - (char *)p);

    printf("scans[3] = %d, *(scans + 3) = %d, 3[scans] = %d\n",
           scans[3], *(scans + 3), 3[scans]);

    int *end = scans + 5;                /* one past the end: valid, never read *end */
    ptrdiff_t n = end - scans;
    printf("end - scans = %td elements\n", n);
    return 0;
}`, "arith.c"),
        code("text", `
p     = 0x7ffd12ed8f40  *p       = 12
p + 1 = 0x7ffd12ed8f44  *(p + 1) = 0
p + 2 = 0x7ffd12ed8f48  *(p + 2) = 7
step = 4 bytes
scans[3] = 31, *(scans + 3) = 31, 3[scans] = 31
end - scans = 5 elements`),
        p("The addresses grow by 4 (`...f40`, `...f44`, `...f48`), one `int` each. Casting both pointers to `char *` measures the distance in bytes, because a `char` is 1 byte by definition. Four rules come out of this program:"),
        numbered([
            "**`a[i]` is defined as `*(a + i)`.** Indexing is pointer arithmetic plus a dereference. (That is also why the odd `3[scans]` compiles: `*(3 + scans)` is the same sum. Do not write it.)",
            "**An array decays to a pointer to its first element.** In almost every expression, `scans` becomes `&scans[0]`, of type `int *`. The exceptions are `sizeof scans` and `&scans`.",
            "**Subtracting two pointers into the same array gives the distance in elements.** The type is `ptrdiff_t` from `<stddef.h>`, a signed integer type (8 bytes here); print it with `%td`.",
            "**The one-past-the-end pointer is valid but must not be dereferenced.** For an array of 5, `scans + 5` may be formed, compared and subtracted. Reading `*(scans + 5)` is UB, and so is even computing `scans + 6` or `scans - 1`.",
        ]),
        image("pointer-arithmetic-memory", {
            alt: "Top: the array int scans[5] = {12, 0, 7, 31, 4} drawn as five 4-byte cells at addresses 0x...f40, f44, f48, f4c and f50, followed by a dashed sixth cell at 0x...f54 labelled one past the end, do not read. Arrows point from p = scans to the first cell, from p + 1 to the second cell (4 bytes further, not 1), and from end = scans + 5 to the dashed cell; end - scans = 5 elements, of type ptrdiff_t. A note says scans[i] is *(scans + i). Bottom left, red: apply_return(int stock, int qty) gets a copy of 120 at a different address, adds 3 to the copy, and main still has 120. Bottom right, green: apply_return(int *stock, int qty) gets the address of main's stock and writes *stock += 3, so main has 123.",
            caption: "p + 1 moves one element (4 bytes for int); the end pointer may be formed but never read; a function changes the caller's variable only through its address.",
        }),
        h3("Decay: why functions need the length"),
        p("Lesson 1.2 said that passing an array to a function passes a pointer. Now you can see it. A parameter written as an array is **adjusted** to a pointer, so `sizeof` inside the function measures the pointer:"),
        code("c", String.raw`
#include <stdio.h>

void report(int scans[5]) {              /* really: int *scans */
    printf("in report: sizeof scans = %zu\n", sizeof scans);
}

int main(void) {
    int scans[5] = {12, 0, 7, 31, 4};
    printf("in main:   sizeof scans = %zu\n", sizeof scans);
    report(scans);                       /* scans decays to &scans[0] */
    return 0;
}`, "decay.c"),
        code("text", `
main.c:4:54: warning: 'sizeof' on array function parameter 'scans' will return size of 'int *' [-Wsizeof-array-argument]
in main:   sizeof scans = 20
in report: sizeof scans = 8`),
        p("The `5` in `int scans[5]` is ignored by the compiler. A function that works on an array therefore gets either a pointer and a length (`int *a, size_t n`), or two pointers: `first` and `last`, where `last` is the one-past-the-end pointer. The pair describes the **half-open range** `[first, last)` from lesson 1.2, and it has a nice property: the number of elements is `last - first`, and an empty range is simply `first == last`."),
        code("c", String.raw`
#include <stdio.h>
#include <stddef.h>

long long total_scans(const int *first, const int *last) {
    long long total = 0;
    for (const int *p = first; p != last; ++p) {
        total += *p;                     /* read only */
    }
    return total;
}

int main(void) {
    int scans[5] = {12, 0, 7, 31, 4};
    printf("all:    %lld\n", total_scans(scans, scans + 5));
    printf("middle: %lld\n", total_scans(scans + 1, scans + 4));
    printf("empty:  %lld\n", total_scans(scans, scans));
    return 0;
}`, "walk.c"),
        code("text", `
all:    54
middle: 38
empty:  0`),
        p("`++p` moves the pointer to the next element. The loop stops at `p != last` **before** it dereferences, so `*last` is never read. A sub-range (`scans + 1` to `scans + 4` is 0, 7, 31) costs nothing: no copy, just two other pointers. Check that you can predict pointer arithmetic before moving on:"),
        challenge("chal_quiz_cf_211"),

        h2("6. const int *: read-only input"),
        p("`total_scans` only reads. Its parameters are `const int *`: a pointer to an int that **may not be changed through this pointer**. The caller can pass a normal `int *` (adding `const` is automatic), and the compiler stops any write:"),
        code("c", String.raw`
long long total_scans(const int *first, const int *last) {
    long long total = 0;
    for (const int *p = first; p != last; ++p) {
        *p = 0;                          /* oops: try to write */
        total += *p;
    }
    return total;
}`, "const.c"),
        code("text", `
main.c: In function 'total_scans':
main.c:4:12: error: assignment of read-only location '*p'
    4 |         *p = 0;                          /* oops: try to write */
      |            ^`),
        bullets([
            "`const int *p`: the **ints** are read-only through `p`; `p` itself can move (`++p` is fine). This is what input parameters use.",
            "`int *const p`: the **pointer** is fixed, the ints can be changed. Rarely needed in parameters.",
            "A signature is documentation: `void f(const int *a, size_t n)` promises to read the array; `void f(int *a, size_t n)` tells the reader it may change it.",
        ]),

        h2("7. Editing an array in place with two pointers"),
        p("\"In place\" means the function changes the caller's array directly instead of building a new one. Pointers make this natural: keep two of them and move them toward each other or one after the other. Here is a reversal with a pointer from each end:"),
        code("c", String.raw`
#include <stdio.h>

/* Reverses [first, last) in place. last is one past the end. */
void reverse_scans(int *first, int *last) {
    while (last - first > 1) {           /* at least two elements left */
        --last;                          /* now last points AT the last element */
        int tmp = *first;
        *first = *last;
        *last = tmp;
        ++first;
    }
}

void print_scans(const int *first, const int *last) {
    for (const int *p = first; p != last; ++p) {
        printf("%d ", *p);
    }
    printf("\n");
}

int main(void) {
    int odd[5] = {12, 0, 7, 31, 4};
    int even[4] = {1, 2, 3, 4};
    reverse_scans(odd, odd + 5);
    reverse_scans(even, even + 4);
    reverse_scans(even, even);           /* empty range: nothing to do */
    print_scans(odd, odd + 5);
    print_scans(even, even + 4);
    return 0;
}`, "reverse.c"),
        code("text", `
4 31 7 0 12
4 3 2 1`),
        p("Notice the order inside the loop: `last` is decremented **before** it is dereferenced, because on entry it points one past the end. The condition `last - first > 1` handles an empty range, one element and both odd and even lengths, and the program runs clean under `-fsanitize=address,undefined`."),
        p("A second classic shape uses a **read** pointer and a **write** pointer that both start at `first` and move in the same direction: the read pointer visits every element, the write pointer only moves when an element is kept, so it never gets ahead of the reader. That is exactly what the nightly clean-up of SCN-07's weight readings needs. Build it:"),
        challenge("chal_coding_cf_212", "Use a write pointer that starts at first and a read pointer that visits every element up to (not including) last. Copy a reading to *write only when it is > 0, and only then move write. The count is the distance from first to write. Track the maximum in a local variable and store it through max_kept only if something was kept."),

        h2("8. The fix"),
        p("The returns code now takes the address of the stock, rejects nonsense input, and reports success through its return value. It uses `ckd_add` from lesson 1.1, so a huge quantity cannot overflow the stock (signed overflow is UB):"),
        code("c", String.raw`
#include <stdio.h>
#include <stdckdint.h>

/* Adds a customer return to the caller's stock.
   Returns false (and leaves *stock unchanged) if qty is not positive or the sum would overflow. */
bool apply_return(int *stock, int qty) {
    if (stock == NULL || qty <= 0) {
        return false;
    }
    int updated;
    if (ckd_add(&updated, *stock, qty)) {
        return false;
    }
    *stock = updated;
    return true;
}

int main(void) {
    int tea_500 = 120;
    bool ok = apply_return(&tea_500, 3);         /* LM-1042: 3 boxes back */
    printf("ok=%d stock=%d\n", ok, tea_500);

    ok = apply_return(&tea_500, -5);             /* scanner sent a negative qty */
    printf("ok=%d stock=%d\n", ok, tea_500);

    int full = 2147483647;
    ok = apply_return(&full, 1);
    printf("ok=%d stock=%d\n", ok, full);
    return 0;
}`, "returns.c"),
        code("text", `
ok=1 stock=123
ok=0 stock=123
ok=0 stock=2147483647`),
        numbered([
            "**`int *stock`** is an out-parameter: the function writes the caller's variable through it, and the call site shows it with `&tea_500`.",
            "**The NULL check** comes first, so the function never dereferences a null pointer.",
            "**The result is computed in a local `updated`** and stored with `*stock = updated` only when everything succeeded, so a failed call leaves the caller's stock untouched.",
            "**The return value is a success flag** (`bool` is a keyword in C23). The scanner loop now logs \"return applied\" only when `apply_return` returns `true`.",
        ]),

        h2("9. Pitfalls"),
        bullets([
            "**Assigning to the parameter instead of through it.** `stock = ...` or `a = b` inside a function changes the local copy. To change the caller's value, write `*stock = ...`.",
            "**Returning the address of a local variable.** It dangles as soon as the function returns; gcc warns with `-Wreturn-local-addr`. Never ignore that warning.",
            "**Reading the one-past-the-end element.** `end` may be compared and subtracted, never dereferenced. Loops over `[first, last)` test `p != last` before they read `*p`.",
            "**Forming a pointer outside the array.** `a - 1` or `a + n + 1` is UB even if you never read through it. A backward loop like `for (p = last - 1; p >= first; --p)` forms `first - 1` at the end: count down with `while (p != first) { --p; ... }` instead.",
            "**Mixing up bytes and elements.** `p + 1` moves `sizeof *p` bytes; `last - first` counts elements. Only `char *` arithmetic counts bytes.",
            "**Printing pointers wrongly.** `%p` needs a `void *`: write `printf(\"%p\", (void *)p)`. Print a `ptrdiff_t` with `%td` and a `size_t` with `%zu`.",
            "**`int *a, b;`** declares one pointer and one int. Declare pointers one per line.",
        ]),

        h2("10. Checklist"),
        bullets([
            "A function that must change the caller's variable takes its address (`int *out`) and writes `*out`; the caller passes `&var`.",
            "Check pointer parameters for `NULL` before dereferencing, and compute results in a local before storing them through an out-parameter.",
            "Read-only input is `const int *`; a function that changes an array takes `int *` and says so in its comment.",
            "Pass arrays as a pointer plus a length or as `[first, last)`; never rely on `sizeof` of a parameter.",
            "Stay inside `[first, last]` when forming pointers, and never dereference `last`.",
            "Print addresses with `%p` and `(void *)`, pointer differences with `%td`.",
            "Run new pointer code with `-fsanitize=address,undefined` and fix every report.",
        ]),
    ],
});
