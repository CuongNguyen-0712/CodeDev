// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-phpf-2-1",
    title: "Arrays as lists and maps: + vs array_merge and lost keys",
    slug: { _type: "slug", current: "php-arrays-lists-maps-merge" },
    description:
        "After a one-line refactoring of Hồ Gươm Books' login, merged carts lost books and gained gift wrapping and a tote bag that nobody had ordered. Learn how a PHP array is one ordered map that serves as both list and dictionary, how keys are converted, why array_merge renumbers integer keys while + keeps the left value, how unset leaves holes, why arrays are copied by value, and how isset, ?? and array_key_exists differ.",
    estimatedTime: 18,

    scenario: {
        role: "Junior PHP developer at Hồ Gươm Books, an online bookshop in Hà Nội",
        problem:
            "Customers can fill a cart before they log in. At login, that guest cart is merged into the cart saved with their account. A colleague replaced a 'long' loop with array_merge during a clean-up. The next morning customer care had twelve tickets: books missing from carts, quantities wrong, and orders with gift wrapping and a Hồ Gươm tote bag that customers swore they never added.",
    },

    content: [
        h2("1. The incident"),
        p("Hồ Gươm Books lets customers browse and fill a cart without an account. When they log in, the guest cart is merged into the cart saved with their account, so nothing they picked is lost. The merge used to be a six-line loop. During a clean-up, a colleague replaced it with one line, `array_merge($saved, $guest)`, the tests for the login page passed, and the change went out on a Friday."),
        p("By Saturday morning customer care had twelve tickets. A customer who had Truyện Kiều in both carts found it gone, and in its place a Hồ Gươm tote bag and gift wrapping - products 1 and 2 in the catalogue. Others saw blank lines in their order confirmation. A developer tried the obvious alternative, `$saved + $guest`: no more strange products, but the quantities were wrong."),

        h2("2. Reproduce it"),
        p("A cart maps a product id to a quantity. Save this as `cart.php`:"),
        code("php", String.raw`
<?php
declare(strict_types=1);

// cart.php - at login, the guest cart is merged into the customer's saved cart
$catalog = [
    1 => 'Gift wrapping',
    2 => 'Tote bag Hồ Gươm',
    1021 => 'Truyện Kiều',
    1022 => 'Số đỏ',
    2050 => 'Clean Code',
];
$saved = [1021 => 1, 2050 => 1];  // product id => quantity
$guest = [1021 => 2, 1022 => 1];

$merged = array_merge($saved, $guest);
foreach ($merged as $id => $qty) {
    echo "$qty x {$catalog[$id]}\n";
}
echo "---\n";
foreach ($saved + $guest as $id => $qty) {
    echo "$qty x {$catalog[$id]}\n";
}`, "cart.php"),
        code("text", String.raw`
$ php cart.php
PHP Warning:  Undefined array key 0 in /app/cart.php on line 17
1 x
1 x Gift wrapping
2 x Tote bag Hồ Gươm
PHP Warning:  Undefined array key 3 in /app/cart.php on line 17
1 x
---
1 x Truyện Kiều
1 x Clean Code
1 x Số đỏ`),
        p("The customer had 3 copies of Truyện Kiều, 1 Clean Code and 1 Số đỏ. `array_merge` turned the product ids into 0, 1, 2, 3; `+` kept the ids but dropped the guest's 2 copies. To see why, you need to know what a PHP array really is."),

        h2("3. One type for lists and maps"),
        p("PHP has a single array type: an **ordered map** from keys to values. It remembers the order in which keys were added, and the same type is used for two very different jobs:"),
        bullets([
            "**A list**: keys 0, 1, 2 ... in order, like `['Hoàn Kiếm', 'Ba Đình']`. The keys carry no meaning; only the order does. `array_is_list()` (PHP 8.1) checks exactly this.",
            "**A map** (dictionary): keys that mean something, like `['id' => 1021, 'title' => 'Truyện Kiều']`, or a cart `[1021 => 3, 2050 => 1]` where the key is a product id.",
        ]),
        p("A cart keyed by product id **looks** like it has integer keys, just like a list, and PHP cannot tell the two apart. Functions that were designed for lists then treat your ids as positions. Here is how both kinds behave:"),
        code("php", String.raw`
<?php
declare(strict_types=1);

$stops = ['Hoàn Kiếm', 'Ba Đình', 'Đống Đa'];        // a list: keys 0, 1, 2
$book = ['id' => 1021, 'title' => 'Truyện Kiều'];    // a map: string keys
$stock = [1021 => 4, 2050 => 0];                     // a map: integer keys that mean something

$stops[] = 'Cầu Giấy';           // appends with key 3
var_dump(array_is_list($stops), array_is_list($stock));

unset($stops[1]);                // removes key 1, does not renumber
var_dump(array_is_list($stops));
print_r($stops);
print_r(array_values($stops));   // a list again

var_dump(isset($stock[2050]), $stock[3307] ?? 'not stocked');
$notes = ['gift' => null];
var_dump(isset($notes['gift']), array_key_exists('gift', $notes));`, "arrays.php"),
        code("text", String.raw`
bool(true)
bool(false)
bool(false)
Array
(
    [0] => Hoàn Kiếm
    [2] => Đống Đa
    [3] => Cầu Giấy
)
Array
(
    [0] => Hoàn Kiếm
    [1] => Đống Đa
    [2] => Cầu Giấy
)
bool(true)
string(11) "not stocked"
bool(false)
bool(true)`),
        bullets([
            "**`$list[] = $x`** appends with the next integer key (one more than the largest integer key so far).",
            "**`unset($list[1])` leaves a hole.** The list now has keys 0, 2, 3: `count()` is 3, but `$list[1]` is undefined, and a `for ($i = 0; $i < count($list); $i++)` loop reads the missing key 1 and never reaches key 3. `array_values()` renumbers a map into a list.",
            "**`??`** gives a default for a missing key (or a null value) without a warning: `$stock[3307] ?? 0`.",
            "**`isset()` is false for a key whose value is `null`**; `array_key_exists()` tells you whether the key exists at all. Use `array_key_exists` when null is a meaningful value.",
        ]),
        h3("Keys are converted"),
        p("Array keys can only be ints or strings, and PHP converts other keys - including strings that look like integers - when they are stored:"),
        code("php", String.raw`
<?php
declare(strict_types=1);

$keys = ['1021' => 'a', '0042' => 'b', '-5' => 'c', '1e3' => 'd', true => 'e', null => 'f'];
foreach ($keys as $key => $value) {
    echo var_export($key, true), ' (', get_debug_type($key), ")\n";
}`, "keys.php"),
        code("text", String.raw`
1021 (int)
'0042' (string)
-5 (int)
'1e3' (string)
1 (int)
'' (string)`),
        p("A string that is a **canonical decimal integer** (`'1021'`, `'-5'`) becomes an int key; anything else (`'0042'`, `'1e3'`) stays a string. `true` becomes 1 and `null` becomes `''`; float keys are truncated to ints, with a deprecation notice since PHP 8.1. So a cart filled from a form with `$cart[$_POST['sku']]` gets int keys for SKU `'1021'` and string keys for `'HG-TOTE'`, and everything that follows must cope with both."),

        h2("4. array_merge, +, spread and array_replace"),
        p("PHP has four ways to combine two arrays, and they disagree about exactly the two things a cart cares about: whether keys survive, and which value wins when both arrays have the same key."),
        image("merge-vs-plus", {
            alt: "Two input boxes, $saved with 1021 => 1 Truyện Kiều and 2050 => 1 Clean Code, and $guest with 1021 => 2 Truyện Kiều and 1022 => 1 Số đỏ, then three result boxes. The red array_merge($saved, $guest) box shows 0 => 1 (no product), 1 => 1 Gift wrapping, 2 => 2 Tote bag and 3 => 1 (no product): integer keys are renumbered and every product id is gone. The orange $saved + $guest box shows 1021 => 1, 2050 => 1 and 1022 => 1: keys kept, but for 1021 the left value wins, so 2 copies are lost. The green 'foreach + ??' box shows 1021 => 3, 2050 => 1 and 1022 => 1: keys kept and the quantities of the same id added. A table below explains: array_merge($a, $b) appends, integer keys are renumbered 0, 1, 2 and for a string key in both $b wins; [...$a, ...$b] is the same as array_merge (string keys allowed since PHP 8.1); $a + $b is a union by key, nothing renumbered, and for a key in both $a wins, $b only fills gaps; array_replace($a, $b) works by key, nothing renumbered, and for a key in both $b wins. Lists are combined with array_merge or spread; maps with meaningful keys are combined with +, array_replace or a loop, and none of them adds quantities.",
            caption: "array_merge is for lists. Your cart is a map that happens to have integer keys.",
        }),
        code("php", String.raw`
<?php
declare(strict_types=1);

$a = ['x', 'y'];
$b = ['z', 'w', 'v'];
print_r(array_merge($a, $b));    // [x, y, z, w, v]
print_r($a + $b);                // [x, y, v]: keys 0 and 1 already exist in $a

$defaults = ['wrap' => false, 'note' => '', 'ship' => 'standard'];
$chosen = ['ship' => 'express'];
print_r($chosen + $defaults);    // ship => express, wrap => false, note => ''
print_r(array_replace([1021 => 1, 2050 => 1], [1021 => 2, 1022 => 1]));  // 1021 => 2, 2050 => 1, 1022 => 1`, "combine.php"),
        bullets([
            "**`array_merge` and `[...$a, ...$b]` are for lists.** They append, renumber integer keys and let the later array win for string keys. On a list that is exactly right; on ids it destroys them.",
            "**`$a + $b` is a union by key.** Nothing is renumbered, `$a` wins for keys in both, and `$b` only fills the gaps. It is the idiom for defaults: `$options + $defaults`. On two lists it does not append: `['x', 'y'] + ['z', 'w', 'v']` is `['x', 'y', 'v']`.",
            "**`array_replace($a, $b)`** works by key like `+`, but `$b` wins.",
            "**None of them adds values.** Two carts with the same product need the quantities added, and that is always a loop you write.",
        ]),
        challenge("chal_quiz_phpf_211", "For the first question, write down the keys of both arrays before you combine them. For the second, apply the key conversion rule, then remember that arrays are values and that unset never renumbers."),

        h2("5. Arrays are values"),
        p("One more property explains why the fix below is safe: **assigning or passing an array copies it**. PHP copies lazily - the copy is only made when one side is changed - so it is cheap, but a function that changes an array it received never changes the caller's array:"),
        code("php", String.raw`
$a = [1021 => 1];
$b = $a;          // a copy
$b[1021] = 5;
echo $a[1021], ' ', $b[1021], "\n";   // 1 5`),
        p("Objects behave differently: assigning an object copies a handle to the same object, as you will see with classes in lesson 6. To let a function change the caller's array you would write `&$cart` (pass by reference); avoid it, and return the new array instead."),
        callout("warning", "foreach by reference",
            "foreach ($cart as &$qty) changes the array in place, but $qty stays a reference to the LAST element after the loop. A second foreach ($cart as $qty) then writes every value into that last element. If you use a reference loop, unset($qty) right after it - or, better, write foreach ($cart as $id => $qty) { $cart[$id] = ...; }."),

        h2("6. The fix"),
        p("The fixed merge is the loop that was removed, written so that it is obviously correct. It starts from the saved cart, so the saved lines keep their order, and adds the guest quantities by id:"),
        code("php", String.raw`
<?php
declare(strict_types=1);

/**
 * @param array<int, int> $saved product id => quantity
 * @param array<int, int> $guest product id => quantity
 * @return array<int, int>
 */
function mergeCarts(array $saved, array $guest): array
{
    foreach ($guest as $id => $qty) {
        $saved[$id] = ($saved[$id] ?? 0) + $qty;
    }
    return $saved; // a modified copy: the caller's $saved is unchanged
}

$catalog = [1 => 'Gift wrapping', 2 => 'Tote bag Hồ Gươm', 1021 => 'Truyện Kiều', 1022 => 'Số đỏ', 2050 => 'Clean Code'];
$saved = [1021 => 1, 2050 => 1];
$guest = [1021 => 2, 1022 => 1];

foreach (mergeCarts($saved, $guest) as $id => $qty) {
    echo "$qty x {$catalog[$id]}\n";
}
echo count($saved), " lines still in \$saved\n";`, "cart.php"),
        code("text", String.raw`
3 x Truyện Kiều
1 x Clean Code
1 x Số đỏ
2 lines still in $saved`),
        numbered([
            "**Keys are used as keys.** `$saved[$id]` reads and writes by product id; nothing is renumbered.",
            "**`?? 0`** turns \"not in the saved cart yet\" into a quantity of 0, without a warning, so one line handles both cases.",
            "**New ids are appended at the end** of the ordered map, so the saved lines come first, then the guest-only lines in their order.",
            "**`$saved` is a copy inside the function**: the caller's cart is untouched until it stores the result.",
            "**The docblock states the shape** (`array<int, int>`). Static analysers such as PHPStan and Psalm read it and warn when a value of the wrong shape is passed in.",
        ]),

        h2("7. Your turn"),
        p("The real cart has text SKUs as well as numeric ones, a limit of 10 copies per title, and old saved carts that still contain lines with quantity 0. Its merge still uses `array_merge`, and the function that prepares the lines for the cart page returns a list with holes. Fix both."),
        challenge("chal_fix_phpf_212", "mergeCarts already adds the quantities of SKUs that are in both carts; only the way it combines the two arrays first is wrong - which operator keeps every key and does not renumber? cartLines must return a list: after unset, which function gives you keys 0, 1, 2 again?"),

        h2("8. Pitfalls"),
        bullets([
            "**`array_merge` or `[...$a, ...$b]` on maps with integer keys** (ids, SKUs, years): the keys are renumbered.",
            "**`$a + $b` to append lists**: it fills gaps by key, so most of `$b` disappears.",
            "**`+` or `array_merge` when values must be combined**: neither adds quantities; write the loop.",
            "**`unset` in a list, then `for` with an index**: holes produce undefined keys. Use `foreach`, or `array_values` after removing.",
            "**`isset` to check whether a key exists**: false when the value is `null`. Use `array_key_exists` when null matters.",
            "**Digit strings as keys** become ints (`'1021'`) or stay strings (`'0042'`): code that reads the keys back must accept both.",
        ]),

        h2("9. Checklist"),
        bullets([
            "Every array is clearly a list or a map, and its docblock says which (`list<string>`, `array<int, int>`).",
            "Lists are combined with `array_merge` or spread; maps with `+`, `array_replace` or a loop.",
            "After removing elements from a list, `array_values` restores the keys.",
            "Missing keys are read with `??` and a deliberate default.",
            "Functions return new arrays instead of taking them by reference.",
        ]),
        p("Next lesson: array_map, array_filter and sorting. The bestseller widget sent the mobile app an object instead of a list, and books with equal sales changed places on every refresh."),
    ],
});
