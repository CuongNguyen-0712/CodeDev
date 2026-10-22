// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-phpf-2-2",
    title: "array_map, array_filter, usort & stable sorting",
    slug: { _type: "slug", current: "php-array-map-filter-usort-stable-sorting" },
    description:
        "The bestseller widget of the Hồ Gươm Books app crashed on Android because PHP sent a JSON object instead of an array, showed two books where it should show three, and swapped books with equal sales on every refresh. Learn array_map, array_filter, array_column, array_sum and PHP 8.4's array_find and array_any, which functions keep keys and which renumber, how json_encode decides between array and object, and how to write usort comparators with <=> and a tie-break that give the same order every time.",
    estimatedTime: 18,

    scenario: {
        role: "Junior PHP developer at Hồ Gươm Books, an online bookshop in Hà Nội",
        problem:
            "The mobile app's home screen shows a 'Bán chạy' (bestsellers) strip fed by a small PHP endpoint. The week a bestseller sold out, the Android app crashed on start for every user, the iOS app showed two books instead of three, and the marketing team complained that the order of the strip changed every time they pulled to refresh.",
    },

    content: [
        h2("1. The incident"),
        p("The Hồ Gươm Books app opens on a strip of bestsellers: the three books that sold best in the last 30 days and are in stock. A PHP endpoint builds it from a database query and returns JSON. It had worked for months."),
        p("Then Truyện Kiều sold out. Within an hour, the Android app crashed on start for everyone - its JSON parser expected an array and got an object. The iOS app, which is more forgiving, showed only two books. And when the marketing team pulled to refresh, Số đỏ and Clean Code, which had sold exactly 120 copies each, swapped places every few seconds."),

        h2("2. Reproduce it"),
        p("This is the endpoint, with two requests whose rows came back from the database in a different order (the query had no `ORDER BY`):"),
        code("php", String.raw`
<?php
declare(strict_types=1);

// bestsellers.php - JSON for the "Bán chạy" (bestsellers) widget of the mobile app
function bestsellers(array $books, int $limit): array
{
    usort($books, fn(array $a, array $b): bool => $a['sold'] < $b['sold']); // most sold first
    $top = array_slice($books, 0, $limit);
    return array_filter($top, fn(array $b): bool => $b['stock'] > 0);
}

// Two requests a minute apart: the database returned the same rows in a different order.
$request1 = [
    ['id' => 7, 'title' => 'Số đỏ', 'sold' => 120, 'stock' => 4],
    ['id' => 3, 'title' => 'Truyện Kiều', 'sold' => 340, 'stock' => 0],
    ['id' => 9, 'title' => 'Clean Code', 'sold' => 120, 'stock' => 2],
    ['id' => 5, 'title' => 'Đắc nhân tâm', 'sold' => 515, 'stock' => 11],
];
$request2 = [$request1[2], $request1[3], $request1[0], $request1[1]];

echo json_encode(bestsellers($request1, 3), JSON_UNESCAPED_UNICODE), "\n";
echo json_encode(bestsellers($request2, 3), JSON_UNESCAPED_UNICODE), "\n";`, "bestsellers.php"),
        code("text", String.raw`
$ php bestsellers.php
PHP Deprecated:  usort(): Returning bool from comparison function is deprecated, return an integer less than, equal to, or greater than zero in /app/bestsellers.php on line 7
{"0":{"id":5,"title":"Đắc nhân tâm","sold":515,"stock":11},"2":{"id":7,"title":"Số đỏ","sold":120,"stock":4}}
{"0":{"id":5,"title":"Đắc nhân tâm","sold":515,"stock":11},"2":{"id":9,"title":"Clean Code","sold":120,"stock":2}}`),
        p("Three bugs, one per symptom:"),
        numbered([
            "**`{\"0\": ..., \"2\": ...}` is a JSON object.** `array_filter` removed Truyện Kiều at key 1 and kept the other keys, and `json_encode` writes an array only when the keys are 0, 1, 2 ... in order.",
            "**Two books instead of three.** The code takes the top 3 first and filters afterwards, so the sold-out book used up one of the three places.",
            "**The order of equal books depends on the input.** The comparator only looks at `sold`. PHP's sort is stable, so books with equal sales keep the order in which they arrived - and the database returned them in a different order each time. The comparator also returns a `bool`, which PHP 8 deprecates.",
        ]),

        h2("3. map, filter and friends"),
        p("Most loops over arrays do one of a few things: transform every element, keep some of them, pick one, or reduce them to a single value. PHP has a function for each, and they all take a **callback**, usually an arrow function `fn(array $b): bool => ...`:"),
        code("php", String.raw`
<?php
declare(strict_types=1);

$books = [
    ['id' => 7, 'title' => 'Số đỏ', 'sold' => 120, 'stock' => 4, 'price' => 65000],
    ['id' => 3, 'title' => 'Truyện Kiều', 'sold' => 340, 'stock' => 0, 'price' => 89000],
    ['id' => 9, 'title' => 'Clean Code', 'sold' => 120, 'stock' => 2, 'price' => 420000],
];

$titles = array_map(fn(array $b): string => mb_strtoupper($b['title']), $books);
$over80k = array_filter($books, fn(array $b): bool => $b['price'] > 80000);
$byId = array_column($books, 'title', 'id');
$stockValue = array_sum(array_map(fn(array $b): int => $b['stock'] * $b['price'], $books));
$firstSoldOut = array_find($books, fn(array $b): bool => $b['stock'] === 0);

print_r($titles);
print_r(array_keys($over80k));
print_r($byId);
echo $stockValue, ' ', $firstSoldOut['title'], "\n";
var_dump(array_any($books, fn(array $b): bool => $b['stock'] === 0));
var_dump(array_filter([3, 0, 5, null, '0', '']));`, "functions.php"),
        code("text", String.raw`
Array
(
    [0] => SỐ ĐỎ
    [1] => TRUYỆN KIỀU
    [2] => CLEAN CODE
)
Array
(
    [0] => 1
    [1] => 2
)
Array
(
    [7] => Số đỏ
    [3] => Truyện Kiều
    [9] => Clean Code
)
1100000 Truyện Kiều
bool(true)
array(2) {
  [0]=>
  int(3)
  [2]=>
  int(5)
}`),
        bullets([
            "**`array_map($fn, $array)`** transforms every element. Note the argument order: callback first. With one array it keeps the keys.",
            "**`array_filter($array, $fn)`** keeps the elements for which the callback returns true - **with their keys**: `$over80k` has the keys 1 and 2. Array first, callback second. `ARRAY_FILTER_USE_KEY` and `ARRAY_FILTER_USE_BOTH` pass the key to the callback.",
            "**`array_filter` without a callback** removes every falsy value: `0`, `'0'`, `''` and `null` all go. That is rarely what you want for numbers - a stock of 0 or a rating of 0 is real data.",
            "**`array_column($rows, 'title', 'id')`** picks one field from every row, optionally keyed by another field: an `id => title` map in one call.",
            "**`array_sum`, `array_reduce`** reduce an array to one value. `array_sum(array_map(...))` reads better than most `array_reduce` calls.",
            "**`array_find`, `array_find_key`, `array_any` and `array_all`** are new in PHP 8.4: the first matching element (or `null`), its key, and whether any or all elements match. They stop at the first answer, like a loop with `break`.",
        ]),
        callout("tip", "Arrow functions",
            "fn(array $b): bool => $b['stock'] > 0 is an arrow function: a single expression, automatically returned, that can read the variables around it ($limit, $minPrice ...) without a use clause. A longer callback is a closure: function (array $b) use ($limit): bool { ... }. Type the parameters and the return value of callbacks too: with strict_types, a wrong type fails at once instead of three functions later."),

        h2("4. Keys, lists and json_encode"),
        p("`json_encode` has to decide whether a PHP array becomes a JSON array or a JSON object, and it uses one rule: **a list (keys 0, 1, 2 ... in order) becomes an array, anything else an object**. Every function in the pipeline either keeps the keys it received or renumbers them, and you need to know which:"),
        image("filter-sort-pipeline", {
            alt: "A pipeline of four boxes connected by arrows. $books has the keys 0 to 3: #7 Số đỏ 120, #3 Kiều 340 out of stock, #9 Clean 120 and #5 Đắc 515. The orange array_filter box keeps the keys 0, 2 and 3, and json_encode writes it as an object with the keys \"0\" and \"2\". The green usort (stable) box renumbers: 0 => #5 Đắc 515, 1 => #7 Số đỏ 120, 2 => #9 Clean 120, a list again, with #7 before #9 by id for the tie. The green array_slice(0, 3) box renumbers integer keys unless preserve_keys is true, and json_encode writes an array. Below, a 'Keep the keys' list: array_filter and array_map with one array; uasort, uksort, asort, arsort and ksort; array_slice with true. A 'Return a list' list: usort, sort, rsort and array_values; array_slice, array_merge and array_column with one column; array_map with two or more arrays. On the right, 'A comparator returns an int': fn($a, $b) => $a['sold'] < $b['sold'] returns a bool, deprecated since PHP 8.0, and PHP calls it twice to guess; fn($a, $b) => $b['sold'] <=> $a['sold'] returns negative, 0 or positive for most sold first, and ties keep their input order because sorting is stable since PHP 8.0; fn($a, $b) => [$b['sold'], $a['id']] <=> [$a['sold'], $b['id']] compares arrays element by element: sold descending, then id ascending, the same order on every request. Swap $a and $b on one side to sort that field descending.",
            caption: "array_filter keeps the keys. Whether the JSON is an array depends on what comes after it.",
        }),
        p("So `array_filter` followed by `usort` is safe, because `usort` renumbers; `array_filter` as the last step is not. When the last step keeps keys and you need a list, wrap it in `array_values()`. Two flags help on the way out: `JSON_UNESCAPED_UNICODE` writes `Số đỏ` instead of `\\u` escape sequences, and `JSON_THROW_ON_ERROR` (lesson 8) turns encoding errors into exceptions."),

        h2("5. Sorting with a comparator"),
        p("PHP's built-in sorts come in pairs that differ in what they do with keys: `sort` and `rsort` sort values and renumber; `asort` and `arsort` sort values and keep keys; `ksort` and `krsort` sort by key. For rows like books, use the **user-defined** versions, which take a comparator: `usort` (renumbers), `uasort` (keeps keys) and `uksort` (by key). All of them sort the array **in place** and return `true`, so `$sorted = usort($books, ...)` is a classic bug."),
        h3("The comparator contract"),
        p("A comparator receives two elements and returns an **int**: negative if `$a` comes first, positive if `$b` comes first, 0 if they are equal. The spaceship operator `<=>` returns exactly that, for numbers, strings and arrays:"),
        bullets([
            "**`$a['sold'] <=> $b['sold']`** sorts ascending; **`$b['sold'] <=> $a['sold']`** (swapped) sorts descending.",
            "**Arrays compare element by element**, so `[$b['sold'], $a['id']] <=> [$a['sold'], $b['id']]` means \"most sold first, then the lower id\". Swap `$a` and `$b` per element to choose the direction of each field.",
            "**Returning a bool** (`$a['sold'] < $b['sold']`) is deprecated since PHP 8.0. PHP detects it, calls the comparator a second time with the arguments swapped to tell \"equal\" from \"greater\", and warns.",
        ]),
        h3("Stable sorting and tie-breaks"),
        p("Since PHP 8.0, every sort is **stable**: elements that compare as equal keep their original order. That is useful - sort by title, then stably by author, and books by the same author stay sorted by title - but it also means that a comparator with ties hands control of the order to whoever produced the input. A database without `ORDER BY` makes no promise about row order, so the widget flickered. A list that users see must have a **total order**: compare a unique field such as the id as the last step."),
        callout("info", "Sorting text",
            "<=> on strings compares bytes, which puts 'Đắc nhân tâm' after every title that starts with a plain letter, because Đ is a 2-byte character that starts with byte C4. For an alphabetical list in Vietnamese, use the intl extension's Collator (new Collator('vi_VN')) or sort in the database with a Vietnamese collation. For a tie-break, any total order is fine, which is why the fix below uses the id."),
        challenge("chal_coding_phpf_221", "Filter first, so a sold-out book cannot take a place. Sort with an int comparator that has a tie-break, then take the first $limit. Check which of your functions keep keys: the app needs a JSON array."),

        h2("6. The fix"),
        p("The fixed endpoint filters before it limits, sorts with a total order, and ends with a function that returns a list:"),
        code("php", String.raw`
<?php
declare(strict_types=1);

/**
 * @param list<array{id: int, title: string, sold: int, stock: int}> $books
 * @return list<array{id: int, title: string, sold: int, stock: int}>
 */
function bestsellers(array $books, int $limit): array
{
    $inStock = array_filter($books, fn(array $b): bool => $b['stock'] > 0);
    usort($inStock, fn(array $a, array $b): int => [$b['sold'], $a['id']] <=> [$a['sold'], $b['id']]);
    return array_slice($inStock, 0, $limit);
}

$request1 = [
    ['id' => 7, 'title' => 'Số đỏ', 'sold' => 120, 'stock' => 4],
    ['id' => 3, 'title' => 'Truyện Kiều', 'sold' => 340, 'stock' => 0],
    ['id' => 9, 'title' => 'Clean Code', 'sold' => 120, 'stock' => 2],
    ['id' => 5, 'title' => 'Đắc nhân tâm', 'sold' => 515, 'stock' => 11],
];
$request2 = [$request1[2], $request1[3], $request1[0], $request1[1]];

foreach ([$request1, $request2] as $rows) {
    $top = bestsellers($rows, 3);
    echo json_encode(array_column($top, 'id')), ' ', array_is_list($top) ? 'list' : 'map', "\n";
}`, "bestsellers.php"),
        code("text", String.raw`
[5,7,9] list
[5,7,9] list`),
        numbered([
            "**Filter, then sort, then limit.** A sold-out book is gone before the top 3 are counted.",
            "**`usort` renumbers**, so the holes `array_filter` left disappear, and `array_slice` returns a list too. `array_is_list` in a test is a cheap way to guard the contract.",
            "**The comparator returns an int** and ends with a unique field: the same rows give the same order whatever order they arrive in.",
            "**The docblock states the shape** of the input and the output (`list<array{...}>`), which is what the mobile team actually depends on.",
            "**The database query could also sort** (`ORDER BY sold DESC, id ASC LIMIT 3`). When it does, keep the same tie-break in both places, or the cache and the database will disagree.",
        ]),

        h2("7. Pitfalls"),
        bullets([
            "**`array_filter` (or `uasort`, `asort`, `array_slice(..., true)`) as the last step before `json_encode`**: keys survive, the JSON becomes an object. End with `array_values` or a function that renumbers.",
            "**Limiting before filtering**: the items you remove still used up places.",
            "**Comparators without a tie-break**: equal elements keep their input order, which may change between requests.",
            "**Comparators that return bool**: deprecated; return `<=>`.",
            "**`$sorted = usort(...)`**: sort functions sort in place and return `true`.",
            "**`array_filter($numbers)` without a callback**: removes zeros along with nulls.",
            "**`array_map($array, $fn)` / `array_filter($fn, $array)`**: the argument orders differ. Named arguments (`array_filter($books, callback: ...)`) make them easy to read.",
        ]),

        h2("8. Checklist"),
        bullets([
            "Every function that returns data to a client returns a list where a JSON array is expected, and a test checks `array_is_list`.",
            "Filters run before limits.",
            "Every comparator returns an int built with `<=>` and ends with a unique field.",
            "Callbacks have typed parameters and return types.",
            "Text sorted for people uses a collation, not `<=>`.",
        ]),
        p("Next lesson: functions and types. A shipping-fee function with five positional parameters charged express prices for standard deliveries, and nobody could tell from the call."),
    ],
});
