// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-phpf-3-1",
    title: "Functions, named arguments, nullable and union types",
    slug: { _type: "slug", current: "php-functions-named-arguments-nullable-union-types" },
    description:
        "A new cash-on-delivery parameter in the middle of Hồ Gươm Books' shippingFee function silently turned every insured parcel into a COD parcel, and a default of 0 that meant 'no campaign' gave everyone free shipping. Learn how to declare functions with typed parameters, defaults and return types (void and never included), call them with named arguments and argument unpacking, use nullable and union types instead of magic values, and why PHP 8.4 deprecates implicitly nullable parameters.",
    estimatedTime: 18,

    scenario: {
        role: "Junior PHP developer at Hồ Gươm Books, an online bookshop in Hà Nội",
        problem:
            "shippingFee() is called from the checkout, the mobile API and the admin panel. Last week a colleague added a cash-on-delivery surcharge to it. Since then, prepaid customers who chose insurance have been charged a COD fee and their parcels were shipped uninsured - and over the weekend the shop gave free shipping to every order, although no campaign was running.",
    },

    content: [
        h2("1. The incident"),
        p("The delivery fee at Hồ Gươm Books comes from one function, `shippingFee()`, called in a dozen places. When the shop started to offer cash on delivery (COD), a colleague added a `bool $cod` parameter. It seemed natural to put it next to `$express`, and the tests for the new COD option passed."),
        p("A week later two problems surfaced at once. A customer complained about a 10,000 VND COD fee on an order she had paid by card - and her parcel, which she had insured, arrived damaged and uninsured. And finance noticed that no order had paid for delivery since Friday evening, when the October campaign was supposed to start for Hà Nội only."),

        h2("2. Reproduce it"),
        code("php", String.raw`
<?php
declare(strict_types=1);

// shipping.php - delivery fee in VND (v2: COD surcharge added last week)
function shippingFee(
    int $grams,
    string $zone,
    int $orderTotal,
    bool $express = false,
    bool $cod = false,        // new: cash on delivery, +10,000 VND
    bool $insured = false,
    int $freeFrom = 0,        // free shipping from this order total; 0 = no campaign
): int {
    if ($orderTotal >= $freeFrom) {
        return 0;
    }
    $fee = match ($zone) { 'HN' => 20000, 'HCM' => 30000, default => 35000 };
    if ($express) {
        $fee = intdiv($fee * 3, 2);
    }
    if ($cod) {
        $fee += 10000;
    }
    if ($insured) {
        $fee += 15000;
    }
    return $fee;
}

// checkout.php, written before v2: a prepaid, insured parcel to Hồ Chí Minh City
echo shippingFee(800, 'HCM', 350000, false, true), "\n";
// the same parcel during the October campaign (free shipping from 500,000 VND)
echo shippingFee(800, 'HCM', 350000, false, true, false, 500000), "\n";`, "shipping.php"),
        code("text", String.raw`
$ php shipping.php
0
40000`),
        p("The insured parcel should cost 30,000 + 15,000 = 45,000 VND. The first call returns 0 and the second 40,000, and strict types did not complain about either:"),
        numbered([
            "**The 5th argument changed meaning.** `checkout.php` was written for v1, where the 5th parameter was `$insured`. In v2 it is `$cod`. Both are `bool`, so `true` fits either one: the parcel became a COD parcel without insurance.",
            "**0 was a magic value.** The author meant `$freeFrom = 0` as \"no campaign\", but `$orderTotal >= 0` is true for every order, so every order shipped free unless a caller passed a threshold.",
        ]),
        p("Both bugs come from the same place: the call does not say what its values mean. This lesson is about writing functions whose signature carries that meaning, and calls that state it."),
        image("positional-shift", {
            alt: "The call shippingFee(800, 'HCM', 350000, false, true), written for v1 for a prepaid, insured parcel, mapped onto two parameter rows. In v1 the values go to $grams 800, $zone HCM, $orderTotal, $express false and $insured true, with $freeFrom 0 as a default. In v2 the same values go to $grams, $zone, $orderTotal, $express false and $cod true, and $insured is left at false: the parcel is charged 10,000 COD and is no longer insured, with no error because both parameters are bool. A green box, 'Name the arguments a reader cannot guess', shows shippingFee(800, 'HCM', 350000, insured: true): names bind to parameters, not positions, so adding, moving or reordering optional parameters is safe; new optional parameters still go last for callers that pass everything by position; and a parameter's name is now part of its public API. A grey box, 'Let the type say what none is', contrasts int $freeFrom = 0, where 0 was meant as no campaign but every order total is >= 0 so everyone gets free shipping, with ?int $freeFrom = null, where null means no campaign, 0 means free for every order, checked with $freeFrom !== null. ?int is int|null, and since PHP 8.4 int $x = null is deprecated.",
            caption: "Two bools side by side: the type system cannot tell them apart, a name can.",
        }),

        h2("3. Declaring functions"),
        p("A function declaration names its parameters, their types and defaults, and its return type. With `declare(strict_types=1);`, every one of those types is checked on every call. The parts you will use most:"),
        code("php", String.raw`
<?php
declare(strict_types=1);

/** @param list<array{isbn: string, title: string}> $books */
function findBook(array $books, string $isbn): ?array
{
    return array_find($books, fn(array $b): bool => $b['isbn'] === $isbn);
}

function formatWeight(int|float $kg): string
{
    return number_format($kg, 1, ',', '.') . ' kg';
}

function stockLabel(int|false $stock): string
{
    return $stock === false ? 'unknown' : "$stock in stock";
}

function total(int ...$amounts): int
{
    return array_sum($amounts);
}

function logLine(string $line): void
{
    echo "[log] $line\n";
}

$books = [['isbn' => '978-604-1-08911-2', 'title' => 'Số đỏ']];
var_dump(findBook($books, '978-604-1-08911-2')['title'], findBook($books, '000'));
echo formatWeight(2), ' / ', formatWeight(1.25), "\n";
echo stockLabel(4), ' / ', stockLabel(false), "\n";
echo total(89000, 65000, 108000), "\n";
$upper = mb_strtoupper(...);
echo implode(', ', array_map($upper, ['số đỏ', 'truyện kiều'])), "\n";
logLine('done');
try {
    echo formatWeight('1.2');
} catch (TypeError $e) {
    echo $e->getMessage(), "\n";
}`, "functions.php"),
        code("text", String.raw`
string(10) "Số đỏ"
NULL
2,0 kg / 1,3 kg
4 in stock / unknown
262000
SỐ ĐỎ, TRUYỆN KIỀU
[log] done
formatWeight(): Argument #1 ($kg) must be of type int|float, string given, called in /app/functions.php on line 39`),
        bullets([
            "**Nullable types** `?array`, `?int`: the value or `null`. `findBook` returns `null` when there is no such book, and the caller must handle it - a static analyser will tell you if it does not.",
            "**Union types** `int|float`, `int|false`: one of several types. `int|false` is the shape of many built-in functions (`strpos`, `array_search`); for your own functions prefer `?int` or an exception over `false`.",
            "**`void`** means the function returns nothing (`return;` is allowed, `return null;` is a compile error). **`never`** means it never returns at all: it always throws or exits.",
            "**Variadic parameters** `int ...$amounts` collect any number of arguments into a list, each one type-checked.",
            "**First-class callables** `mb_strtoupper(...)` turn any function or method into a `Closure` you can pass to `array_map` or store in a variable (PHP 8.1).",
            "**Defaults** must be constant expressions, and parameters with defaults come after the required ones.",
        ]),
        h3("Nullable, not magic"),
        p("The campaign bug is a classic: a special value of the normal type (0, -1, `''`) used to mean \"not set\". It works until the special value becomes a real one - a campaign with free shipping for every order really is `$freeFrom = 0`. A nullable type gives \"not set\" its own value, and `!== null` checks for it explicitly:"),
        code("php", String.raw`
function shippingFee(int $grams, string $zone, int $orderTotal, ?int $freeFrom = null): int
{
    if ($freeFrom !== null && $orderTotal >= $freeFrom) {
        return 0;
    }
    // ...
}`),
        callout("warning", "Implicitly nullable parameters are deprecated in PHP 8.4",
            "Older code writes int $freeFrom = null: the default null used to make the type nullable silently. PHP 8.4 deprecates this: \"Implicitly marking parameter $freeFrom as nullable is deprecated, the explicit nullable type must be used instead\". Write ?int $freeFrom = null (or int|null $freeFrom = null). It is a one-character fix, and it makes the signature honest."),

        h2("4. Named arguments"),
        p("Since PHP 8.0 you can pass arguments **by parameter name**. A named argument binds to the parameter with that name wherever it is in the signature, and every parameter you skip keeps its default:"),
        code("php", String.raw`
echo shippingFee(800, 'HCM', 350000, insured: true);             // $express and $cod keep their defaults
echo shippingFee(grams: 800, zone: 'HCM', orderTotal: 350000);   // every argument named

$fromCheckoutForm = ['grams' => 1200, 'zone' => 'HN', 'orderTotal' => 99000, 'express' => true];
echo shippingFee(...$fromCheckoutForm);                          // string keys unpack as named arguments`),
        bullets([
            "**Name the arguments a reader cannot guess**: booleans, nulls, numbers whose unit is not obvious. `shippingFee(800, 'HCM', 350000, insured: true)` survives any reordering of the optional parameters; `shippingFee(800, 'HCM', 350000, false, true)` does not.",
            "**Positional arguments come first**, named ones after: `f(qty: 2, 'Số đỏ')` is a compile error.",
            "**Unknown names are an `Error`** at run time (`Unknown named parameter $quantity`), and passing the same parameter twice is too. That makes a parameter's name part of the function's API: renaming it breaks callers that use the name.",
            "**Unpacking an array with string keys** (`...$args`) passes its entries as named arguments (PHP 8.1). It is handy for options that come from configuration or a decoded JSON object - and the runner of this lesson's challenge uses it.",
            "**New optional parameters go last** anyway, so callers that still pass everything by position keep working.",
        ]),
        callout("tip", "Too many booleans?",
            "Two or more bool parameters next to each other are a warning sign. Named arguments make calls readable; in the next lesson, an enum (DeliverySpeed::Express) replaces a bool whose meaning is a choice between options, and a small readonly object can group options that always travel together."),
        challenge("chal_quiz_phpf_311", "For the call, check which parameter the named argument binds to and what happens to the one in between. For the statements, think about which rules are checked when the file is compiled and which when the call runs."),

        h2("5. The fix"),
        p("The fixed function makes \"no campaign\" a `null`, moves the new parameter to the end of the signature, and the callers say what their booleans mean. Express orders are never free, and the surcharges are always charged:"),
        code("php", String.raw`
<?php
declare(strict_types=1);

/**
 * Delivery fee in VND. $freeFrom: free standard delivery from this order total; null = no campaign.
 */
function shippingFee(
    int $grams,
    string $zone,
    int $orderTotal,
    bool $express = false,
    bool $insured = false,
    ?int $freeFrom = null,
    bool $cod = false,        // new parameters go last, so old positional calls keep their meaning
): int {
    $free = $freeFrom !== null && !$express && $orderTotal >= $freeFrom;
    $fee = $free ? 0 : match ($zone) { 'HN' => 20000, 'HCM' => 30000, default => 35000 };
    if ($express) {
        $fee = intdiv($fee * 3, 2);
    }
    return $fee + ($insured ? 15000 : 0) + ($cod ? 10000 : 0);
}

echo shippingFee(800, 'HCM', 350000, insured: true), "\n";
echo shippingFee(800, 'HCM', 350000, insured: true, freeFrom: 500000), "\n";
echo shippingFee(800, 'HCM', 650000, freeFrom: 500000), "\n";
echo shippingFee(800, 'HN', 120000, cod: true), "\n";
echo shippingFee(800, 'HN', 120000, freeFrom: 0), "\n";

$fromCheckoutForm = ['grams' => 1200, 'zone' => 'HN', 'orderTotal' => 99000, 'express' => true];
echo shippingFee(...$fromCheckoutForm), "\n";`, "shipping.php"),
        code("text", String.raw`
45000
45000
0
30000
0
30000`),
        numbered([
            "**`?int $freeFrom = null`**: no campaign is `null`, and `0` is a real campaign for every order.",
            "**`$cod` is the last parameter**, so the v1 call `shippingFee(800, 'HCM', 350000, false, true)` means insured again - and every call in the shop was changed to name its booleans anyway.",
            "**Rules are explicit in one expression**: `$free` reads as the business rule, express orders included.",
            "**The return type `int`** guarantees a fee is always an integer number of VND; `intdiv` keeps the express price exact.",
            "**Callers pass an options array with `...$fromCheckoutForm`**: the keys must match the parameter names, which is checked on every call.",
        ]),

        h2("6. Your turn"),
        p("The real fee also depends on the weight: the first kilogram is included, and every started 500 g above it costs 5,000 VND. Write `shippingFee` with the rules in the starter. The test runner calls it with named arguments from JSON, so missing keys use your defaults."),
        challenge("chal_coding_phpf_312", "Keep the signature exactly as given. 'Started 500 g' means rounding up: 1,001 g and 1,500 g both cost one step. Decide the delivery part first (zone, weight, express, campaign), then add the surcharges. Remember that 0 is a real value for $freeFrom."),

        h2("7. Pitfalls"),
        bullets([
            "**Adding a parameter in the middle** of a signature: every positional caller after it shifts silently when the types match. Add optional parameters at the end.",
            "**Several `bool` (or `int`) parameters in a row** called positionally: name them at the call site.",
            "**Magic values for \"not set\"** (0, -1, `''`): use a nullable type and `!== null`.",
            "**`int $x = null`**: implicitly nullable, deprecated in PHP 8.4. Write `?int $x = null`.",
            "**Renaming a parameter** in a function others call with named arguments: it is a breaking change.",
            "**`int|false` and `mixed` returns in your own code**: they push checks onto every caller. Prefer `?int`, an exception, or a small object.",
        ]),

        h2("8. Checklist"),
        bullets([
            "Every parameter and return value has a type; nullable types are explicit (`?int`).",
            "\"Not set\" is `null`, never a special value of the normal type.",
            "Booleans and unclear numbers are passed with named arguments.",
            "New optional parameters are added at the end of the signature.",
            "Functions that return nothing are `void`; functions that always throw are `never`.",
        ]),
        p("Next lesson: match, enums and readonly classes. A missing break in a switch sent customers two emails for one shipment, and a typo in a status string cancelled an order."),
    ],
});
