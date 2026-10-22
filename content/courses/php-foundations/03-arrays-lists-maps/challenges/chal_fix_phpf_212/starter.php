<?php
declare(strict_types=1);

// Hồ Gươm Books - merging the guest cart into the saved cart when a customer logs in.
//
// A cart maps a SKU to a quantity. Books have numeric SKUs ("1021"), other products
// have text SKUs ("HG-TOTE"). Old saved carts can contain lines with quantity 0.
//
// Input (stdin), one line each:
//   saved SKU QTY   a line of the customer's saved cart (in cart order)
//   guest SKU QTY   a line of the cart the customer filled before logging in (in cart order)
//
// Rules for the merged cart:
//   - the saved cart's lines come first, in their order, then the guest-only lines in theirs
//   - a SKU in both carts appears once, with both quantities added, at most MAX_COPIES
//   - lines with quantity 0 are not shown
//
// The test runner prints "SKU x QTY" for every line of cartLines(), then "lines: N, copies: M".
//
// Bug reports after the release:
//   - "My cart lost Truyện Kiều (1021) and showed gift wrapping I never added" (gift wrapping is SKU 1)
//   - "My cart page shows an empty line and the last book is missing"
//
// Fix mergeCarts and cartLines.

const MAX_COPIES = 10;

/**
 * @param array<int|string, int> $saved SKU => quantity
 * @param array<int|string, int> $guest SKU => quantity
 * @return array<int|string, int>
 */
function mergeCarts(array $saved, array $guest): array
{
    $merged = array_merge($saved, $guest);
    foreach ($guest as $sku => $qty) {
        if (isset($saved[$sku])) {
            $merged[$sku] = min(MAX_COPIES, $saved[$sku] + $qty);
        }
    }
    return $merged;
}

/**
 * The lines to show, as a list (keys 0, 1, 2 ...), without the lines whose quantity is 0.
 *
 * @param array<int|string, int> $cart
 * @return list<array{sku: string, qty: int}>
 */
function cartLines(array $cart): array
{
    $lines = [];
    foreach ($cart as $sku => $qty) {
        $lines[] = ['sku' => (string) $sku, 'qty' => $qty];
    }
    foreach ($lines as $i => $line) {
        if ($line['qty'] === 0) {
            unset($lines[$i]);
        }
    }
    return $lines;
}

// ---------------------------------------------------------------- test runner (do not change)
$carts = ['saved' => [], 'guest' => []];
foreach (explode("\n", trim(stream_get_contents(STDIN))) as $row) {
    [$which, $sku, $qty] = preg_split('/\s+/', trim($row));
    $carts[$which][$sku] = (int) $qty;
}
$lines = cartLines(mergeCarts($carts['saved'], $carts['guest']));
$copies = 0;
for ($i = 0; $i < count($lines); $i++) {
    echo "{$lines[$i]['sku']} x {$lines[$i]['qty']}\n";
    $copies += $lines[$i]['qty'];
}
echo 'lines: ' . count($lines) . ", copies: $copies\n";
