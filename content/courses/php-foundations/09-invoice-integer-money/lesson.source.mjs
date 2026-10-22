// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-phpf-4-3",
    title: "Mini project: an invoice total with integer money",
    slug: { _type: "slug", current: "php-mini-project-invoice-integer-money" },
    description:
        "Hồ Gươm Books' first international e-book orders produced PDF invoices that said 36.97 USD while the card was charged 36.91, because every price went through a float. Build the replacement step by step: parse prices from strings into integer cents without any float, express percentages in basis points, round half up with intdiv, decide where rounding happens, format cents for people, and reject malformed amounts - using strict types, validation, exceptions and small functions from the whole course.",
    estimatedTime: 22,

    scenario: {
        role: "Junior PHP developer at Hồ Gươm Books, an online bookshop in Hà Nội",
        problem:
            "Hồ Gươm Books started selling e-books to Vietnamese readers abroad, priced in USD. After the first month, the payment provider's reconciliation report listed 212 orders where the amount charged to the card differed from the PDF invoice by 1 to 9 cents - always less. The accountant could not close the month, and the provider asked whether the shop was splitting payments.",
    },

    content: [
        h2("1. The incident"),
        p("The international store prices e-books in US dollars, with two decimals, and adds 10% VAT. Two pieces of code use the prices: one prints the PDF invoice, the other sends the line items to the payment provider, which wants amounts in cents. Both were written in an afternoon and tested with prices like 10.00 and 25.50."),
        p("A month later, the provider's reconciliation flagged 212 orders: the card charge was a few cents lower than the invoice every time. Nobody had lost money on purpose, but nobody could explain it either, and the accountant had to correct 212 invoices by hand."),

        h2("2. Reproduce it"),
        code("php", String.raw`
<?php
declare(strict_types=1);

// invoice.php - e-books sold abroad, priced in USD
$lines = [
    ['Clean Code (ebook)', 1, '19.99'],
    ['Atomic Habits (ebook)', 3, '4.35'],
    ['Bookmark', 1, '0.57'],
];
const VAT_RATE = 0.10;

// The PDF invoice
$total = 0.0;
foreach ($lines as [$title, $qty, $price]) {
    $net = $qty * (float) $price;
    $total += $net;
    printf("%-24s %d x %5.2f = %6.2f\n", $title, $qty, $price, $net);
}
printf("VAT 10%%: %.2f\nTotal: %.2f\n", $total * VAT_RATE, $total * (1 + VAT_RATE));

// The charge sent to the payment provider: line items in cents
$charged = 0;
foreach ($lines as [$title, $qty, $price]) {
    $charged += $qty * (int) ((float) $price * 100);
}
$charged += (int) ($charged * VAT_RATE);
echo "charged: $charged cents\n";`, "invoice.php"),
        code("text", String.raw`
$ php invoice.php
Clean Code (ebook)       1 x 19.99 =  19.99
Atomic Habits (ebook)    3 x  4.35 =  13.05
Bookmark                 1 x  0.57 =   0.57
VAT 10%: 3.36
Total: 36.97
charged: 3691 cents`),
        p("The invoice says 36.97, the card was charged 36.91. Six cents disappeared in three places:"),
        numbered([
            "**`(int) (19.99 * 100)` is 1998**, `(int) (4.35 * 100)` is 434 and `(int) (0.57 * 100)` is 56: each product is a hair below the whole number, and `(int)` cuts the rest off.",
            "**`(int) ($charged * VAT_RATE)` truncates** the VAT instead of rounding it.",
            "**The invoice rounds differently.** `printf('%.2f')` rounds the float total once at the end, the charge truncates every line. Two programs, two rules, two results.",
        ]),

        h2("3. Why floats cannot hold money"),
        p("A `float` is a binary fraction. It stores 0.5 and 0.25 exactly, but not 0.1 or 0.99, just as a decimal fraction cannot store 1/3 exactly. Every price with cents is stored as the nearest binary value, slightly above or slightly below:"),
        code("php", String.raw`
<?php
declare(strict_types=1);

var_dump(19.99 * 100, (int) (19.99 * 100));
var_dump(0.1 + 0.2 === 0.3);
printf("%.2f vs %s\n", 2.675, round(2.675, 2));`, "floats.php"),
        code("text", String.raw`
float(1998.9999999999998)
int(1998)
bool(false)
2.67 vs 2.68`),
        bullets([
            "**`(int)` truncates toward zero**, so a value a hair below a whole number loses a whole cent. `round()` before the cast hides the problem for one multiplication, not for a chain of them.",
            "**Errors add up.** Sums of many floats drift, and comparing them with `===` fails.",
            "**Two ways of rounding the same float can disagree.** `printf('%.2f', 2.675)` rounds the stored binary value (2.67499999...) to 2.67; `round(2.675, 2)` corrects for the representation and gives 2.68. The invoice and the payment used exactly this kind of pair.",
            "**`int` is exact** up to `PHP_INT_MAX` (9,223,372,036,854,775,807 on 64-bit systems) - in cents, about 92 quadrillion dollars. Store and compute money as an integer number of the smallest unit: cents for USD, đồng for VND.",
        ]),
        callout("info", "Money in other places",
            "The same rule holds outside PHP: in Postgres use integer columns for cents (or NUMERIC, never REAL or DOUBLE PRECISION), in JSON send amounts as integer cents or as decimal strings, and in JavaScript remember that Number is the same binary float. For currencies with different numbers of decimals, store the currency's minor unit with the amount; the brick/money library does this for PHP, and the bcmath extension calculates with decimal strings when you need more than integers."),

        h2("4. The building blocks"),
        image("integer-money", {
            alt: "Two pipelines for the string \"19.99\". The red one converts it to the float 19.989999999999998..., multiplies by 100 to get 1998.9999999..., and casts with (int) to 1998. The green one splits it with a regular expression into \"19\" and \"99\", computes 19 * 100 + 99 and gets 1999. A note says \"19.9\" means 19.90: pad the decimals on the right, to \"90\"; padding on the left would give 19.09. A panel on percentages in basis points, rounded half up: 1% = 100 basis points, 10% = 1000, 12.5% = 1250; intdiv($cents * $bp + 5000, 10000) adds half of the divisor before an integer division and rounds half up with no float: 10% of 1005 cents = 100.5 -> 101, 10% of 1004 cents = 100.4 -> 100, 10% of 1999 cents = 199.9 -> 200; it works for amounts and rates that are not negative; printf('%.2f', 2.675) prints 2.67 while round(2.675, 2) gives 2.68, two roundings of the same float that disagree. A panel 'Round where the document shows a number': three postcards at 0.05 with 10% VAT give 0.5 + 0.5 + 0.5 cents per line, rounded to 1 + 1 + 1 = 3 cents, but 10% of the total of 15 cents is 1.5, rounded to 2 cents; both are legal, but the invoice must use one rule and the sum of its printed lines must equal its total; this shop rounds each line, so the VAT on the invoice is the sum of the VAT printed on every line and the card is charged exactly the total on the PDF.",
            caption: "Parse strings straight into cents, compute in cents, and format cents only for people.",
        }),
        h3("Parse: from \"19.99\" to 1999"),
        p("Prices arrive as strings - from the database, a CSV or a form. Parse them **directly into cents**, with a regular expression that also validates the format (lesson 8), and without ever creating a float:"),
        code("php", String.raw`
/** "19.99" -> 1999, "19.9" -> 1990, "20" -> 2000 */
function toCents(string $amount): int
{
    if (preg_match('/^(\d+)(?:\.(\d{1,2}))?$/', $amount, $m) !== 1) {
        throw new InvalidArgumentException("bad amount '$amount'");
    }
    return (int) $m[1] * 100 + (int) str_pad($m[2] ?? '', 2, '0');
}`),
        bullets([
            "**The pattern accepts** digits, optionally followed by a point and one or two digits. It rejects `19.999`, `19,99`, `-5`, `1e3` and ` 19.99`: a price outside the rules is an error, not a guess.",
            "**`str_pad(..., 2, '0')` pads on the right**: `19.9` means 19 dollars and 90 cents. Padding on the left (`STR_PAD_LEFT`) would read it as 9 cents.",
            "**The `(int)` casts are safe here**, because the regex has already proved both parts are plain digit strings (the rule from lesson 1: validate, then cast).",
        ]),
        h3("Percentages: basis points and rounding half up"),
        p("A percentage like 12.5% has the same problem as a price. Express it as an integer number of **basis points** (hundredths of a percent): 10% is 1000, 12.5% is 1250, and a percent string with up to two decimals can be parsed with the same function as an amount. Then compute the percentage of an amount in integers, rounding **half up** to a whole cent:"),
        code("php", String.raw`
/** $bp basis points (1% = 100) of $cents, rounded half up to a whole cent */
function percentOf(int $cents, int $bp): int
{
    return intdiv($cents * $bp + 5000, 10000);
}`),
        p("`$cents * $bp / 10000` is the exact percentage; adding half of the divisor (5000) before the integer division turns \"truncate\" into \"round half up\": 100.5 cents becomes 101, 100.4 becomes 100. This works for values that are not negative; refunds are usually computed as positive amounts and then subtracted, which keeps it that way."),
        h3("Format: from 1999 to \"19.99\""),
        code("php", String.raw`
function formatCents(int $cents): string
{
    return intdiv($cents, 100) . '.' . str_pad((string) ($cents % 100), 2, '0', STR_PAD_LEFT);
}
// formatCents(1999) "19.99", formatCents(5) "0.05", formatCents(100) "1.00"`),
        p("Formatting is the last step and only for people. Here the padding goes on the **left**: 5 cents is `0.05`. (The `number_format` of lesson 2 would also work on `$cents / 100`, but then a float is back in the code path, and you have to know why it is harmless there.)"),
        h3("Where to round"),
        p("Rounding per line and rounding the total are both legal, and they give different results: three postcards at 0.05 with 10% VAT have 0.5 cents of VAT each, which is 3 cents rounded per line and 2 cents rounded on the total. What matters is that **one rule is used everywhere**, and that the numbers printed on the invoice add up to the total printed on it. Hồ Gươm Books rounds every line, so the invoice can show each line's VAT and the card is charged exactly the sum."),

        h2("5. The fix"),
        p("The new invoice code uses the three functions for both the PDF and the payment provider, so there is only one calculation:"),
        code("php", String.raw`
<?php
declare(strict_types=1);

// toCents(), percentOf() and formatCents() as above

$lines = [['Clean Code (ebook)', 1, '19.99'], ['Atomic Habits (ebook)', 3, '4.35'], ['Bookmark', 1, '0.57']];
$subtotal = 0;
$vat = 0;
foreach ($lines as [$title, $qty, $price]) {
    $net = $qty * toCents($price);
    $subtotal += $net;
    $vat += percentOf($net, 1000); // 10% VAT, rounded per line
}
echo 'subtotal ', formatCents($subtotal), ', VAT ', formatCents($vat), ', total ', formatCents($subtotal + $vat), "\n";
echo 'charged: ', $subtotal + $vat, " cents\n";`, "invoice.php"),
        code("text", String.raw`
subtotal 33.61, VAT 3.37, total 36.98
charged: 3698 cents`),
        numbered([
            "**Every amount is an `int` from parsing to output.** The total on the PDF and the amount charged are the same number, formatted two ways.",
            "**VAT is rounded half up per line**: 1.999 + 1.305 + 0.057 dollars become 2.00 + 1.31 + 0.06 = 3.37. The old invoice said 3.36 because it rounded the total; the old charge said 3.35 because it truncated.",
            "**Strict types guard the boundaries**: `toCents` only accepts strings, `percentOf` only ints, and nothing silently converts a float into either.",
            "**Malformed prices are exceptions**, not wrong invoices.",
        ]),

        h2("6. Your turn"),
        p("Now build the complete invoice: several lines with their own VAT rate (e-books 10%, paperbacks 5%, gift cards 0%), an optional order discount applied to every line before VAT, the subtotal, discount, VAT and total, and clear errors for malformed amounts and percents. The test runner parses the input lines and prints what `invoice()` returns."),
        challenge("chal_coding_phpf_431", "Write toCents, toBasisPoints, percentOf and formatCents first and check each on its own examples - most mistakes are in padding (19.9 is 19.90, 5 cents is 0.05) and rounding (half up, per line). Then invoice() only adds integers: per line, the discount comes off before the VAT is computed. Not one float is needed."),

        h2("7. Pitfalls"),
        bullets([
            "**`(float)` or arithmetic on price strings**: `'19.99' * 100` is a float, and `(int)` of it is 1998.",
            "**`(int)` on a computed amount**: it truncates. Round deliberately, with integers.",
            "**`round()` on floats as the fix**: it hides one error and leaves the float in the chain; the next sum or `printf` can still disagree.",
            "**Padding the decimals on the wrong side**: `19.9` is 1990 cents, and 5 cents is printed as `0.05`.",
            "**Rounding in different places** in different programs: the invoice, the charge and the accounting export must use the same function.",
            "**`number_format` with defaults** in machine-readable output: it adds thousands separators (`1,234.50`).",
            "**Accepting `19,99` or `1e3`** as prices: reject anything that is not the documented format.",
        ]),

        h2("8. Course checklist"),
        bullets([
            "Every file starts with `declare(strict_types=1);`, and comparisons use `===` (lesson 1).",
            "Text is handled with `mb_` functions and formatted in one place (lesson 2).",
            "Arrays are clearly lists or maps, combined with the right operator, and returned as lists where JSON arrays are expected (lessons 3 and 4).",
            "Functions have typed parameters and returns, nullable types instead of magic values, and named arguments for unclear values (lesson 5).",
            "Fixed sets of values are enums, matched exhaustively; small data objects are readonly (lesson 6).",
            "Operations are all or nothing, and only expected exceptions are caught (lesson 7).",
            "Input is validated once at the boundary, with every problem reported (lesson 8).",
            "Money is an integer in the smallest unit, parsed from strings and rounded by one documented rule (lesson 9).",
        ]),
        p("You have finished PHP Foundations. From here, the backend path continues with SQL and databases, and with a framework such as Laravel or Symfony - which build on exactly these habits."),
    ],
});
