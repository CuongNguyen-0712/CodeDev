/*
 * Validate the quantities that warehouse operators type at the scanner prompt.
 *
 * Write parse_qty(line, out). `line` is one input line WITHOUT its '\n' (the runner
 * strips it). A valid quantity is a base-10 integer from 1 to 9999.
 *
 * Requirements - check in this order and return the FIRST problem found:
 *   1. PARSE_EMPTY         the line is empty or contains only whitespace ("", "   ").
 *   2. PARSE_NOT_A_NUMBER  no digits where the number should start ("abc", "-", "x42").
 *                          Leading whitespace and one '+' or '-' sign are allowed
 *                          (" 42", "+42" and "-1" all START with a number).
 *   3. PARSE_TRAILING      anything except whitespace after the number ("12a", "1 2",
 *                          "0x1A"). Whitespace after the number is allowed ("42 ", "42\t").
 *   4. PARSE_OUT_OF_RANGE  the number is outside 1..9999, including numbers too big for
 *                          a long ("0", "-1", "10000", "99999999999999999999").
 *   Otherwise store the value in *out and return PARSE_OK. Leave *out alone on errors.
 *
 * The runner prints one line per input line:
 *   PARSE_OK -> "ok 42"            PARSE_TRAILING     -> "error: trailing characters"
 *   PARSE_EMPTY -> "error: empty"  PARSE_OUT_OF_RANGE -> "error: out of range"
 *   PARSE_NOT_A_NUMBER -> "error: not a number"
 *   A line longer than the runner's buffer prints "error: line too long".
 *
 * Example input:      Output:
 *   42                  ok 42
 *   12kg                error: trailing characters
 *   (empty line)        error: empty
 *    +7                 ok 7
 *   10000               error: out of range
 *
 * Use strtol (base 10) with errno and endptr. Do not use atoi, sscanf or scanf.
 */
#include <ctype.h>
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

enum parse_result {
    PARSE_OK,
    PARSE_EMPTY,
    PARSE_NOT_A_NUMBER,
    PARSE_TRAILING,
    PARSE_OUT_OF_RANGE,
};

enum parse_result parse_qty(const char *line, int *out) {
    const char *p = line;
    while (isspace((unsigned char)*p))
        p++;
    if (*p == '\0')
        return PARSE_EMPTY;

    char *end;
    errno = 0;
    int v = strtol(line, &end, 10);  // long -> int before the range check
    if (end == line)
        return PARSE_NOT_A_NUMBER;
    while (isspace((unsigned char)*end))
        end++;
    if (*end != '\0')
        return PARSE_TRAILING;
    if (errno == ERANGE || v < 1 || v > 9999)
        return PARSE_OUT_OF_RANGE;
    *out = v;
    return PARSE_OK;
}

/* ---- test runner (do not change) ---- */
/* Reads lines from stdin with fgets, strips the '\n', calls parse_qty and prints the result. */
int main(void) {
    static const char *const messages[] = {
        [PARSE_EMPTY] = "empty",
        [PARSE_NOT_A_NUMBER] = "not a number",
        [PARSE_TRAILING] = "trailing characters",
        [PARSE_OUT_OF_RANGE] = "out of range",
    };
    char line[32];
    while (fgets(line, sizeof line, stdin) != nullptr) {
        size_t len = strcspn(line, "\n");
        if (line[len] == '\n') {
            line[len] = '\0';
        } else {
            int c = fgetc(stdin);
            if (c != '\n' && c != EOF) {
                while (c != '\n' && c != EOF)
                    c = fgetc(stdin);
                printf("error: line too long\n");
                continue;
            }
        }
        int qty = -12345;
        enum parse_result r = parse_qty(line, &qty);
        if (r == PARSE_OK)
            printf("ok %d\n", qty);
        else if (r >= PARSE_EMPTY && r <= PARSE_OUT_OF_RANGE && qty == -12345)
            printf("error: %s\n", messages[r]);
        else
            printf("bad result: %d (and *out must be unchanged on errors)\n", (int)r);
    }
}
