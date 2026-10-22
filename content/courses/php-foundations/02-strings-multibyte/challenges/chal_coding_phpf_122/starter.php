<?php
declare(strict_types=1);

// Hồ Gươm Books - one order on the warehouse picking list (a 40-column thermal printer).
//
// Input (stdin): one order line per line, TITLE|QTY|PRICE (PRICE in VND for one copy).
//
// The test runner prints one line per book and a total line, all built by pickLine:
//   TITLE   exactly 20 characters: the title in upper case ("Truyện Kiều" -> "TRUYỆN KIỀU"),
//           padded with spaces on the right; a title longer than 20 characters is cut to
//           its first 19 characters followed by "…" (one character)
//   " "
//   QTY     right-aligned in 3 characters
//   " "
//   AMOUNT  right-aligned in 13 characters, with dots as thousands separators and " ₫": "1.074.000 ₫"
//
// Example input:
//   Truyện Kiều|2|89000
//   Dế Mèn phiêu lưu ký thời hiện đại|1|52000
// Expected output:
//   TRUYỆN KIỀU            2     178.000 ₫
//   DẾ MÈN PHIÊU LƯU KÝ…   1      52.000 ₫
//   TỔNG CỘNG              3     230.000 ₫
//
// Every title is Vietnamese or English text: count characters, not bytes.

/** $text cut to $width characters (the last one "…") when it is longer, else padded with spaces. */
function fit(string $text, int $width): string
{
    // TODO
    return $text;
}

/** 1074000 -> "1.074.000 ₫" */
function vnd(int $amount): string
{
    // TODO
    return (string) $amount;
}

/** One 40-character line of the picking list; $amount is the total for the line. */
function pickLine(string $title, int $qty, int $amount): string
{
    // TODO: use fit and vnd
    return "$title $qty $amount";
}

// ---------------------------------------------------------------- test runner (do not change)
$copies = 0;
$total = 0;
foreach (explode("\n", trim(stream_get_contents(STDIN))) as $row) {
    [$title, $qty, $price] = array_map('trim', explode('|', $row));
    $copies += (int) $qty;
    $total += (int) $qty * (int) $price;
    echo pickLine($title, (int) $qty, (int) $qty * (int) $price), "\n";
}
echo pickLine('Tổng cộng', $copies, $total), "\n";
