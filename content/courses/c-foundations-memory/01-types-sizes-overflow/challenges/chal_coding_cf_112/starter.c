/*
 * Lotus Mart nightly stock tool: add up one SKU's scanner log for the day.
 *
 * Every line of the log is one signed quantity for the same SKU, in scan order:
 *   +24  a carton received,  -3  boxes picked for orders,  +1  a customer return.
 * The tool stores the running total after EVERY line in a 32-bit field (int32_t),
 * so every running total must fit in int32_t - not only the last one.
 *
 * Write sum_scans(qty, n, total):
 *   - qty[0] .. qty[n-1] are the quantities; qty[0] is line 1 of the log.
 *     n can be 0 (no scans today): the total is then 0.
 *   - Add them in order, starting from 0, with ckd_add from <stdckdint.h>.
 *     Never let a signed addition overflow (that is undefined behaviour).
 *   - If every running total fits in int32_t: store the sum with  *total = sum;
 *     and return 0.
 *   - Otherwise return the line number (1-based) of the FIRST quantity whose addition
 *     does not fit, and stop there. *total is not used in that case.
 *
 * Examples (the runner prints the result):
 *   lines 12, 5, -3, 20              ->  total=34
 *   lines 2147483000, 600, 48, -10   ->  overflow at line 3
 *
 * Build: gcc -std=c23 -Wall -Wextra -g sum_scans.c -o sum_scans
 * Run:   printf '12\n5\n-3\n20\n' | ./sum_scans
 */
#include <limits.h>
#include <stdckdint.h>
#include <stdint.h>
#include <stdio.h>

/* Returns 0 and stores the sum in *total, or the 1-based line of the first overflow. */
size_t sum_scans(const int32_t qty[], size_t n, int32_t *total)
{
    int32_t sum = 0;
    for (size_t i = 0; i < n; i++) {
        /* TODO: add qty[i] to sum with ckd_add and stop at the first overflow */
        (void)qty[i];
    }
    *total = sum;
    return 0;
}

/* ---- test runner (do not change) ---- */
/* Reads one signed quantity per line from stdin (at most 1000 lines; no lines = no scans),
   calls sum_scans() and prints "total=N" or "overflow at line N". */
int main(void)
{
    static int32_t qty[1000];
    size_t n = 0;
    long value;
    while (n < 1000 && scanf("%ld", &value) == 1) {
        if (value < INT32_MIN || value > INT32_MAX) {
            printf("bad input: %ld does not fit in int32_t\n", value);
            return 1;
        }
        qty[n] = (int32_t)value;
        n++;
    }

    int32_t total = 0;
    size_t line = sum_scans(qty, n, &total);
    if (line == 0)
        printf("total=%d\n", total);
    else
        printf("overflow at line %zu\n", line);
    return 0;
}
