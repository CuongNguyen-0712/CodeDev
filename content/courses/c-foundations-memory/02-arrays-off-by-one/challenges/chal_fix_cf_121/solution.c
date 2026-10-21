/*
 * Lotus Mart warehouse tools: busiest window in a scanner log.
 *
 * The staffing planner books extra pickers for the busiest k days in a row.
 * best_window() finds that window in the daily scan counts of one scanner.
 *
 * Requirements:
 *   - scans holds n daily counts, scans[0] .. scans[n - 1] (each 0 .. 100000, n <= 1000).
 *   - A k-day window starting at day s covers the half-open range [s, s + k):
 *     days s, s + 1, ..., s + k - 1. Its total is the sum of those k counts.
 *   - Return the start day of the window with the biggest total. Every window that
 *     fits must be considered, including the first one and the last one.
 *   - Ties: if several windows have the same biggest total, the EARLIEST one wins.
 *   - k == n is valid: the only window is the whole log, starting at day 0.
 *   - If no window fits (k == 0 or k > n), return n. n is never a valid start day.
 *   - Never read outside scans[0] .. scans[n - 1].
 *
 * Example: scans = {412, 389, 450, 401, 467, 488, 530} (Mon..Sun), n = 7, k = 3
 *   windows start at day 0 .. 4; the busiest is [4, 7) = Fri..Sun, 1485 scans
 *   -> best_window returns 4, and the runner prints "busiest [4, 7) total=1485"
 *   With k = 8 there is no window: best_window returns 7 -> "no window (k=8, n=7)"
 */
#include <stdio.h>

size_t best_window(const int scans[], size_t n, size_t k)
{
    if (k == 0 || k > n)
        return n;

    size_t best_start = 0;
    int best_total = -1;
    for (size_t start = 0; start + k <= n; start++) {      /* last start is n - k */
        int total = 0;
        for (size_t d = start; d < start + k; d++)          /* [start, start + k) */
            total += scans[d];
        if (total > best_total) {                           /* strict: earliest tie wins */
            best_total = total;
            best_start = start;
        }
    }
    return best_start;
}

/* ---- test runner (do not change) ---- */
/* Input: "n k" on the first line, then n daily counts. */
#define MAX_DAYS 1000

int main(void)
{
    size_t n, k;
    if (scanf("%zu %zu", &n, &k) != 2 || n > MAX_DAYS) {
        printf("bad input\n");
        return 0;
    }
    int scans[MAX_DAYS];
    for (size_t i = 0; i < n; i++) {
        if (scanf("%d", &scans[i]) != 1) {
            printf("bad input\n");
            return 0;
        }
    }

    size_t start = best_window(scans, n, k);
    if (start == n) {
        printf("no window (k=%zu, n=%zu)\n", k, n);
    } else if (k == 0 || k > n || start > n - k) {
        printf("invalid start %zu (k=%zu, n=%zu)\n", start, k, n);
    } else {
        long total = 0;
        for (size_t d = start; d < start + k; d++)
            total += scans[d];
        printf("busiest [%zu, %zu) total=%ld\n", start, start + k, total);
    }
    return 0;
}
