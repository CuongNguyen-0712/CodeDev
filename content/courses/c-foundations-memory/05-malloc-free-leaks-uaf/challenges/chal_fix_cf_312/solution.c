/*
 * Lotus Mart handheld scanner (SCN-07): the "recent scans" list.
 *
 * The scanner shows the last few product names it scanned. The firmware reads every
 * scan into ONE reused line buffer and calls recent_add() with it.
 *
 * Requirements:
 *   - list[0 .. *len-1] holds the names, oldest first. cap is the list size (at least 1).
 *   - recent_add(list, cap, len, name) stores an OWNED COPY of name (the caller's buffer
 *     is overwritten by the next scan) and returns true. When the list is full
 *     (*len == cap), the oldest entry is dropped first and freed, the others move one
 *     place towards list[0], and the new name goes at the end.
 *     If the copy cannot be allocated, return false and leave the list unchanged.
 *   - recent_free(list, len) frees every entry and sets *len to 0.
 *   - Names can be long (up to 250 characters): keep them complete.
 *   - Allocate and free ONLY with xmalloc / xstrdup / xfree (they work like malloc,
 *     strdup and free; the test runner uses them to count live allocations).
 *
 * Example (cap 2): scans "TEA-500", "MUG-01", "CARD-TET" -> list is "MUG-01", "CARD-TET",
 * "TEA-500" was freed. The runner then prints:
 *   1: MUG-01
 *   2: CARD-TET
 *   count=2
 *   after free: count=0 live_allocations=0
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* provided by the test runner below */
void *xmalloc(size_t size);
char *xstrdup(const char *s);
void xfree(void *ptr);

bool recent_add(char *list[], size_t cap, size_t *len, const char *name) {
    char *copy = xstrdup(name);        /* copy first: on failure nothing has changed */
    if (copy == NULL)
        return false;
    if (*len == cap) {
        xfree(list[0]);                /* drop the oldest */
        for (size_t i = 1; i < cap; i++)
            list[i - 1] = list[i];
        (*len)--;
    }
    list[*len] = copy;
    (*len)++;
    return true;
}

void recent_free(char *list[], size_t *len) {
    for (size_t i = 0; i < *len; i++) {
        xfree(list[i]);
        list[i] = nullptr;
    }
    *len = 0;
}

/* ---- test runner (do not change) ---- */
/* Input: the first line is the capacity (1-64), then one product name per line.
   Every line is read into the SAME buffer `line`, like the scanner firmware does.
   xmalloc/xfree keep a table of blocks: a freed block is filled with '#' and only
   returned to the system at the very end, so a use-after-free prints "####" and a
   double free is reported instead of being undefined behaviour. */
#define MAX_CAP 64
#define MAX_BLOCKS 4096

static struct { char *p; size_t size; bool live; } blocks[MAX_BLOCKS];
static size_t n_blocks = 0;
static long live_allocations = 0;

void *xmalloc(size_t size) {
    if (n_blocks == MAX_BLOCKS) {
        printf("error: too many allocations\n");
        exit(0);
    }
    char *p = malloc(size > 0 ? size : 1);
    if (p == NULL)
        return NULL;
    blocks[n_blocks].p = p;
    blocks[n_blocks].size = size > 0 ? size : 1;
    blocks[n_blocks].live = true;
    n_blocks++;
    live_allocations++;
    return p;
}

char *xstrdup(const char *s) {
    size_t size = strlen(s) + 1;
    char *p = xmalloc(size);
    if (p != NULL)
        memcpy(p, s, size);
    return p;
}

void xfree(void *ptr) {
    if (ptr == NULL)
        return;
    for (size_t i = 0; i < n_blocks; i++) {
        if (blocks[i].p == ptr) {
            if (!blocks[i].live) {
                printf("error: double free\n");
                return;
            }
            blocks[i].live = false;
            live_allocations--;
            memset(blocks[i].p, '#', blocks[i].size - 1);
            blocks[i].p[blocks[i].size - 1] = '\0';
            return;
        }
    }
    printf("error: xfree of a pointer that xmalloc did not return\n");
}

int main(void) {
    char line[256];
    char guard = 0;
    char *slots[MAX_CAP + 1];

    if (!fgets(line, sizeof line, stdin))
        return 0;
    long cap = strtol(line, nullptr, 10);
    if (cap < 1 || cap > MAX_CAP) {
        printf("error: bad capacity\n");
        return 0;
    }
    for (size_t i = 0; i <= MAX_CAP; i++)
        slots[i] = nullptr;
    slots[cap] = &guard;                    /* one past the list: must stay untouched */

    size_t len = 0;
    while (fgets(line, sizeof line, stdin)) {
        line[strcspn(line, "\r\n")] = '\0';
        if (line[0] == '\0')
            continue;
        if (!recent_add(slots, (size_t)cap, &len, line))
            printf("error: recent_add failed for %s\n", line);
    }
    if (slots[cap] != &guard)
        printf("error: wrote past the end of the list\n");

    for (size_t i = 0; i < len && i < (size_t)cap; i++)
        printf("%zu: %s\n", i + 1, slots[i] ? slots[i] : "(null)");
    printf("count=%zu\n", len);

    recent_free(slots, &len);
    printf("after free: count=%zu live_allocations=%ld\n", len, live_allocations);

    for (size_t i = 0; i < n_blocks; i++)
        free(blocks[i].p);
    return 0;
}
