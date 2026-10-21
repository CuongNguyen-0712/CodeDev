/*
 * Lotus Mart warehouse, Binh Duong: nightly clean-up of scanner SCN-07's weight readings.
 *
 * A reading <= 0 is a misread (the scale was empty or not calibrated) and must be dropped.
 *
 * Write: size_t compact_scans(int *first, int *last, int *max_kept)
 *
 * Requirements:
 *   - [first, last) is a half-open range: last points ONE PAST the last reading.
 *     first == last means there are no readings.
 *   - Remove every reading <= 0 IN PLACE: move the readings > 0 to the front of the range,
 *     keeping their original order. Return how many readings were kept (count).
 *     After the call, first[0] .. first[count - 1] are the kept readings; what is left in
 *     the rest of the range does not matter.
 *   - Out-parameter: if at least one reading was kept, store the largest kept reading in
 *     *max_kept. If nothing was kept, do not touch *max_kept.
 *   - Never read or write outside [first, last). Do not allocate memory.
 *
 * Example: readings 5 0 7 -3 9 0 2 -1  ->  returns 4, the range starts with 5 7 9 2,
 *          *max_kept = 9.
 *
 * The test runner prints:
 *   count=4
 *   kept=5 7 9 2
 *   max=9            (max=none when *max_kept was not written)
 *   guard=ok         (guard=broken if you wrote outside the range)
 */
#include <limits.h>
#include <stddef.h>
#include <stdio.h>
#include <string.h>

size_t compact_scans(int *first, int *last, int *max_kept) {
    int *write = first;
    size_t count = 0;
    int max = 0;
    for (const int *read = first; read != last; ++read) {
        if (*read > 0) {
            if (*read > max) {
                max = *read;
            }
            *write = *read;     /* the write pointer never moves */
            count++;
        }
    }
    if (count > 0) {
        *max_kept = max;
    }
    return count;
}

/* ---- test runner (do not change) ---- */
/* Input: the number of readings n (0..1000) on the first line, then n readings.
   The runner stores the readings in the middle of a bigger array whose other bytes are '#',
   so it can check that compact_scans() wrote nothing outside [first, last). */
#define MAX_SCANS 1000

int main(void) {
    static int buf[MAX_SCANS + 2];
    long long n_in;
    if (scanf("%lld", &n_in) != 1 || n_in < 0 || n_in > MAX_SCANS) {
        printf("error: bad count\n");
        return 0;
    }
    size_t n = (size_t)n_in;

    int guard;
    memset(&guard, '#', sizeof guard);
    memset(buf, '#', sizeof buf);
    int *first = buf + 1;
    for (size_t i = 0; i < n; i++) {
        if (scanf("%d", &first[i]) != 1) {
            printf("error: bad reading\n");
            return 0;
        }
    }

    int max_kept = INT_MIN; /* kept readings are > 0, so INT_MIN means "not written" */
    size_t count = compact_scans(first, first + n, &max_kept);

    printf("count=%zu\n", count);
    if (count > n) {
        printf("error: count is larger than the number of readings\n");
    } else {
        printf("kept=");
        for (size_t i = 0; i < count; i++) {
            printf(i ? " %d" : "%d", first[i]);
        }
        printf("\n");
    }
    if (max_kept == INT_MIN) {
        printf("max=none\n");
    } else {
        printf("max=%d\n", max_kept);
    }
    printf("guard=%s\n", buf[0] == guard && buf[n + 1] == guard ? "ok" : "broken");
    return 0;
}
