// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-phpf-1-1",
    title: "strict_types and comparisons: when \"1e1\" == \"10\"",
    slug: { _type: "slug", current: "php-strict-types-and-comparisons" },
    description:
        "Hồ Gươm Books' checkout accepted \"500100.0\" and \"5.001e5\" as voucher 500100, redeemed one 200,000 VND voucher three times, and read a 50.000 VND discount as 50 VND. Learn how PHP's == converts values before comparing, why === and the strict flag of in_array and array_search are the default you want, how array keys and strpos add their own surprises, and what declare(strict_types=1) does - and does not - change.",
    estimatedTime: 18,

    scenario: {
        role: "Junior PHP developer at Hồ Gươm Books, an online bookshop in Hà Nội",
        problem:
            "For the autumn book fair, Hồ Gươm Books printed scratch-card vouchers with 6-digit codes and ran 5-digit vouchers in a newspaper. Two days later, finance found voucher 500100 (200,000 VND) redeemed three times, a newspaper reader who got someone else's discount, and every 50,000 VND voucher taking 50 VND off. The checkout code had worked for years.",
    },

    content: [
        h2("1. The incident"),
        p("Hồ Gươm Books sells books online from a small warehouse in Hà Nội. Its checkout is a PHP application that has grown for eight years, and the voucher code is one of its oldest parts. For the autumn book fair, marketing ran two campaigns at once: scratch cards with **6-digit** codes handed out at the fair, and **5-digit** codes printed in a newspaper. The voucher list came from a spreadsheet as CSV."),
        p("Two days later, the finance desk sent three tickets:"),
        bullets([
            "**Voucher 500100 (200,000 VND) was redeemed three times**, typed as `500100`, `500100.0` and `5.001e5`. A tip had gone round a Facebook group: \"add .0 to reuse your voucher\".",
            "**A newspaper reader typed 73311** and got the discount of scratch card `073311`. When the owner of the scratch card came, the checkout said it was already used.",
            "**Every 50,000 VND voucher took 50 VND off.** The spreadsheet had been saved on a laptop with Vietnamese number formatting, and the CSV said `50.000`.",
        ]),
        p("Nothing crashed, nothing was logged. PHP did exactly what the code asked: it compared and converted values the way PHP always has. This lesson is about those rules, and the two habits that make them irrelevant: compare with `===`, and let `declare(strict_types=1);` stop wrong types at the door."),

        h2("2. Reproduce it"),
        p("This is the checkout code, cut down to the voucher part. Save it as `voucher.php` and run it with `php voucher.php` (PHP 8.4 or newer):"),
        code("php", String.raw`
<?php
// voucher.php - redeem printed vouchers at checkout (cut down)
$csv = "500100,200000\n073311,50.000\n";

$vouchers = [];
foreach (explode("\n", trim($csv)) as $line) {
    [$code, $value] = explode(',', $line);
    $vouchers[] = ['code' => $code, 'value' => $value];
}
$redeemed = []; // entered code => true

function findVoucher(array $vouchers, string $entered): ?array
{
    foreach ($vouchers as $v) {
        if ($v['code'] == $entered) {
            return $v;
        }
    }
    return null;
}

function applyVoucher(int $total, int $value): int
{
    return max(0, $total - $value);
}

foreach (['500100', '500100.0', '5.001e5', ' 500100', '73311'] as $entered) {
    $v = findVoucher($vouchers, $entered);
    if ($v === null || isset($redeemed[$entered])) {
        echo "[$entered] rejected\n";
        continue;
    }
    $redeemed[$entered] = true;
    echo "[$entered] voucher {$v['code']}: total " . applyVoucher(350000, $v['value']) . " VND\n";
}`, "voucher.php"),
        code("text", String.raw`
$ php voucher.php
[500100] voucher 500100: total 150000 VND
[500100.0] voucher 500100: total 150000 VND
[5.001e5] voucher 500100: total 150000 VND
[ 500100] voucher 500100: total 150000 VND
[73311] voucher 073311: total 349950 VND`),
        p("Every line is accepted. Three things went wrong, and only the first is visible in the code:"),
        numbered([
            "**`$v['code'] == $entered`** compares two numeric strings, so PHP compares them **as numbers**: `500100.0`, `5.001e5` and ` 500100` are all the number 500100, and `73311` equals `073311`.",
            "**`isset($redeemed[$entered])`** checks the exact string the customer typed. The lookup was loose, the \"already used\" check was exact, so every spelling of 500100 counted as a new voucher.",
            "**`applyVoucher(350000, $v['value'])`** received the string `'50.000'`. The parameter is declared `int`, and without strict types PHP converted the string: `'50.000'` is the number 50.0, which becomes the int 50. The type declaration did not protect anything; it quietly converted.",
        ]),

        h2("3. How == compares"),
        p("PHP has two equality operators. `===` (identical) is true only when both values have the **same type and the same value**: no conversion, ever. `==` (equal) first converts the two values to a common type and then compares. The conversion rules are the source of the voucher bug:"),
        image("loose-vs-strict", {
            alt: "Two panels and a rules box. The left, red panel is titled $v['code'] == $entered and lists '500100' == '500100' true, '500100' == '500100.0' true, '500100' == '5.001e5' true, '500100' == ' 500100' true and '073311' == '73311' true, with the note that both sides are numeric strings, so PHP compares them as numbers. The right, green panel is titled $v['code'] === $entered and lists the same five comparisons with the results true, false, false, false, false: same type and the same characters, or false. The rules box at the bottom says how == compares in PHP 8: two numeric strings, or a number and a numeric string, are compared as numbers ('1e1' == '10' is true); a number and a non-numeric string: the number becomes a string ('abc' == 0 is false since PHP 8.0); null or a bool on one side: both become bool (null == false, '0' == false and '' == null are true); two non-numeric strings are compared byte by byte. in_array, array_search, array_keys with a search value, and switch all use == unless you ask for strict.",
            caption: "A voucher code is an identifier made of digits, not a number. == does not know that.",
        }),
        p("A **numeric string** is a string that looks like a number: optional whitespace, an optional sign, digits, an optional decimal part and an optional exponent. `'073311'`, `'500100.0'`, `'5.001e5'`, `' 500100'` and `'500100 '` are all numeric strings; `'50k'` and `'HG-500100'` are not. Run the comparisons yourself:"),
        code("php", String.raw`
<?php
declare(strict_types=1);

$pairs = [
    ['500100', '500100.0'],
    ['500100', '5.001e5'],
    ['073311', '73311'],
    ['500100', ' 500100'],
    ['abc', 0],
    ['10', '1e1'],
    ['abc', 'ABC'],
    [null, false],
    ['0', false],
    ['', null],
    [0, ''],
];
foreach ($pairs as [$a, $b]) {
    $expr = var_export($a, true) . ' == ' . var_export($b, true);
    printf("%-26s %-5s  === %s\n", $expr, var_export($a == $b, true), var_export($a === $b, true));
}`, "compare.php"),
        code("text", String.raw`
'500100' == '500100.0'     true   === false
'500100' == '5.001e5'      true   === false
'073311' == '73311'        true   === false
'500100' == ' 500100'      true   === false
'abc' == 0                 false  === false
'10' == '1e1'              true   === false
'abc' == 'ABC'             false  === false
NULL == false              true   === false
'0' == false               true   === false
'' == NULL                 true   === false
0 == ''                    false  === false`),
        bullets([
            "**Numeric strings compare as numbers**, which is why this lesson's title asks about `'1e1' == '10'`: both are the number 10.",
            "**PHP 8.0 fixed the worst case.** In PHP 7, `'abc' == 0` was true, because `'abc'` was converted to the number 0. Since PHP 8, a number compared with a non-numeric string is turned into a string instead, so `'abc' == 0` and `0 == ''` are false. Old blog posts still show the PHP 7 behaviour.",
            "**`null` and booleans convert the other side to bool.** `'0'`, `''`, `0`, `0.0`, `[]` and `null` are all \"falsy\", so they are all `== false`.",
            "**`var_dump` and `var_export` show the type**, `echo` does not: `echo false` prints nothing and `echo 0` prints 0. Use them when a comparison surprises you.",
        ]),
        callout("tip", "Use === by default",
            "Write === and !== everywhere, and treat every == in a review as a question: are both sides guaranteed to have the same type, and is a conversion really wanted here? For ids, codes, phone numbers, postcodes and ISBNs - strings that happen to contain digits - the answer is always no."),

        h2("4. Loose comparisons you did not write"),
        p("Several standard functions compare with `==` unless you pass a strict flag, and the result is the same bug without a visible `==` anywhere:"),
        code("php", String.raw`
<?php
declare(strict_types=1);

$codes = ['073311', '73311', '500100'];
var_dump(in_array('73311', ['073311']));          // loose
var_dump(in_array('73311', ['073311'], true));    // strict
var_dump(array_search('500100.0', $codes));
var_dump(array_search('500100.0', $codes, true));
var_dump(array_search('073311', $codes, true));

$title = 'PHP 8.4 cơ bản';
if (strpos($title, 'PHP')) { echo "has PHP\n"; } else { echo "no PHP?\n"; }
var_dump(str_contains($title, 'PHP'), str_starts_with($title, 'PHP'));

$byCode = ['073311' => 50000, '500100' => 200000, '1e3' => 1];
var_dump(array_keys($byCode));

switch ('1e1') {
    case '10': echo "switch: matched '10'\n"; break;
    default: echo "switch: no match\n";
}
echo match ('1e1') { '10' => "match: matched '10'", default => 'match: no match' }, "\n";`, "hidden.php"),
        code("text", String.raw`
bool(true)
bool(false)
int(2)
bool(false)
int(0)
no PHP?
bool(true)
bool(true)
array(3) {
  [0]=>
  string(6) "073311"
  [1]=>
  int(500100)
  [2]=>
  string(3) "1e3"
}
switch: matched '10'
match: no match`),
        bullets([
            "**`in_array($needle, $haystack, true)` and `array_search($needle, $haystack, true)`**: always pass `true`. The loose versions are the same `==` as above.",
            "**`array_search` returns the key or `false`**, and key 0 is falsy. `if (array_search(...))` treats \"found at index 0\" as \"not found\". Compare the result with `=== false`. The same trap made `strpos` return 0 for a title that starts with `PHP`; since PHP 8.0, `str_contains`, `str_starts_with` and `str_ends_with` return a plain bool.",
            "**Array keys are converted too.** A string key that is a plain decimal integer (`'500100'`) is stored as the int `500100`; `'073311'` (leading zero) and `'1e3'` stay strings. Looking up `$byCode['500100']` still works, but `foreach ($byCode as $code => $value)` hands you an int for some codes and a string for others - with strict types, passing that int to a `string` parameter is a TypeError.",
            "**`switch` compares with `==`**; `match` (lesson 6) compares with `===`.",
        ]),

        h2("5. declare(strict_types=1)"),
        p("The third bug was a type declaration that did not protect anything. By default, PHP runs function calls in **coercive mode**: when a parameter is declared `int` and you pass a string, PHP converts the string if it can. Run this file without a `declare` line:"),
        code("php", String.raw`
<?php
// coerce.php - no declare(strict_types=1): PHP converts scalar arguments to the declared type
function applyVoucher(int $total, int $value): int
{
    return max(0, $total - $value);
}

foreach (['200000', '50.000', '1e5', ' 200000', 49999.0, true] as $raw) {
    echo str_pad(var_export($raw, true), 10), ' -> ', applyVoucher(350000, $raw), "\n";
}
try {
    applyVoucher(350000, '200000đ');
} catch (TypeError $e) {
    echo $e->getMessage(), "\n";
}`, "coerce.php"),
        code("text", String.raw`
$ php coerce.php
'200000'   -> 150000
'50.000'   -> 349950
'1e5'      -> 250000
' 200000'  -> 150000
49999.0    -> 300001
true       -> 349999
applyVoucher(): Argument #2 ($value) must be of type int, string given, called in /app/coerce.php on line 12`),
        p("Coercive mode accepts any numeric string, floats with no fractional part, and even `true` (which becomes 1). It only refuses values it cannot convert at all, like `'200000đ'`. Now add `declare(strict_types=1);` as the first statement of the file, save it as `strict.php` and run it again:"),
        code("text", String.raw`
$ php strict.php
'200000'   -> PHP Fatal error:  Uncaught TypeError: applyVoucher(): Argument #2 ($value) must be of type int, string given, called in /app/strict.php on line 10 and defined in /app/strict.php:4`),
        p("In **strict mode**, a scalar argument must already have the declared type. The only conversion left is int to float (`vat(8)` for a `float $rate` receives `8.0`), because it never loses information. The rules in one place:"),
        bullets([
            "**It is a per-file setting**, and it must be the very first statement, right after `<?php`. Put it in every file: there is no global switch.",
            "**The calling file decides.** strict_types applies to the calls made from a file that declares it, including calls to PHP's own functions: `strlen(500100)` is a TypeError there. A file without the declaration can still call your strict function with `'200000'` and get coercion.",
            "**Return types follow the file that declares the function**: in a strict file, `return '0';` from a function declared `: int` is a TypeError.",
            "**Operators are not affected.** `'500100' == '500100.0'` is still true under strict_types. It fixes the boundary between values and functions, not comparisons; `===` fixes those.",
        ]),
        p("Strict mode moves the problem to the right place. The CSV gives you strings; strict types force you to turn them into ints **once, on purpose, with a check**, instead of letting each function guess. That is what caught `50.000` in the fixed code below."),
        challenge("chal_quiz_phpf_111", "For the first question, remember which functions compare loosely by default and that a loose search stops at the first match. For the second, separate what strict_types changes (typed parameters and return values, for calls from this file) from what it leaves alone (operators)."),

        h2("6. The fix"),
        p("The fixed checkout treats voucher codes as identifiers: it compares them with `===`, records the redeemed vouchers by their printed code, and validates the CSV the moment it is read, so a value like `50.000` stops the import instead of becoming 50 VND:"),
        code("php", String.raw`
<?php
declare(strict_types=1);

/** @return list<array{code: string, value: int}> */
function loadVouchers(string $csv): array
{
    $vouchers = [];
    foreach (explode("\n", trim($csv)) as $n => $line) {
        [$code, $value] = explode(',', $line);
        // Codes are 5 or 6 digits, values whole VND with no separators: "50.000" is rejected, not read as 50.
        if (preg_match('/^\d{5,6}$/', $code) !== 1 || preg_match('/^\d+$/', $value) !== 1) {
            throw new InvalidArgumentException('voucher file line ' . ($n + 1) . ": bad row \"$line\"");
        }
        $vouchers[] = ['code' => $code, 'value' => (int) $value];
    }
    return $vouchers;
}

/** @param list<array{code: string, value: int}> $vouchers */
function findVoucher(array $vouchers, string $entered): ?array
{
    foreach ($vouchers as $v) {
        if ($v['code'] === $entered) {
            return $v;
        }
    }
    return null;
}

function applyVoucher(int $total, int $value): int
{
    return max(0, $total - $value);
}

$vouchers = loadVouchers("500100,200000\n073311,50000\n");
$used = []; // codes of redeemed vouchers, exactly as printed

foreach (['500100', '500100.0', '5.001e5', ' 500100', '73311', '073311', '500100'] as $entered) {
    $v = findVoucher($vouchers, trim($entered));
    if ($v === null) {
        echo "[$entered] rejected: unknown voucher\n";
    } elseif (in_array($v['code'], $used, true)) {
        echo "[$entered] rejected: already used\n";
    } else {
        $used[] = $v['code'];
        echo "[$entered] voucher {$v['code']}: total " . applyVoucher(350000, $v['value']) . " VND\n";
    }
}

try {
    loadVouchers("500100,200000\n073311,50.000\n");
} catch (InvalidArgumentException $e) {
    echo $e->getMessage(), "\n";
}`, "voucher.php"),
        code("text", String.raw`
[500100] voucher 500100: total 150000 VND
[500100.0] rejected: unknown voucher
[5.001e5] rejected: unknown voucher
[ 500100] rejected: already used
[73311] rejected: unknown voucher
[073311] voucher 073311: total 300000 VND
[500100] rejected: already used
voucher file line 2: bad row "073311,50.000"`),
        numbered([
            "**`declare(strict_types=1);`** on the first line: `applyVoucher` now only accepts real ints.",
            "**`===` in `findVoucher`**: a code matches only when the customer typed exactly its characters. `trim` removes the spaces a copy-paste adds, on purpose and in one place - that is why ` 500100` is now \"already used\" instead of a new voucher.",
            "**\"Already used\" is checked by the voucher's printed code** with `in_array(..., true)`, not by what the customer typed. Lookup and bookkeeping use the same identity, so there is no second spelling to exploit.",
            "**The CSV is validated when it is read.** The pattern `^\\d+$` accepts digits only, then `(int)` converts a string we know is clean.",
            "**Codes stay strings.** They are never used as array keys, which would turn `'500100'` into the int 500100 and leave `'073311'` a string.",
        ]),
        callout("warning", "(int) is not validation",
            "Casts never complain: (int) '50.000' is 50, (int) '12abc' is 12, (int) 'abc' is 0. Use a regular expression, ctype_digit() or filter_var (lesson 8) to decide whether a string is a valid number, and cast only afterwards."),

        h2("7. Your turn"),
        p("The real checkout keeps the vouchers in lists and uses `array_search` and `in_array`. It still accepts `500100.0`, and it still mixes up the newspaper voucher 73311 with scratch card 073311. Fix the two functions; the test runner reads the vouchers and every code customers typed."),
        challenge("chal_fix_phpf_112", "Both functions compare loosely by default. Each needs one more argument, and neither needs a loop or a cast: casting to int would make 73311 and 073311 the same voucher again."),

        h2("8. Pitfalls"),
        bullets([
            "**`==` on strings made of digits** (codes, phone numbers, postcodes, ISBNs) compares them as numbers: leading zeros, `.0`, exponents and spaces disappear. Use `===`.",
            "**`in_array`, `array_search` and `array_keys($a, $value)` without `true`** are loose comparisons in disguise.",
            "**`if (array_search(...))` or `if (strpos(...))`** treats position 0 as not found. Compare with `!== false`, or use `str_contains` / `str_starts_with`.",
            "**Digit strings as array keys** become ints. Keep identifiers as values, or convert keys back with `(string)` when you iterate.",
            "**A file without `declare(strict_types=1);`** converts arguments silently, so `'50.000'` reaches an `int` parameter as 50.",
            "**Casting instead of validating**: `(int)` and `(float)` always succeed. Check the format first.",
        ]),

        h2("9. Checklist"),
        bullets([
            "Every PHP file starts with `<?php` and `declare(strict_types=1);`.",
            "Comparisons use `===` and `!==`; every remaining `==` has a comment explaining why a conversion is wanted.",
            "`in_array` and `array_search` get `true` as their third argument, and `array_search` results are compared with `=== false`.",
            "Codes, ids and phone numbers are strings from input to database, and never array keys.",
            "Input is validated where it enters the program (CSV, form, API), then converted once.",
        ]),
        p("Next lesson: strings. The packing slips printed Vietnamese book titles cut in half, as `Truy�`, and the columns of the warehouse picking list never lined up."),
    ],
});
