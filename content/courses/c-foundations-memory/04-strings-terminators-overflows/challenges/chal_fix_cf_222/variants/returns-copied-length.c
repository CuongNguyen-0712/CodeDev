/*
 * Lotus Mart label printer: copy one field (customer name, city, ...) into its fixed-size slot.
 *
 * size_t label_copy(char *dst, size_t cap, const char *src)
 *
 * Requirements:
 *   - dst points to a slot of exactly cap bytes. Never write outside dst[0] .. dst[cap - 1].
 *   - If cap > 0, dst always ends up holding a terminated string: as much of src as fits in
 *     cap - 1 bytes, followed by '\0'.
 *   - If cap == 0, there is no room at all: write nothing.
 *   - Return strlen(src), the length of the WHOLE source, even when it was cut, so the caller
 *     can detect truncation with: if (label_copy(dst, cap, src) >= cap) { ... cut ... }
 *
 * Example:
 *   char name[16];
 *   label_copy(name, sizeof name, "Nguyen Thi Phuong Thao")  -> returns 22,
 *   name holds "Nguyen Thi Phuo" (15 chars + '\0'), and 22 >= 16 tells the caller it was cut.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

size_t label_copy(char *dst, size_t cap, const char *src)
{
    size_t len = strlen(src);
    if (cap == 0)
        return 0;
    size_t n = len < cap - 1 ? len : cap - 1;
    memcpy(dst, src, n);
    dst[n] = '\0';
    return n;                               /* the caller can no longer see the cut */
}

/* ---- test runner (do not change) ---- */
/* Input: line 1 = cap (0..64), line 2 = the source text (may be empty).
 * The slot lives in the middle of a bigger array filled with '#', so a write outside the slot
 * lands on a guard byte (still inside the array, so no UB) and is reported as guard=broken. */
#define GUARD 8
#define MAX_CAP 64

int main(void)
{
    static char arena[GUARD + MAX_CAP + GUARD];
    char line[256];
    char src[256] = "";

    if (!fgets(line, sizeof line, stdin)) {
        puts("error: no cap");
        return 1;
    }
    char *end;
    long cap = strtol(line, &end, 10);
    if (end == line || cap < 0 || cap > MAX_CAP) {
        puts("error: bad cap");
        return 1;
    }
    if (fgets(src, sizeof src, stdin))
        src[strcspn(src, "\r\n")] = '\0';

    memset(arena, '#', sizeof arena);
    char *dst = arena + GUARD;
    size_t ret = label_copy(dst, (size_t)cap, src);

    size_t shown = 0;                       /* bytes before the first '\0' inside the slot */
    while (shown < (size_t)cap && dst[shown] != '\0')
        shown++;
    bool guard_ok = true;
    for (size_t i = 0; i < sizeof arena; i++) {
        bool inside = i >= GUARD && i < GUARD + (size_t)cap;
        if (!inside && arena[i] != '#')
            guard_ok = false;
    }

    printf("ret=%zu\n", ret);
    printf("text=[%.*s]\n", (int)shown, dst);   /* never reads past the slot */
    printf("terminated=%s\n", cap == 0 ? "-" : (shown < (size_t)cap ? "yes" : "no"));
    printf("truncated=%s\n", ret >= (size_t)cap ? "yes" : "no");
    printf("guard=%s\n", guard_ok ? "ok" : "broken");
    return 0;
}
