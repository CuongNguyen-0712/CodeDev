<?php
declare(strict_types=1);

// Hồ Gươm Books - the invoice for an international order, in USD. Money is counted in CENTS (int).
// No float may touch an amount: 19.99 * 100 is 1998.9999999999998 in floating point.
//
// Input (stdin), one line each:
//   item QTY PRICE VAT TITLE   e.g. "item 2 19.99 10 Clean Code (ebook)": 2 copies at 19.99, 10% VAT
//   discount PERCENT           optional, e.g. "discount 12.5": a discount on every line, before VAT
//
// Write the functions below. invoice() returns the lines of the invoice:
//   TITLE: QTY x UNIT = NET        one line per item, NET = QTY x UNIT
//   subtotal: S                    the sum of NET
//   discount P%: -D                only when the input has a discount line; P exactly as given
//   VAT: V                         the sum of the VAT of every line
//   total: T                       S - D + V
// Per line, in cents:  lineDiscount = P% of NET;  lineVat = VAT% of (NET - lineDiscount)
// Every percentage is rounded per line to a whole cent, half up (100.5 cents -> 101).
// Amounts are printed with two decimals and no thousands separator: 1234.50, 0.05, 7.00
//
// Amounts and percents in the input have at most two decimals ("19.9" is 19.90, "20" is 20.00).
// Anything else ("19.999", "19,99", "-5", "1e3") is invalid: throw an InvalidArgumentException
// with the message "bad amount '19.999'" or "bad percent '8,5'"; a percent above 100 is a bad percent.
// Check the discount first, then the items in order. The test runner prints "error: " + the message.

/** "19.99" -> 1999, "19.9" -> 1990, "20" -> 2000 */
function toCents(string $amount): int
{
    // TODO
    return 0;
}

/** "10" -> 1000, "12.5" -> 1250, "5.25" -> 525 (1% = 100 basis points) */
function toBasisPoints(string $percent): int
{
    // TODO
    return 0;
}

/** $bp basis points of $cents, rounded half up to a whole cent */
function percentOf(int $cents, int $bp): int
{
    // TODO
    return 0;
}

/** 123450 -> "1234.50", 5 -> "0.05" */
function formatCents(int $cents): string
{
    // TODO
    return (string) $cents;
}

/**
 * @param list<array{int, string, string, string}> $items [qty, price, vat percent, title]
 * @return list<string>
 */
function invoice(array $items, ?string $discount): array
{
    // TODO
    return [];
}

// ---------------------------------------------------------------- test runner (do not change)
$items = [];
$discount = null;
foreach (explode("\n", trim(stream_get_contents(STDIN))) as $line) {
    $f = explode(' ', trim($line), 5);
    if ($f[0] === 'item' && count($f) === 5) {
        $items[] = [(int) $f[1], $f[2], $f[3], $f[4]];
    } elseif ($f[0] === 'discount' && count($f) === 2) {
        $discount = $f[1];
    }
}
try {
    echo implode("\n", invoice($items, $discount)), "\n";
} catch (InvalidArgumentException $e) {
    echo 'error: ', $e->getMessage(), "\n";
}
