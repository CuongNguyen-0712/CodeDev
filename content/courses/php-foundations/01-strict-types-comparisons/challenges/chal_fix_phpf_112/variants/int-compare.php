<?php
declare(strict_types=1);

// Hồ Gươm Books - voucher redemption at checkout.
//
// Input (stdin), one command per line:
//   voucher CODE VALUE   a printed voucher: CODE is a string of digits (leading zeros are part of it),
//                        VALUE its discount in VND
//   redeem ENTERED       a customer types ENTERED at checkout
//
// For every redeem line the test runner prints one line:
//   ENTERED: ok, voucher CODE -VALUE VND   the voucher whose code is EXACTLY ENTERED, redeemed for the first time
//   ENTERED: unknown voucher               no voucher has exactly this code
//   ENTERED: already used                  this voucher was redeemed before
//
// Two campaigns run at the same time: newspaper vouchers have 5 digits, scratch cards have 6,
// so "73311" and "073311" are two different vouchers. "500100.0", "5.001e5" and "0500100" are not 500100.
//
// Bug reports from the finance desk:
//   - "500100.0" was accepted at checkout as voucher 500100.
//   - A customer typed the newspaper voucher 73311 and got scratch card 073311's discount instead;
//     another customer with newspaper voucher 73311 was told it was already used.
//
// Fix findVoucher and isUsed. The test runner at the bottom is correct.

/**
 * Index of the voucher whose code is exactly $entered, or false when there is none.
 *
 * @param list<string> $codes
 */
function findVoucher(array $codes, string $entered): int|false
{
    // "Fixed" by comparing numbers: still treats 73311 and 073311 as one voucher.
    foreach ($codes as $i => $code) {
        if ((int) $code === (int) $entered && is_numeric($entered)) {
            return $i;
        }
    }
    return false;
}

/**
 * Whether the voucher with this code was redeemed before.
 *
 * @param list<string> $used codes of the vouchers redeemed so far
 */
function isUsed(array $used, string $code): bool
{
    return in_array($code, $used, true);
}

// ---------------------------------------------------------------- test runner (do not change)
$codes = [];
$values = [];
$used = [];
foreach (explode("\n", stream_get_contents(STDIN)) as $line) {
    $f = preg_split('/\s+/', trim($line));
    if ($f[0] === 'voucher' && count($f) === 3) {
        $codes[] = $f[1];
        $values[] = (int) $f[2];
    } elseif ($f[0] === 'redeem' && count($f) === 2) {
        $entered = $f[1];
        $i = findVoucher($codes, $entered);
        if ($i === false) {
            echo "$entered: unknown voucher\n";
        } elseif (isUsed($used, $codes[$i])) {
            echo "$entered: already used\n";
        } else {
            $used[] = $codes[$i];
            echo "$entered: ok, voucher {$codes[$i]} -{$values[$i]} VND\n";
        }
    }
}
