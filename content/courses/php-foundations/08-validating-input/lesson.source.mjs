// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-phpf-4-2",
    title: "Validating input: filter_var and JSON_THROW_ON_ERROR",
    slug: { _type: "slug", current: "php-validating-input-filter-var-json-throw-on-error" },
    description:
        "A request cut off by a bad connection became an empty order at Hồ Gươm Books, a quantity of '1 cuốn' silently dropped a book, and giftWrap: \"false\" gift-wrapped a parcel. Learn to validate input once, at the boundary: decode JSON with JSON_THROW_ON_ERROR instead of checking for null, check the shape and the type of every decoded value, use filter_var for form strings (and its === false trap), collect every problem into one 422 response, and never 'fix' input with a cast.",
    estimatedTime: 18,

    scenario: {
        role: "Junior PHP developer at Hồ Gươm Books, an online bookshop in Hà Nội",
        problem:
            "The mobile app sends orders to POST /api/orders as JSON. In one week, customer care saw an order with no books and a total of 0 VND, a customer who ordered two books and received one, and a parcel gift-wrapped (and charged for it) although the customer had switched gift wrapping off. All three requests had been accepted with HTTP 201.",
    },

    content: [
        h2("1. The incident"),
        p("Orders from the Hồ Gươm Books app arrive at `POST /api/orders` as JSON: the books with their quantities, and options such as gift wrapping. The customer comes from the session, the prices from the database. The endpoint was written quickly for the app's launch, and it trusted the app."),
        p("Three tickets in one week showed what that trust cost. A customer on a train got an order confirmation for 0 VND with no books. Another ordered Truyện Kiều and Số đỏ and received only Số đỏ. A third had switched gift wrapping off and paid 15,000 VND for it anyway. In every case the API had answered `201 Created`."),

        h2("2. Reproduce it"),
        code("php", String.raw`
<?php
declare(strict_types=1);

// orders-api.php - POST /api/orders from the mobile app (the customer comes from the session)
const PRICES = ['so-do' => 65000, 'truyen-kieu' => 89000];

function createOrder(string $body): array
{
    $data = json_decode($body, true);
    $lines = [];
    foreach ($data['items'] ?? [] as $item) {
        $qty = filter_var($item['qty'] ?? null, FILTER_VALIDATE_INT);
        if (!$qty) {
            continue; // skip broken lines
        }
        $lines[] = ['sku' => $item['sku'], 'qty' => $qty];
    }
    $total = array_sum(array_map(fn(array $l): int => PRICES[$l['sku']] * $l['qty'], $lines));
    return ['lines' => count($lines), 'giftWrap' => (bool) ($data['giftWrap'] ?? false), 'total' => $total];
}

$requests = [
    '{"items": [{"sku": "so-do", "qty": 2}, {"sku": "truy',                          // cut off by a bad connection
    '{"items": [{"sku": "so-do", "qty": 2}, {"sku": "truyen-kieu", "qty": "1 cuốn"}]}', // an old app version
    '{"items": [{"sku": "so-do", "qty": 1}], "giftWrap": "false"}',
];
foreach ($requests as $body) {
    echo json_encode(createOrder($body)), "\n";
}`, "orders-api.php"),
        code("text", String.raw`
$ php orders-api.php
{"lines":0,"giftWrap":false,"total":0}
{"lines":1,"giftWrap":false,"total":130000}
{"lines":1,"giftWrap":true,"total":65000}`),
        numbered([
            "**`json_decode` returns `null` for invalid JSON** - and for the valid JSON `null`. The code never checked, `$data['items'] ?? []` turned `null` into an empty list, and an empty order was created.",
            "**Invalid lines were skipped silently.** `filter_var('1 cuốn', FILTER_VALIDATE_INT)` is `false`, the `continue` dropped the book, and the customer was never told.",
            "**`(bool) 'false'` is `true`.** Every non-empty string except `'0'` casts to `true`. An old app version sent the string `\"false\"`, and the cast \"fixed\" its type into the opposite value.",
        ]),
        p("All three are the same mistake: the code tried to make sense of whatever arrived instead of deciding whether it was acceptable. Input from outside - an app, a browser, a CSV, another service - must be **validated once, where it enters**, and either turned into data the rest of the program can trust, or rejected with a reason."),

        h2("3. JSON: throw, don't return null"),
        p("`json_decode` reports errors in the oldest PHP style: it returns `null` and you are supposed to call `json_last_error()` afterwards. Since PHP 7.3, the flag `JSON_THROW_ON_ERROR` makes it throw a `JsonException` instead, which cannot be forgotten:"),
        code("php", String.raw`
var_dump(json_decode('{"items": [{"sku": "so-do", "qty": 2}'));   // NULL - and nothing else happens

try {
    $data = json_decode($body, true, 32, JSON_THROW_ON_ERROR);
} catch (JsonException $e) {
    // "Syntax error", "Control character error, possibly incorrectly encoded", "Maximum stack depth exceeded" ...
}`),
        bullets([
            "**The second argument `true`** decodes objects as associative arrays (`['items' => [...]]`) instead of `stdClass` objects.",
            "**The third argument is the maximum depth** (512 by default). An order is never nested more than a few levels; a small limit like 32 rejects absurd payloads early.",
            "**Use the flag on `json_encode` too.** Encoding fails on invalid UTF-8 (a title cut with `substr`, lesson 2), and without the flag `json_encode` returns `false`, which `echo` prints as nothing.",
            "**Valid JSON is not a valid order.** `[]`, `\"hello\"`, `42` and `null` all decode without error. After decoding, check the shape: `is_array($data) && !array_is_list($data)` for an object. (With `true`, the JSON `{}` and `[]` both become the empty PHP array.)",
        ]),

        h2("4. Check types, then values"),
        p("A decoded JSON value already has a type: `2` is an int, `\"2\"` a string, `2.0` a float, `true` a bool. The app's contract says `qty` is an integer, so check exactly that, and then the range:"),
        code("php", String.raw`
$qty = $item['qty'] ?? null;
if (!is_int($qty) || $qty < 1 || $qty > 10) {
    $problems[] = 'item 2: qty must be a whole number from 1 to 10';
}`),
        bullets([
            "**`is_int`, `is_string`, `is_bool`, `is_array`** check the type without converting anything. `is_numeric` accepts `'1e3'` and `' 5'`, so it is rarely the check you want.",
            "**A phone number or postcode is a string with a format**, checked with a regular expression: `preg_match('/^0\\d{9}$/', $phone) === 1`. If the app sends `912345678` as a JSON number, the leading zero is already gone - reject it.",
            "**Never repair input with a cast.** `(bool) 'false'` is `true`, `(int) '1 cuốn'` is `1`, `(int) 'abc'` is `0`. A cast always succeeds, which is exactly why it cannot validate.",
            "**Collect every problem** instead of stopping at the first. The app can then show all of them next to the right fields, and the customer fixes the order in one round.",
        ]),
        image("validation-boundary", {
            alt: "A pipeline from a request body (a string of bytes, maybe cut off, maybe from an old app version) through three purple steps. 1. Parse: json_decode($body, true, 32, JSON_THROW_ON_ERROR); bad JSON throws JsonException, never null. 2. Check the shape: is_array($data) and !array_is_list($data); an object, not a list, a string or null. 3. Check every field and collect problems: is_int($qty) && 1 <= $qty <= 10, is_string($phone) && preg_match(...), filter_var($email, FILTER_VALIDATE_EMAIL), is_bool($giftWrap). Steps 1 to 3 lead to a red box, '422 with every problem', for example 'item 2: qty must be a whole number from 1 to 10' and 'giftWrap must be true or false', and step 3 also leads to a green box, 'A typed order: ints are ints, bools are bools'. A panel 'Decoded JSON: values already have types' says to check the type, then the range or format: \"qty\": 2 is accepted, \"2\", 2.0 and true are rejected; a phone or postcode must arrive as a string, because \"phone\": 912345678 lost its leading zero; never cast to fix a type, since (bool) \"false\" is true and (int) \"1 cuốn\" is 1; and {} and [] both decode to an empty PHP array. A panel 'Form fields: strings, so use filter_var' says FILTER_VALIDATE_INT with min_range and max_range returns the int or false, and '0' gives 0, so test === false; FILTER_VALIDATE_BOOLEAN with FILTER_NULL_ON_FAILURE gives true for 'on', 'yes' and '1', false for 'off', 'no', '0' and '', and null otherwise; FILTER_VALIDATE_EMAIL accepts a plain address, no spaces, no display name; and filter_var trims ' 3 ' to 3 and rejects '012', so codes need a regex.",
            caption: "Behind the boundary, nobody checks again - and nobody needs to.",
        }),

        h2("5. Form fields: filter_var"),
        p("Values from an HTML form, a query string or a CSV are always **strings**, and there `filter_var` is the right tool: it validates a string as an int, a float, a boolean, an email or a URL, and returns the converted value - or `false`:"),
        code("php", String.raw`
<?php
declare(strict_types=1);

// Values from an HTML form are always strings (or missing).
$form = ['qty' => '0', 'copies' => ' 3 ', 'email' => 'lan@example.vn', 'newsletter' => 'off', 'zip' => '012'];

$qty = filter_var($form['qty'], FILTER_VALIDATE_INT);
var_dump($qty, !$qty, $qty === false);

$copies = filter_var($form['copies'], FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 10]]);
$email = filter_var($form['email'], FILTER_VALIDATE_EMAIL);
$newsletter = filter_var($form['newsletter'], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
$zip = filter_var($form['zip'], FILTER_VALIDATE_INT);
var_dump($copies, $email, $newsletter, $zip);
var_dump(filter_var('maybe', FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE), filter_var(true, FILTER_VALIDATE_INT));`, "form.php"),
        code("text", String.raw`
int(0)
bool(true)
bool(false)
int(3)
string(14) "lan@example.vn"
bool(false)
bool(false)
NULL
int(1)`),
        bullets([
            "**Compare the result with `=== false`.** `'0'` is a valid integer and comes back as `0`, which `!$qty` treats as a failure - the same trap as `strpos` in lesson 1.",
            "**Ranges go in `options`**: `['options' => ['min_range' => 1, 'max_range' => 10]]`. Outside the range is `false`.",
            "**Booleans need `FILTER_NULL_ON_FAILURE`.** Without it, anything that is not a \"true\" word is `false`, so `'maybe'` and a typo look like a deliberate \"no\". With it, `'on'`, `'yes'`, `'true'`, `'1'` are `true`, `'off'`, `'no'`, `'false'`, `'0'`, `''` are `false`, and everything else is `null`.",
            "**`filter_var` is forgiving in places**: it trims whitespace (`' 3 '` is 3), accepts `true` as the integer 1, and rejects leading zeros (`'012'` is `false`). That is right for quantities and wrong for codes - validate postcodes, phone numbers and voucher codes with a regular expression and keep them as strings.",
            "**`FILTER_VALIDATE_EMAIL`** accepts a plain address: no display name (`Lan <lan@example.vn>`), no surrounding spaces, ASCII only unless you add `FILTER_FLAG_EMAIL_UNICODE`. Whether the mailbox exists is a different question, answered by a confirmation email.",
        ]),
        callout("warning", "Validation is not escaping",
            "Validating input decides whether data is acceptable. It does not make data safe to put into HTML or SQL: a valid book title can still contain <script> or a quote. Escape on output (htmlspecialchars for HTML) and use prepared statements with parameters for SQL - always, for every value, validated or not."),

        h2("6. The fix"),
        p("The fixed endpoint parses the order in one function that either returns a typed order or throws an `InvalidOrder` exception with every problem. The controller turns that exception into a `422 Unprocessable Content` response:"),
        code("php", String.raw`
<?php
declare(strict_types=1);

const PRICES = ['so-do' => 65000, 'truyen-kieu' => 89000];

final class InvalidOrder extends InvalidArgumentException
{
    /** @param list<string> $problems */
    public function __construct(public readonly array $problems)
    {
        parent::__construct(implode('; ', $problems));
    }
}

/** @return array{lines: list<array{sku: string, qty: int}>, giftWrap: bool} */
function parseOrder(string $body): array
{
    try {
        $data = json_decode($body, true, 32, JSON_THROW_ON_ERROR);
    } catch (JsonException $e) {
        throw new InvalidOrder(["malformed JSON ({$e->getMessage()})"]);
    }
    if (!is_array($data) || array_is_list($data)) {
        throw new InvalidOrder(['order must be an object']);
    }

    $problems = [];
    $lines = [];
    $items = $data['items'] ?? null;
    if (!is_array($items) || $items === [] || !array_is_list($items)) {
        $problems[] = 'items must be a non-empty list';
    } else {
        foreach ($items as $i => $item) {
            $sku = $item['sku'] ?? null;
            $qty = $item['qty'] ?? null;
            if (!is_string($sku) || !array_key_exists($sku, PRICES)) {
                $problems[] = 'item ' . ($i + 1) . ': unknown book';
            } elseif (!is_int($qty) || $qty < 1 || $qty > 10) {
                $problems[] = 'item ' . ($i + 1) . ': qty must be a whole number from 1 to 10';
            } else {
                $lines[] = ['sku' => $sku, 'qty' => $qty];
            }
        }
    }
    $giftWrap = $data['giftWrap'] ?? false;
    if (!is_bool($giftWrap)) {
        $problems[] = 'giftWrap must be true or false';
    }
    if ($problems !== []) {
        throw new InvalidOrder($problems);
    }
    return ['lines' => $lines, 'giftWrap' => $giftWrap];
}

$requests = [
    '{"items": [{"sku": "so-do", "qty": 2}, {"sku": "truy',
    '{"items": [{"sku": "so-do", "qty": 2}, {"sku": "truyen-kieu", "qty": "1 cuốn"}]}',
    '{"items": [{"sku": "so-do", "qty": 1}], "giftWrap": "false"}',
    '{"items": [{"sku": "so-do", "qty": 2}, {"sku": "truyen-kieu", "qty": 1}], "giftWrap": true}',
];
foreach ($requests as $body) {
    try {
        $order = parseOrder($body);
        echo 'accepted: ', count($order['lines']), ' lines, gift wrap ', var_export($order['giftWrap'], true), "\n";
    } catch (InvalidOrder $e) {
        echo '422 Unprocessable Content: ', json_encode(['errors' => $e->problems]), "\n";
    }
}`, "orders-api.php"),
        code("text", String.raw`
422 Unprocessable Content: {"errors":["malformed JSON (Control character error, possibly incorrectly encoded)"]}
422 Unprocessable Content: {"errors":["item 2: qty must be a whole number from 1 to 10"]}
422 Unprocessable Content: {"errors":["giftWrap must be true or false"]}
accepted: 2 lines, gift wrap true`),
        numbered([
            "**`JSON_THROW_ON_ERROR`**: a cut-off request is an error the app can show (\"check your connection and try again\"), not an empty order.",
            "**The shape is checked before any field**, so `$data['items']` is never read from a string or a list.",
            "**Each field is checked by type and range**, and a bad line is reported, never skipped.",
            "**`giftWrap` must be a real boolean.** The old app's `\"false\"` is rejected; its next release fixes the bug instead of the API guessing.",
            "**One exception carries every problem** (lesson 7), and the function's return type promises callers a typed order: they never check again.",
        ]),

        h2("7. Your turn"),
        p("The real endpoint also receives the customer's email and phone number for delivery. Write `validateOrder`: it returns the list of problems in a fixed order, starting with malformed JSON and a body that is not an object. The test runner prints `ok` or every problem."),
        challenge("chal_coding_phpf_421", "Decode with JSON_THROW_ON_ERROR and return early for the two problems that make every other check meaningless. Then check each field by type first: a JSON number is not a phone number, and '2', 2.0 and true are not integers. Use filter_var only for the email, and compare its result with === false."),

        h2("8. Pitfalls"),
        bullets([
            "**`json_decode` without `JSON_THROW_ON_ERROR`**: invalid JSON becomes `null`, and `?? []` turns it into an empty, \"valid\" request.",
            "**Skipping invalid parts** (`continue` on a bad line): the request is accepted as something the client never sent.",
            "**Casting instead of validating**: `(bool) 'false'` is `true`, `(int) '1 cuốn'` is 1.",
            "**`if (!filter_var(...))`**: rejects a valid `0`. Compare with `=== false`.",
            "**`FILTER_VALIDATE_BOOLEAN` without `FILTER_NULL_ON_FAILURE`**: garbage reads as `false`.",
            "**Validating codes as numbers**: `filter_var('012', FILTER_VALIDATE_INT)` is `false`, and a JSON number loses leading zeros. Codes are strings with a regex.",
            "**Stopping at the first problem**: the user fixes one field, submits, and finds the next.",
        ]),

        h2("9. Checklist"),
        bullets([
            "Every input is validated in one function at the boundary, which returns typed data or throws with every problem.",
            "`json_decode` and `json_encode` always use `JSON_THROW_ON_ERROR`, and the decoded shape is checked before any field.",
            "Decoded JSON is checked with `is_int`, `is_string`, `is_bool` and ranges or regular expressions; form strings with `filter_var` and `=== false`.",
            "No cast is used to repair input.",
            "Invalid requests get a 422 with a list of problems the client can show.",
        ]),
        p("Next lesson: the mini project. An invoice for an international order was one cent short, because 19.99 x 100 is not 1999 in floating point - and you will build the invoice with integer money."),
    ],
});
