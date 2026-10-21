/*
 * Lotus Mart scanlog: load the night's scan records into a growable array.
 *
 * struct scan_vec { struct scan *data; size_t len; size_t cap; } starts as {nullptr, 0, 0}.
 *
 * Write vec_push and vec_free.
 *
 * bool vec_push(struct scan_vec *v, struct scan s)
 *   - Appends s at the end and returns true.
 *   - When the array is full (len == cap), grow it first: the first allocation makes room for
 *     4 records, after that the capacity doubles (4, 8, 16, 32, ...).
 *   - Allocate ONLY with xrealloc(ptr, bytes) (the runner's realloc: it counts blocks and can
 *     be told to fail). xrealloc(nullptr, bytes) allocates a new block, like realloc.
 *   - If xrealloc returns nullptr: return false and change nothing. data, len, cap and every
 *     record already stored stay exactly as they were (the old block is still valid).
 *
 * void vec_free(struct scan_vec *v)
 *   - Releases the block with xfree (not free) and resets v to {nullptr, 0, 0}.
 *
 * Example: 5 pushes print  len=1 cap=4, len=2 cap=4, len=3 cap=4, len=4 cap=4, len=5 cap=8
 * (2 xrealloc calls). If the 2nd xrealloc fails, the 5th push returns false and the vector
 * still holds the first 4 records with len=4 cap=4.
 */
#include <stdckdint.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

struct scan {
    char sku[9];   // up to 8 characters + '\0'
    int32_t qty;
    int64_t ts;
};

struct scan_vec {
    struct scan *data;
    size_t len;    // records in use
    size_t cap;    // records the block can hold
};

void *xrealloc(void *ptr, size_t bytes);
void xfree(void *ptr);

bool vec_push(struct scan_vec *v, struct scan s) {
    if (v->len == v->cap) {
        v->cap = v->cap == 0 ? 4 : v->cap * 2;
        struct scan *tmp = xrealloc(v->data, v->cap * sizeof *v->data);
        if (tmp == nullptr) {
            return false;
        }
        v->data = tmp;
    }
    v->data[v->len] = s;
    v->len++;
    return true;
}

void vec_free(struct scan_vec *v) {
    xfree(v->data);
    *v = (struct scan_vec){};
}

/* ---- test runner (do not change) ---- */
/*
 * stdin, one command per line:
 *   fail_at=N        (optional, first line) the N-th xrealloc call returns nullptr
 *   SKU QTY          push one record
 *   bulk COUNT SKU   push COUNT records of SKU with qty 1 (prints one line)
 * The runner stops at the first failed push, like the nightly tool does, prints the
 * total quantity per SKU (first-seen order), then calls vec_free and checks for leaks.
 */
static long xrealloc_calls;
static long fail_at;
static long live_blocks;

void *xrealloc(void *ptr, size_t bytes) {
    xrealloc_calls++;
    if (xrealloc_calls == fail_at || bytes == 0) {
        return nullptr;
    }
    void *p = realloc(ptr, bytes);
    if (p != nullptr && ptr == nullptr) {
        live_blocks++;
    }
    return p;
}

void xfree(void *ptr) {
    if (ptr != nullptr) {
        live_blocks--;
        free(ptr);
    }
}

// Pushes one record and reports a failure. Returns false when the runner must stop.
static bool push_checked(struct scan_vec *v, const char *sku, int32_t qty, bool quiet, long *pushed) {
    struct scan s = { .qty = qty, .ts = 1'790'000'000 + v->len };
    snprintf(s.sku, sizeof s.sku, "%s", sku);
    struct scan *before = v->data;
    size_t len_before = v->len;
    if (vec_push(v, s)) {
        (*pushed)++;
        if (!quiet) {
            printf("push %s ok len=%zu cap=%zu\n", sku, v->len, v->cap);
        }
        return true;
    }
    printf("push %s failed len=%zu cap=%zu data=%s\n", sku, v->len, v->cap,
           v->data == before ? "kept" : "changed");
    if (v->data != before || v->len != len_before) {
        printf("records lost\n");
        v->len = 0;    // do not read records the vector no longer owns
    }
    return false;
}

int main(void) {
    struct scan_vec v = { nullptr, 0, 0 };
    char line[128];
    bool first = true;
    while (fgets(line, sizeof line, stdin) != nullptr) {
        char sku[9];
        long n;
        int qty;
        long pushed = 0;
        if (first && sscanf(line, "fail_at=%ld", &n) == 1) {
            fail_at = n;
        } else if (sscanf(line, "bulk %ld %8s", &n, sku) == 2) {
            bool ok = true;
            for (long i = 0; i < n && ok; i++) {
                ok = push_checked(&v, sku, 1, true, &pushed);
            }
            printf("bulk %s pushed=%ld len=%zu cap=%zu\n", sku, pushed, v.len, v.cap);
            if (!ok) {
                printf("stop: out of memory\n");
                break;
            }
        } else if (sscanf(line, "%8s %d", sku, &qty) == 2) {
            if (!push_checked(&v, sku, qty, false, &pushed)) {
                printf("stop: out of memory\n");
                break;
            }
        }
        first = false;
    }

    // total quantity per SKU, in first-seen order
    if (v.len == 0) {
        printf("no records\n");
    }
    for (size_t i = 0; i < v.len; i++) {
        bool seen = false;
        for (size_t j = 0; j < i && !seen; j++) {
            seen = strcmp(v.data[j].sku, v.data[i].sku) == 0;
        }
        if (seen) {
            continue;
        }
        long long total = 0;
        for (size_t j = i; j < v.len; j++) {
            if (strcmp(v.data[j].sku, v.data[i].sku) == 0) {
                total += v.data[j].qty;
            }
        }
        printf("%s total=%lld\n", v.data[i].sku, total);
    }

    printf("xrealloc calls=%ld\n", xrealloc_calls);
    vec_free(&v);
    printf("after free: len=%zu cap=%zu live_blocks=%ld\n", v.len, v.cap, live_blocks);
    return 0;
}
