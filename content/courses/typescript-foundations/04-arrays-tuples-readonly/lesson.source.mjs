// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-tsf-2-1",
    title: "Arrays, tuples & readonly",
    slug: { _type: "slug", current: "typescript-arrays-tuples-readonly" },
    description:
        "A new \"best sellers\" widget on the Chợ Sớm home page sorted the shared product list in place, and for a whole afternoon every category page showed its products by sales instead of by name. The same widget said the most expensive product cost 65.000 đ. Learn how TypeScript types arrays, why sort, reverse and splice change the array every other page is reading, how readonly arrays turn those calls into compile errors, the ES2023 copy methods toSorted, toReversed, toSpliced and with, why sort() needs a compare function for numbers, and how tuples type small fixed-size arrays like [min, max].",
    estimatedTime: 20,

    scenario: {
        role: "Junior frontend developer at Chợ Sớm, an online grocery in Hà Nội, moving the web shop from JavaScript to TypeScript",
        problem:
            "The catalog is loaded once when the shop starts and shared by every page. On Wednesday a \"best sellers\" widget went live on the home page. From the first home page view on, the category pages listed products by units sold, the price filter said nothing cost more than 65.000 đ although a 5 kg bag of ST25 rice costs 180.000 đ, and support received 23 messages from shoppers who could not find products where they used to be.",
    },

    content: [
        h2("1. The incident"),
        p("When the Chợ Sớm shop starts, it loads the whole catalog - about 1.400 products - once, sorts it by name, and keeps it in memory. The category pages, the search results and the price filter all read that one array. On Wednesday at 14:00 a new widget went live on the home page: \"Bán chạy tuần này\", the five best sellers of the week, plus a price range for the filter."),
        p("By 14:30 support had questions. Shoppers who always found rau muống near the bottom of \"Rau củ\" now found it at the top; the fruit page started with whatever had sold most; and the price slider stopped at 65.000 đ, so the rice, the beef and the fish sauce could not be selected at all. Restarting the server fixed it - until the next shopper opened the home page."),

        h2("2. Reproduce it"),
        code("javascript", String.raw`
// catalog.js: one product list, loaded at startup and sorted by name for the category pages
const catalog = [
  { sku: "FRT-201", name: "Bưởi Diễn", price: 65000, sold: 120 },
  { sku: "VEG-101", name: "Cải ngọt", price: 12000, sold: 340 },
  { sku: "DRY-310", name: "Gạo ST25 (5 kg)", price: 180000, sold: 95 },
  { sku: "MEA-204", name: "Thịt ba chỉ", price: 125000, sold: 210 },
  { sku: "EGG-020", name: "Trứng gà (10)", price: 38000, sold: 260 },
];

function bestSellers(products, n) {
  return products.sort((a, b) => b.sold - a.sold).slice(0, n);
}

function priceRange(products) {
  const prices = products.map((p) => p.price).sort();
  return [prices[0], prices[prices.length - 1]];
}

console.log("home, best sellers:", bestSellers(catalog, 3).map((p) => p.name).join(", "));
console.log("filter, price range:", priceRange(catalog).join(" - "));
console.log("category page:", catalog.map((p) => p.name).join(", "));`, "catalog.js"),
        code("text", String.raw`
$ node catalog.js
home, best sellers: Cải ngọt, Trứng gà (10), Thịt ba chỉ
filter, price range: 12000 - 65000
category page: Cải ngọt, Trứng gà (10), Thịt ba chỉ, Bưởi Diễn, Gạo ST25 (5 kg)`),
        p("The best sellers are right. The other two lines are the incident:"),
        bullets([
            "**`sort` works in place.** It reorders the array it is called on and returns that same array. `products` is not a copy: arrays are passed by reference, so `products` and `catalog` are two names for one array. `slice(0, n)` copies only after the damage is done.",
            "**`sort()` without a compare function compares strings.** `[65000, 12000, 180000, 125000, 38000].sort()` converts every number to text and orders the texts: `\"12000\" < \"125000\" < \"180000\" < \"38000\" < \"65000\"`. The \"highest\" price is the one whose text sorts last.",
        ]),

        h2("3. Array types"),
        p("An array type is the element type followed by `[]`; `Array<T>` means the same thing:"),
        code("typescript", String.raw`
interface Product {
  readonly sku: string;
  name: string;
  price: number;
  sold: number;
}

const skus: string[] = ["VEG-101", "FRT-201"];
const prices: Array<number> = [65000, 12000];
const catalog: Product[] = [];                  // an empty array needs its type written
const mixed: (string | number)[] = ["VEG-101", 40];`),
        p("Every method is typed from the element type: `catalog.map((p) => p.price)` is a `number[]`, `catalog.filter(...)` is a `Product[]`, `catalog.find(...)` is `Product | undefined` (lesson 2). Two reads are worth knowing exactly:"),
        bullets([
            "**`catalog[i]` has the type `Product`**, even when `i` is past the end. TypeScript does not track array lengths; the `noUncheckedIndexedAccess` option (not part of strict) makes every index read `Product | undefined`.",
            "**`catalog.at(-1)` has the type `Product | undefined`**: `at` is declared that way, so the checker makes you handle the empty array.",
        ]),

        h2("4. readonly arrays"),
        p("TypeScript has a second array type for arrays you must not change: `readonly Product[]` (or `ReadonlyArray<Product>`). It has every method that **reads** - `map`, `filter`, `find`, `slice`, `includes`, `forEach` - and none of the methods that **change** the array: `push`, `pop`, `shift`, `unshift`, `splice`, `sort`, `reverse`, `fill`, `copyWithin`. Declare the widget's parameter as readonly, and Wednesday's code no longer compiles:"),
        code("typescript", String.raw`
function bestSellers(products: readonly Product[], n: number): Product[] {
  return products.sort((a, b) => b.sold - a.sold).slice(0, n);
}`),
        code("text", String.raw`
$ npx tsc
catalog.ts:2:19 - error TS2339: Property 'sort' does not exist on type 'readonly Product[]'.
catalog.ts:2:25 - error TS7006: Parameter 'a' implicitly has an 'any' type.
catalog.ts:2:28 - error TS7006: Parameter 'b' implicitly has an 'any' type.`),
        p("The first error is the real one; the two TS7006 errors follow from it: `sort` does not exist, so TypeScript has no signature to infer `a` and `b` from. When one error causes others, fix the first and compile again."),
        image("shared-catalog-sort", {
            alt: "Diagram titled 'One shared array: sort() reorders it for every page'. Before, with catalog: Product[]: the home page's bestSellers calls catalog.sort by sold, while the category page and the price filter expect the load order; all three point to the same catalog array, which now reads Cải ngọt 340, Trứng gà 260, Thịt ba chỉ 210, Bưởi Diễn 120, Gạo ST25 95 - reordered in place, so every page sees sales order. Below, prices.sort() compares strings: [65000, 12000, 180000, 125000, 38000].sort() orders \"12000\" < \"125000\" < \"180000\" < \"38000\" < \"65000\", so the highest price shows as 65000 instead of 180000. After, with catalog: readonly Product[]: sort, reverse, push, pop, shift, unshift, splice and fill do not exist (error TS2339, Property 'sort' does not exist on type 'readonly Product[]'), and a readonly array is never assignable to a mutable one (TS4104). Methods that return a new array are fine: toSorted, toReversed, toSpliced, with, map, filter, slice, concat and spreading; for example catalog.toSorted((a, b) => b.sold - a.sold) and prices.toSorted((a, b) => a - b). These ES2023 copy methods exist in Node 20+ and every current browser. A bottom note: readonly is shallow and compile-time only; the array cannot be reordered, grown or shrunk through this name, but the Product objects inside can still change unless their own properties are readonly, and nothing is frozen at runtime.",
            caption: "The array has one owner. Every reader gets a view that cannot change it.",
        }),
        h3("Passing arrays to readonly parameters"),
        p("A mutable `Product[]` can always be passed where `readonly Product[]` is expected: the function promises not to change it, which is fine for any caller. The opposite is an error, because the receiver could change the array through its mutable name:"),
        code("typescript", String.raw`
function addToCart(items: Product[]) { /* may push */ }

const shared: readonly Product[] = catalog;
addToCart(shared);
// error TS2345: Argument of type 'readonly Product[]' is not assignable to parameter of type 'Product[]'.
//   The type 'readonly Product[]' is 'readonly' and cannot be assigned to the mutable type 'Product[]'.`),
        p("So the rule for function parameters is simple: **if a function does not need to change an array, declare the parameter `readonly`**. It costs nothing at the call site, and it documents and enforces the promise."),

        h2("5. Copy methods: toSorted and friends"),
        p("ES2023 added a non-mutating twin for each reordering method. They return a new array and leave the original alone, so they exist on readonly arrays:"),
        code("typescript", String.raw`
const bySales = catalog.toSorted((a, b) => b.sold - a.sold);   // new array, catalog unchanged
const newestFirst = catalog.toReversed();
const withoutFirst = catalog.toSpliced(0, 1);
const discounted = catalog.with(0, { ...catalog[0], price: 55000 });   // copy with index 0 replaced`),
        p("Before ES2023 the idiom was to copy first: `[...catalog].sort(...)` or `catalog.slice().sort(...)`. Both are still correct; `toSorted` says the intent in one word. The copy methods need `lib` ES2023 or later (the course's `target` es2024 includes it) and run in Node 20+ and all current browsers."),
        h3("Compare functions"),
        p("`sort` and `toSorted` call your compare function with two elements and expect a number: negative if `a` comes first, positive if `b` comes first, 0 to keep their order (both sorts are stable, so equal elements stay in their original order)."),
        code("typescript", String.raw`
prices.toSorted((a, b) => a - b);                       // numbers, ascending
catalog.toSorted((a, b) => b.sold - a.sold);            // by a number property, descending
catalog.toSorted((a, b) => a.name.localeCompare(b.name, "vi"));   // text, Vietnamese order
catalog.toSorted((a, b) => b.sold - a.sold || a.price - b.price); // ties broken by a second key`),
        p("TypeScript cannot catch a missing compare function: `sort()` without arguments is valid on any array. Make it a habit - and a review rule - that every sort of numbers or objects has one."),
        challenge("chal_quiz_tsf_211", "For the first question, write the five prices as strings and order them character by character. For the second, sort the lines into two groups: the ones that change the array itself, and the ones that create a new array or change an object inside it."),

        h2("6. Tuples"),
        p("A **tuple** is an array with a fixed length where each position has its own type. `priceRange` returns exactly two numbers, a minimum and a maximum - a tuple says so:"),
        code("typescript", String.raw`
function priceRange(products: readonly Product[]): [min: number, max: number] {
  const prices = products.map((p) => p.price).toSorted((a, b) => a - b);
  return [prices[0], prices[prices.length - 1]];
}

const [min, max] = priceRange(catalog);   // min: number, max: number

type StockLine = [sku: string, qty: number];
const line: StockLine = ["VEG-101", 40];
const [sku, qty] = line;
line[2];
// error TS2493: Tuple type 'StockLine' of length '2' has no element at index '2'.
const swapped: StockLine = [40, "VEG-101"];
// error TS2322: Type 'number' is not assignable to type 'string'.
// error TS2322: Type 'string' is not assignable to type 'number'.`),
        bullets([
            "**The labels** (`min:`, `sku:`) are documentation: they appear in the editor, but positions are still read with `[0]` and `[1]` or destructuring.",
            "**Tuples suit small, positional results**: a pair from a function, the `[key, value]` entries of `Object.entries` and `Map`, React's `[state, setState]`. When there are more than two or three positions, or the meaning is not obvious from the order, use an object with named properties instead.",
            "**`as const`** turns an array literal into a readonly tuple of literal types: `const slots = [\"before-8\", \"before-10\"] as const` has the type `readonly [\"before-8\", \"before-10\"]`, and `slots.push(...)` is an error.",
        ]),

        h2("7. The fix"),
        code("typescript", String.raw`
// The catalog is loaded once and shared by every page: nothing may reorder it.
let catalog: readonly Product[] = [];

function bestSellers(products: readonly Product[], n: number): Product[] {
  return products.toSorted((a, b) => b.sold - a.sold).slice(0, n);
}

function priceRange(products: readonly Product[]): [min: number, max: number] {
  const prices = products.map((p) => p.price).toSorted((a, b) => a - b);
  return [prices[0], prices[prices.length - 1]];
}`, "catalog.ts"),
        code("text", String.raw`
home, best sellers: Cải ngọt, Trứng gà (10), Thịt ba chỉ
filter, price range: 12000 - 180000
category page: Bưởi Diễn, Cải ngọt, Gạo ST25 (5 kg), Thịt ba chỉ, Trứng gà (10)`),
        numbered([
            "**The shared catalog is `readonly Product[]`** everywhere it is passed, so no page can reorder, grow or shrink it. The only code that builds it is the loader.",
            "**`toSorted` returns a new array**, so the widget gets its own order and the category pages keep theirs.",
            "**Every numeric sort has a compare function.** `toSorted()` without one would compile - and repeat the 65.000 đ bug.",
            "**The test that should have existed** renders the home page and then checks the category page order.",
        ]),

        h2("8. Your turn"),
        p("The real widget also breaks ties: products that sold the same number of units are ordered by sku. The starter is Wednesday's code with a readonly catalog - it does not compile."),
        challenge("chal_fix_tsf_212", "Replace each sort with toSorted, and give both a compare function. For bestSellers, sort by sold descending and use || to fall back to comparing the skus when the difference is 0 (compare strings with < and >, or localeCompare). For priceRange, sort the numbers ascending with (a, b) => a - b."),

        h2("9. Pitfalls"),
        bullets([
            "**`sort`, `reverse` and `splice` change the array in place**, including arrays you received as parameters. Use `toSorted`, `toReversed`, `toSpliced`, or copy first.",
            "**`sort()` without a compare function sorts numbers as strings.** TypeScript does not warn you.",
            "**`readonly` is shallow**: the array cannot change, but the objects in it can, unless their properties are `readonly` too.",
            "**`readonly` is compile-time only**: JavaScript callers, or a cast, can still change the array. Use `Object.freeze` when you need a runtime guarantee.",
            "**`arr[i]` is typed `T`, never `T | undefined`**: an index past the end is `undefined` at runtime. Check lengths, or use `at()` or `noUncheckedIndexedAccess`.",
            "**Long tuples**: `[string, number, number, boolean]` is unreadable at the call site. Use an object.",
        ]),

        h2("10. Checklist"),
        bullets([
            "Shared arrays (caches, stores, props) are typed `readonly T[]`, and so are parameters of functions that only read them.",
            "Reordering uses `toSorted` / `toReversed`, or works on a copy.",
            "Every sort of numbers or objects has an explicit compare function, with a tie-breaker when the order of equal elements matters.",
            "Small fixed-size results use labelled tuples; anything bigger uses an object.",
            "Tests check that inputs are unchanged after the call, not only that the result is right.",
        ]),
        p("Next lesson: functions and generics. A reporting helper typed with `any` let a typo through, and the weekly revenue report said NaN."),
    ],
});
