<?php
declare(strict_types=1);

// Hồ Gươm Books - the delivery fee, in VND.
//
// Write shippingFee. The rules:
//   delivery   by zone: 'HN' (Hà Nội) 20,000; 'HCM' (Hồ Chí Minh City) 30,000; any other zone 35,000
//   weight     the first 1,000 g are included; +5,000 for every started 500 g above 1,000 g
//              (1,001 g to 1,500 g: +5,000; 1,501 g to 2,000 g: +10,000 ...)
//   express    the delivery part (zone + weight) costs 1.5 times as much
//   campaign   $freeFrom is null when no campaign runs. Otherwise a STANDARD (not express) order
//              with $orderTotal >= $freeFrom pays no delivery part. $freeFrom = 0 is a real
//              campaign: free standard delivery for every order.
//   surcharges always added, campaign or not: insured +15,000, cash on delivery (cod) +10,000
//
// The test runner reads one JSON object per test and calls shippingFee with NAMED arguments
// (shippingFee(...$args)), so keep the parameter names and defaults exactly as they are.
// Missing keys use the defaults. Example: {"grams": 1600, "zone": "HN", "orderTotal": 250000,
// "express": true} -> (20,000 + 10,000) x 1.5 = 45000

function shippingFee(
    int $grams,
    string $zone,
    int $orderTotal,
    bool $express = false,
    bool $insured = false,
    ?int $freeFrom = null,
    bool $cod = false,
): int {
    $fee = match ($zone) {
        'HN' => 20000,
        'HCM' => 30000,
        default => 35000,
    };
    if ($grams > 1000) {
        $fee += 5000 * intdiv($grams - 1000 + 499, 500); // every STARTED 500 g
    }
    if ($express) {
        $fee = intdiv($fee * 3, 2);
    }
    if ($freeFrom !== null && !$express && $orderTotal >= $freeFrom) {
        return 0;
    }
    return $fee + ($insured ? 15000 : 0) + ($cod ? 10000 : 0);
}

// ---------------------------------------------------------------- test runner (do not change)
$args = json_decode(stream_get_contents(STDIN), true, flags: JSON_THROW_ON_ERROR);
echo shippingFee(...$args), "\n";
