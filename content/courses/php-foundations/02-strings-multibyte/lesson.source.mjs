// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-phpf-1-2",
    title: "Strings: interpolation, sprintf & multibyte text",
    slug: { _type: "slug", current: "php-strings-interpolation-sprintf-multibyte" },
    description:
        "The warehouse picking list at Hồ Gươm Books printed 'ĐắC NHâN T�~', and its columns drifted further right on every Vietnamese title. Learn why a PHP string is a sequence of bytes, how UTF-8 stores Vietnamese letters, which str* functions count bytes and which mb_* functions count characters (mb_str_pad, mb_ucfirst and mb_trim included), and how to build text with interpolation, heredoc, sprintf and number_format.",
    estimatedTime: 19,

    scenario: {
        role: "Junior PHP developer at Hồ Gươm Books, an online bookshop in Hà Nội",
        problem:
            "Pickers in the warehouse work from a list printed on a 40-column thermal printer. Since the shop started selling Vietnamese literature as well as English IT books, the list has been hard to read: titles come out half upper case, some end in a black diamond with a question mark, and the quantity column wanders. On a busy Saturday two pickers read the wrong quantity and two orders were packed short.",
    },

    content: [
        h2("1. The incident"),
        p("Every order at Hồ Gươm Books becomes a slip on the warehouse printer: one line per book, the title in capitals so it can be read from a metre away, the quantity, and the line total. The code was written when the shop only sold English IT books, and on those it still looks perfect."),
        p("Then the shop added Vietnamese literature. On the first busy Saturday the pickers brought a slip to the office: `TRUYệN KIềU` with two lower-case letters in the middle, a title ending in `T�~`, and quantities that no longer sat in one column. Two orders went out short because a picker read the 3 of one line as part of the line above."),

        h2("2. Reproduce it"),
        p("This is the printing code. Titles longer than 16 characters are cut with a `~`, every title is upper-cased, and `printf` pads the columns:"),
        code("php", String.raw`
<?php
declare(strict_types=1);

// picklist.php - the warehouse picking list, printed on a 40-column thermal printer
$order = [
    ['title' => 'Truyện Kiều', 'qty' => 2, 'price' => 89000],
    ['title' => 'Dế Mèn phiêu lưu ký', 'qty' => 1, 'price' => 52000],
    ['title' => 'Đắc nhân tâm', 'qty' => 3, 'price' => 108000],
    ['title' => 'Clean Code', 'qty' => 1, 'price' => 420000],
];

foreach ($order as $line) {
    $title = strlen($line['title']) > 16 ? substr($line['title'], 0, 15) . '~' : $line['title'];
    printf("%-16s %3d %12s\n", strtoupper($title), $line['qty'], number_format($line['qty'] * $line['price']) . ' đ');
}`, "picklist.php"),
        code("text", String.raw`
$ php picklist.php
TRUYệN KIềU    2   178,000 đ
Dế MèN PHIê~   1    52,000 đ
ĐắC NHâN T�~   3   324,000 đ
CLEAN CODE         1   420,000 đ`),
        p("Only the English title is right. Four functions misbehave, and they all have the same cause: `strlen`, `substr`, `strtoupper` and `printf`'s `%-16s` work on **bytes**, and a Vietnamese letter is more than one byte."),

        h2("3. A string is a sequence of bytes"),
        p("A PHP string has no encoding of its own: it is a sequence of bytes, and the source file, the database and the browser decide what those bytes mean. Today that is almost always **UTF-8**, which stores the 128 ASCII characters (English letters, digits, punctuation) in 1 byte each, and every other character in 2, 3 or 4 bytes. `đ` and `â` take 2 bytes, `ắ`, `ệ` and `ề` take 3."),
        image("bytes-vs-characters", {
            alt: "The title 'Đắc nhân tâm' drawn as 12 character boxes above 17 byte boxes with their hexadecimal values and positions 0 to 16: Đ is C4 90, ắ is E1 BA AF, c is 63, the space 20, n 6E, h 68, â C3 A2, n 6E, space 20, t 74, â C3 A2 and m 6D. A red dashed line after byte 14 is labelled substr($t, 0, 15) and cuts the second â in half, so the slip prints 'Đắc nhân t' followed by a replacement character. Below, a table maps byte functions to character functions: strlen and substr to mb_strlen and mb_substr, str_pad and printf('%-16s') to mb_str_pad (PHP 8.3), strtoupper and ucfirst to mb_strtoupper and mb_ucfirst (8.4), trim and str_split to mb_trim (8.4) and mb_str_split. Notes: strlen is still right for byte limits such as a VARCHAR in bytes, an HTTP header or a file size; strtoupper changes only a-z since PHP 8.2, so 'Đắc nhân tâm' becomes 'ĐắC NHâN TâM'; strrev, wordwrap, ucwords and str_word_count have no mb_ version; search functions such as strpos, str_contains, str_replace and explode are safe on UTF-8 because a valid UTF-8 needle can only match at character boundaries, but strpos returns byte offsets.",
            caption: "strlen counts boxes in the bottom row, mb_strlen counts boxes in the top row.",
        }),
        p("Look at the bytes yourself:"),
        code("php", String.raw`
<?php
declare(strict_types=1);

$t = 'Đắc nhân tâm';
var_dump(strlen($t), mb_strlen($t));
echo bin2hex('c'), ' ', bin2hex('Đ'), ' ', bin2hex('â'), ' ', bin2hex('ắ'), "\n";

$cut = substr($t, 0, 15);
var_dump($cut, mb_check_encoding($cut, 'UTF-8'));
var_dump(mb_substr($t, 0, 10));

echo strtoupper($t), ' / ', mb_strtoupper($t), "\n";
echo ucfirst('đắc nhân tâm'), ' / ', mb_ucfirst('đắc nhân tâm'), "\n";
echo str_pad('Số đỏ', 10, '.'), '| ', mb_str_pad('Số đỏ', 10, '.'), "|\n";
print_r(mb_str_split('Kiều'));`, "bytes.php"),
        code("text", String.raw`
int(17)
int(12)
63 c490 c3a2 e1baaf
string(15) "Đắc nhân t�"
bool(false)
string(14) "Đắc nhân t"
ĐắC NHâN TâM / ĐẮC NHÂN TÂM
đắc nhân tâm / Đắc nhân tâm
Số đỏ| Số đỏ.....|
Array
(
    [0] => K
    [1] => i
    [2] => ề
    [3] => u
)`),
        bullets([
            "**`strlen` counts bytes** (17), **`mb_strlen` counts characters** (12). The `mb_` functions come from the **mbstring** extension, which every PHP installation you will deploy to has, and they use UTF-8 unless you pass another encoding.",
            "**`substr($t, 0, 15)` stops in the middle of `â`.** The result is not valid UTF-8 (`mb_check_encoding` says false), and the browser or printer shows the broken byte as `�`. `mb_substr($t, 0, 10)` takes 10 characters, which happen to be 14 bytes.",
            "**`strtoupper` only knows a-z.** Since PHP 8.2 it ignores the locale completely, so every accented letter stays as it is. `mb_strtoupper` uses Unicode case rules: `đ` becomes `Đ`, `ắ` becomes `Ắ`. PHP 8.4 added `mb_ucfirst`, `mb_lcfirst` and `mb_trim` for the same reason.",
            "**`str_pad` pads to a number of bytes.** `'Số đỏ'` is already 10 bytes, so `str_pad(..., 10)` adds nothing; `mb_str_pad` (PHP 8.3) adds 5 dots to reach 10 characters. `printf('%-16s')` pads bytes too, which is why the quantity column drifted.",
        ]),
        callout("info", "When bytes are what you want",
            "strlen is the right function when the limit really is in bytes: a database column defined in bytes, a maximum upload size, a protocol header. Searching is also safe on bytes: str_contains, strpos, str_replace and explode work correctly on UTF-8 text, because a valid UTF-8 needle can only match at character boundaries - but the positions strpos returns are byte offsets, to use with substr, not mb_substr."),
        callout("warning", "One character, two spellings",
            "Unicode can store 'ề' as one code point or as 'e' followed by combining accents. Text typed on Windows, Android and most web forms uses the composed form; file names from macOS and some PDF copy-pastes use the decomposed one, so mb_strlen counts more characters and === says the strings differ. The intl extension's Normalizer::normalize() converts both to one form; normalise text where it enters your system if it can come from such sources."),

        h2("4. Building strings: interpolation, heredoc and sprintf"),
        p("PHP has four ways to put values into text, and the slip uses all of them:"),
        code("php", String.raw`
<?php
declare(strict_types=1);

$id = 'HG-24117';
$qty = 3;
$book = ['title' => 'Số đỏ', 'price' => 65000];

echo "Đơn $id: $qty x $book[title]\n";
echo "Đơn {$id}: {$qty} x {$book['title']} = " . $qty * $book['price'] . " đ\n";
echo "{$qty}x\n";
echo "$qtyx\n";
printf("[%-8s] [%5d] [%05.1f] [%'.10s] [%x]\n", 'abc', 42, 3.14159, 'end', 255);
printf('%2$s gửi %1$s' . "\n", 'chị Lan', 'Hồ Gươm Books');
echo number_format(1074000), ' / ', number_format(1074000, 0, ',', '.'), " ₫\n";`, "build.php"),
        code("text", String.raw`
Đơn HG-24117: 3 x Số đỏ
Đơn HG-24117: 3 x Số đỏ = 195000 đ
3x
PHP Warning:  Undefined variable $qtyx in /app/build.php on line 11

[abc     ] [   42] [003.1] [.......end] [ff]
Hồ Gươm Books gửi chị Lan
1,074,000 / 1.074.000 ₫`),
        bullets([
            "**Double quotes interpolate, single quotes do not.** `'$id'` is the three characters `$id`. Use single quotes for text without variables, and for regular expressions and `printf` formats that contain `$`.",
            "**Wrap every variable in `{}`**: `\"{$book['title']}\"`, `\"{$qty}x\"`, `\"{$order->total()}\"`. Without braces PHP reads the longest possible name, so `\"$qtyx\"` is the undefined variable `$qtyx` (a warning and an empty string), and only one level of array access with an unquoted key works (`$book[title]`).",
            "**Expressions do not interpolate.** `\"{$qty * $book['price']}\"` is a parse error; compute the value first or concatenate with `.`, as the second line does.",
            "**`printf` and `sprintf` format values**: `%s` string, `%d` integer, `%5d` right-aligned in 5, `%-8s` left-aligned in 8, `%05.1f` one decimal padded with zeros, `%'.10s` padded with dots, `%x` hexadecimal, `%%` a percent sign. `%2$s` picks an argument by position, which translators need when word order changes. Widths are in bytes: never use them to align non-ASCII text.",
            "**`number_format($n, $decimals, $decimalPoint, $thousands)`** formats a number for people. The default uses `,` for thousands; Vietnamese uses `.`, so VND is `number_format($n, 0, ',', '.') . ' ₫'`.",
        ]),
        p("For text with several lines, such as the header of the slip, use a **heredoc**. It interpolates like double quotes, and the indentation of the closing marker is removed from every line, so the template can be indented with your code:"),
        code("php", String.raw`
$orderId = 'HG-24117';
$customer = ['name' => 'Nguyễn Thị Lan', 'city' => 'Hà Nội'];
$books = 4;
echo <<<SLIP
    Đơn {$orderId} - {$customer['name']}, {$customer['city']}
    {$books} đầu sách

    SLIP;
// Đơn HG-24117 - Nguyễn Thị Lan, Hà Nội
// 4 đầu sách`),
        p("A **nowdoc** (`<<<'SLIP'`, with quotes) is the single-quoted version: no interpolation at all, useful for templates and code samples that contain `$`."),
        challenge("chal_quiz_phpf_121", "Count the bytes of each letter in UTF-8 for the first question, and remember which version of PHP made strtoupper ASCII-only. For the second, check where quotes are allowed inside double-quoted strings and which strings interpolate at all."),

        h2("5. The fix"),
        p("The fixed slip does all text work in characters: it cuts and pads with `mb_substr` and `mb_str_pad`, upper-cases with `mb_strtoupper`, and formats VND the Vietnamese way. A small `fit` function makes every title exactly 16 characters, and the amount is padded with `mb_str_pad` too, because `₫` is 3 bytes:"),
        code("php", String.raw`
<?php
declare(strict_types=1);

/** Cuts $text to $width characters (the last one an ellipsis) or pads it with spaces. */
function fit(string $text, int $width): string
{
    if (mb_strlen($text) > $width) {
        $text = mb_substr($text, 0, $width - 1) . '…';
    }
    return mb_str_pad($text, $width);
}

function vnd(int $amount): string
{
    return number_format($amount, 0, ',', '.') . ' ₫';
}

$order = [
    ['title' => 'Truyện Kiều', 'qty' => 2, 'price' => 89000],
    ['title' => 'Dế Mèn phiêu lưu ký', 'qty' => 1, 'price' => 52000],
    ['title' => 'Đắc nhân tâm', 'qty' => 3, 'price' => 108000],
    ['title' => 'Clean Code', 'qty' => 1, 'price' => 420000],
];

foreach ($order as $line) {
    echo fit(mb_strtoupper($line['title']), 16), ' ',
        str_pad((string) $line['qty'], 3, ' ', STR_PAD_LEFT), ' ',
        mb_str_pad(vnd($line['qty'] * $line['price']), 12, ' ', STR_PAD_LEFT), "\n";
}`, "picklist.php"),
        code("text", String.raw`
TRUYỆN KIỀU        2    178.000 ₫
DẾ MÈN PHIÊU LƯ…   1     52.000 ₫
ĐẮC NHÂN TÂM       3    324.000 ₫
CLEAN CODE         1    420.000 ₫`),
        numbered([
            "**`mb_strlen` decides whether to cut, `mb_substr` cuts**: a title can never end in half a letter.",
            "**The ellipsis counts.** `…` is one character (3 bytes), so the title is cut to `$width - 1` characters before it is added, and every line is exactly 16 characters wide.",
            "**`mb_str_pad` pads text, `str_pad` only pads ASCII.** The quantity is a number converted with `(string)`, so `str_pad` is fine there; the amount contains `₫`, so it needs `mb_str_pad`.",
            "**`mb_strtoupper`** gives `TRUYỆN KIỀU`. Upper-case before cutting, so the cut is measured on the text that is printed.",
            "**One `vnd` function** formats money for the whole shop: thousands with dots, the `₫` sign after the number.",
        ]),

        h2("6. Your turn"),
        p("The real picking list has a 20-character title column, a 3-character quantity and a 13-character amount, and ends with a total line. Write `fit`, `vnd` and `pickLine`; the test runner reads one `TITLE|QTY|PRICE` line per book and prints the slip."),
        challenge("chal_coding_phpf_122", "Every width in this exercise is a number of characters. Check each function you use for padding, cutting and upper-casing: does it count bytes or characters? The total line goes through pickLine too, and 'Tổng cộng' is not ASCII."),

        h2("7. Pitfalls"),
        bullets([
            "**`strlen`, `substr`, `str_pad`, `strtoupper`, `ucfirst`, `trim` and `str_split` on user text**: they work on bytes and ASCII. Use the `mb_` version for anything a person typed.",
            "**`printf('%-20s')` and `sprintf` widths** are byte widths: they misalign every non-ASCII value.",
            "**`substr` to shorten text** can cut a character in half and produce invalid UTF-8, which some databases and JSON encoders then reject.",
            "**`\"$qtyx\"`, `\"$book['title']\"` and expressions in strings**: use `{$...}` around every variable, and compute expressions outside the string.",
            "**`number_format` defaults** use `,` for thousands and `.` for decimals, the English way. Pass the separators explicitly for Vietnamese output.",
            "**Comparing strings that look the same**: composed and decomposed accents are different bytes. Normalise at the input if text can come from macOS file names or PDFs.",
        ]),

        h2("8. Checklist"),
        bullets([
            "Lengths, cuts, padding and case changes of human text use `mb_strlen`, `mb_substr`, `mb_str_pad`, `mb_strtoupper`, `mb_ucfirst` and `mb_trim`.",
            "`strlen` is used only where the limit is in bytes, and says so in a comment.",
            "Variables in double-quoted strings and heredocs are wrapped in `{}`.",
            "Column layouts are built with `mb_str_pad`, never with `printf` widths.",
            "Money is formatted by one shared function, with explicit separators.",
        ]),
        p("Next lesson: arrays. Merging a guest's cart into their account cart at login lost books, and orders shipped gift wrapping and tote bags nobody had ordered."),
    ],
});
