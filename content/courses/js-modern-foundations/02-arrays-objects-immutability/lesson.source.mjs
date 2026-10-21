// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-jsf-1-2",
    title: "Arrays & objects: map, filter, reduce & structuredClone",
    slug: { _type: "slug", current: "arrays-objects-map-filter-reduce-structuredclone" },
    description:
        "A support agent duplicates a paid order, edits the copy, and the warehouse ships the edited quantity on the original. Learn why objects and arrays are shared by reference, why spread only copies one level, how structuredClone makes deep copies, and how map, filter, reduce, Object.groupBy and toSorted transform data without changing it.",
    estimatedTime: 22,

    scenario: {
        role: "Junior full-stack developer, e-shop admin dashboard",
        problem:
            "Support duplicated order A-1001 (2 mugs, paid) so a customer could re-order, and changed the copy to 5 mugs. The next morning the warehouse shipped 5 mugs on the paid order, and the invoice no longer matched the payment. The same week, opening the \"Top orders\" widget made the orders table jump into a new order, and page 2 showed rows that were already on page 1. Nobody touched the orders table code.",
    },

    content: [
        h2("1. The incident: a copy that is not a copy"),
        p("The admin dashboard keeps the loaded orders in one array and renders it as a table. Two features were added last sprint, each a few lines long:"),
        code("javascript", `
// duplicate-order.js - "Duplicate" button on an order row
function duplicateOrder(order) {
    return { ...order, id: nextOrderId(), status: "draft" };
}

// edit form for the draft
function setQty(draft, index, qty) {
    draft.items[index].qty = qty;
}

// top-orders-widget.js
function topOrders(orders, n) {
    return orders.sort((a, b) => orderTotal(b) - orderTotal(a)).slice(0, n);
}`, "admin.js"),
        p("Both functions look harmless: the first \"copies\" the order with spread, the second only \"reads\" the orders to build a report. Both change data that belongs to someone else - the original order and the array the table renders."),

        h2("2. Reproduce it in Node"),
        p("You do not need the dashboard to see it. Save this as `repro.mjs` and run `node repro.mjs`:"),
        code("javascript", `
const orders = [
    { id: "A-1001", customer: "alice", status: "paid", items: [{ sku: "MUG", qty: 2, priceCents: 1250 }] },
    { id: "A-1002", customer: "bob", status: "pending", items: [{ sku: "TEE", qty: 1, priceCents: 2000 }] },
    { id: "A-1003", customer: "alice", status: "paid", items: [{ sku: "BAG", qty: 1, priceCents: 9900 }] },
];

const total = (order) => order.items.reduce((sum, item) => sum + item.qty * item.priceCents, 0);

// 1. Duplicate an order, then edit the copy
const copy = { ...orders[0], id: "A-1004", status: "draft" };
copy.items[0].qty = 5;
console.log(orders[0].items[0].qty);          // 5  <- the paid order changed
console.log(copy.items === orders[0].items);  // true

// 2. Build a "top orders" report
const top = orders.sort((a, b) => total(b) - total(a)).slice(0, 2);
console.log(orders.map((o) => o.id));         // [ 'A-1003', 'A-1001', 'A-1002' ]
console.log(top[0] === orders[0]);            // true`, "repro.mjs"),
        p("Two lines prove the bugs: `copy.items === orders[0].items` is `true`, so both orders share **one** items array; and after `sort`, the original `orders` array is in a new order. Money is kept in integer cents on purpose, so every total is exact."),

        h2("3. Values and references"),
        p("JavaScript has two kinds of values, and assignment treats them differently:"),
        bullets([
            "**Primitives** - numbers, strings, booleans, `null`, `undefined`, bigints, symbols - are immutable. `let b = a` copies the value; nothing you do to `b` can change `a`.",
            "**Objects** - plain objects, arrays, `Map`, `Set`, `Date`, functions - live in one place in memory. A variable holds a **reference** to it. `const b = a` copies the reference, so `a` and `b` are two names for the same object.",
        ]),
        code("javascript", `
const a = { qty: 2 };
const b = a;            // same object, two names
b.qty = 5;
console.log(a.qty);     // 5
console.log(a === b);   // true: === on objects compares references, not contents
console.log({ qty: 5 } === { qty: 5 }); // false: two different objects

const list = [1, 2];
list.push(3);           // allowed: const stops re-assignment, not mutation
// list = [];           // TypeError: Assignment to constant variable.`),
        p("Passing an object to a function also passes the reference. That is why `setQty(draft, ...)` and `topOrders(orders, ...)` can change data that the caller - and the table - still use. A change made through one reference is visible through every other reference, and nothing warns you."),
        image("shallow-vs-deep-copy", {
            alt: "Diagram. Left: after const copy = { ...order }, the order and copy objects both point to the same items array, so setting copy.items[0].qty to 5 also changes the order. Right: after structuredClone(order), each object points to its own items array. Bottom: orders.sort() reorders the original array, orders.toSorted() returns a new one.",
            caption: "Spread makes a new outer object, but nested objects and arrays are still shared. structuredClone copies every level.",
        }),

        h2("4. Shallow copies and deep copies"),
        h3("Spread is shallow"),
        p("`{ ...order }`, `Object.assign({}, order)`, `[...items]`, `items.slice()` and `Array.from(items)` all make a **shallow copy**: a new outer object or array whose properties are the same values as before. For primitives that is a real copy. For nested objects and arrays it copies the reference - which is exactly the duplicate-order bug."),
        p("For an update you can still use spread, as long as you copy **every level you change**:"),
        code("javascript", `
// Change the qty of item 0, without touching the original order
const updated = {
    ...order,                                              // new order object
    items: order.items.map((item, i) =>                    // new items array
        i === 0 ? { ...item, qty: 5 } : item               // new object only for the changed item
    ),
};
// order.items[0].qty is still 2; unchanged items are shared, which is safe while nobody mutates them`),
        h3("structuredClone is deep"),
        p("`structuredClone(value)` is a global in Node 17+ and every modern browser. It copies the whole tree: nested objects and arrays, and also `Date`, `Map`, `Set`, `RegExp`, typed arrays and even circular references."),
        code("javascript", `
const draft = structuredClone(order);
draft.items[0].qty = 5;
console.log(order.items[0].qty);              // 2
console.log(draft.items === order.items);     // false

const withDate = structuredClone({ createdAt: new Date(0), tags: new Set(["gift"]) });
console.log(withDate.createdAt instanceof Date, withDate.tags.has("gift")); // true true`),
        p("It has limits you need to know:"),
        bullets([
            "**Functions cannot be cloned.** `structuredClone({ format() {} })` throws a `DataCloneError`. The same goes for DOM nodes.",
            "**Class instances come back as plain objects.** The data is copied, the prototype is not, so methods such as `order.total()` are gone on the clone.",
            "**It costs time and memory proportional to the size of the data.** Cloning one order is nothing; cloning a 50 MB state tree on every keystroke is a performance bug.",
        ]),
        callout("warning", "JSON.parse(JSON.stringify(x)) is not a deep copy",
            "The old trick silently changes your data: a Date becomes a string, a Map or Set becomes {}, undefined properties disappear and NaN becomes null. Use structuredClone for data, and JSON only when you actually want JSON."),

        h2("5. Transform without mutating"),
        p("The safer habit is not to copy and then change, but to **build new values from old ones**. The array and object methods below never change their input; they return something new."),
        h3("map, filter, reduce, flatMap"),
        code("javascript", `
const paid = orders.filter((o) => o.status === "paid");          // new array, fewer elements
const ids = orders.map((o) => o.id);                              // new array, same length
const allItems = orders.flatMap((o) => o.items);                  // map, then flatten one level
const revenue = paid.reduce((sum, o) => sum + total(o), 0);       // one value from many

// reduce always gets an initial value: [].reduce((a, b) => a + b) throws
// TypeError: Reduce of empty array with no initial value`),
        p("Inside `reduce`, mutating the accumulator is fine **if your function created it** (the `{}` or `0` you pass as the initial value). The rule is about data you were given, not data you own."),
        h3("Object.entries, Object.fromEntries and Object.groupBy"),
        p("Objects have no `map`, but you can turn them into `[key, value]` pairs, transform the array, and turn it back:"),
        code("javascript", `
const pricesCents = { MUG: 1250, TEE: 2000 };
const pricesUsd = Object.fromEntries(
    Object.entries(pricesCents).map(([sku, cents]) => [sku, cents / 100])
);
// { MUG: 12.5, TEE: 20 }

// ES2024: group an array by a key
const byStatus = Object.groupBy(orders, (o) => o.status);
// { paid: [order A-1001, order A-1003], pending: [order A-1002] } - arrays of the SAME order objects

const byCustomer = Map.groupBy(orders, (o) => o.customer);   // same idea, keys can be any value
byCustomer.get("alice").length;                              // 2`),
        p("`Object.groupBy` returns a new object and new arrays, but the orders inside them are the original objects, not copies. Grouping is safe; editing a grouped order still edits the original."),
        h3("toSorted, toReversed, toSpliced, with"),
        p("Some old array methods change the array they are called on: `sort`, `reverse`, `splice`, `push`, `pop`, `shift`, `unshift`, `fill` and `copyWithin`. ES2023 added copying versions of the ones that are hard to avoid:"),
        code("javascript", `
const ranked   = orders.toSorted((a, b) => total(b) - total(a));   // instead of sort
const newest   = orders.toReversed();                               // instead of reverse
const without  = orders.toSpliced(1, 1);                            // instead of splice
const replaced = orders.with(0, { ...orders[0], status: "shipped" }); // instead of orders[0] = ...
const added    = [...orders, newOrder];                             // instead of push
// orders is unchanged after every line`),
        callout("tip", "Is this method going to change my array?",
            "If it returns a new array (map, filter, slice, concat, flatMap, toSorted, toReversed, toSpliced, with), you are safe. If it returns the same array, a removed element, or a new length (sort, reverse, splice, push, pop, shift, unshift, fill), it mutates. sort and reverse are the dangerous ones, because they also return the array and look like they made a new one."),

        h2("6. Build it: a pure order summary"),
        p("The dashboard needs one more report: order ids by status, revenue per customer, and the orders ranked by total. Write it as a **pure function**: same input, same output, and the input is left exactly as it was. The tests take a snapshot of the orders before calling your function and compare it afterwards - an in-place `sort` or a property added to an order fails the test even if the numbers are right."),
        challenge("chal_coding_jsf_121", "Group with Object.groupBy and convert each group to ids with Object.entries + map + Object.fromEntries. For totals and ranking, first filter out cancelled orders and map each one to a new small object { id, customer, total }; then reduce into a new object and rank with toSorted. Break ties with the id when two totals are equal."),

        h2("7. The fix"),
        p("Each bug gets the smallest change that removes the shared state:"),
        code("javascript", `
// duplicate-order.js - the draft owns its own items
function duplicateOrder(order) {
    return { ...structuredClone(order), id: nextOrderId(), status: "draft" };
}

// edit form - return a new draft instead of changing the one on screen
function setQty(draft, index, qty) {
    return {
        ...draft,
        items: draft.items.with(index, { ...draft.items[index], qty }),
    };
}

// top-orders-widget.js - the table's array is never reordered
function topOrders(orders, n) {
    return orders.toSorted((a, b) => orderTotal(b) - orderTotal(a)).slice(0, n);
}`, "admin.js"),
        numbered([
            "**Duplicate** deep-copies the order, so the draft's items are its own. Editing the draft can no longer reach the paid order.",
            "**setQty** returns a new draft. The caller replaces its state with the result (`draft = setQty(draft, 0, 5)`), which is also what UI libraries such as React expect: a new object means \"something changed\".",
            "**topOrders** uses `toSorted`, so the report gets its own array and the table keeps its order and its pagination.",
        ]),
        p("A cheap regression test for the whole class of bug: snapshot the input, call the function, compare."),
        code("javascript", `
import { test } from "node:test";
import assert from "node:assert/strict";

test("topOrders does not reorder its input", () => {
    const orders = structuredClone(fixtureOrders);
    const before = structuredClone(orders);
    topOrders(orders, 2);
    assert.deepEqual(orders, before);
});`, "admin.test.js"),
        callout("info", "Object.freeze in development",
            "Object.freeze(obj) makes writes to obj fail (silently in sloppy mode, with a TypeError in strict mode and ES modules). It is shallow: obj.items.push(x) still works unless you freeze every level. Some teams deep-freeze state in development builds to catch mutations early; lesson 4.2 covers node:test in detail."),

        h2("8. Pitfalls"),
        bullets([
            "**`sort()` without a comparator compares strings.** `[10, 9, 1].sort()` gives `[1, 10, 9]`. Always pass `(a, b) => a - b` for numbers.",
            "**A comparator must return a number, not a boolean.** `(a, b) => a.total > b.total` returns `true` / `false`, which sort reads as 1 / 0 and never as negative, so the result is not reliably sorted. Return `a.total - b.total`.",
            "**`Object.groupBy` returns an object with a `null` prototype.** `result.hasOwnProperty(\"paid\")` throws `TypeError: result.hasOwnProperty is not a function`; use `Object.hasOwn(result, \"paid\")` or `\"paid\" in result`.",
            "**Spread inside `reduce` is quadratic.** `reduce((acc, o) => ({ ...acc, [o.id]: o }), {})` copies the accumulator on every step. Mutate the accumulator you created, or use `Object.fromEntries` / `Map`.",
            "**`structuredClone` drops behaviour.** Functions throw `DataCloneError`; class instances lose their methods. Clone data, not objects with behaviour.",
            "**`const` and `Object.freeze` are not deep immutability.** `const` only stops re-assignment; `freeze` only protects one level.",
            "**Shared is fine until someone writes.** Returning the original nested objects from a pure function is normal and cheap; the bug appears only when some code later mutates them. Pick one rule per codebase: \"never mutate data you did not create\".",
        ]),

        h2("9. Checklist"),
        bullets([
            "Objects and arrays are passed and assigned by reference; `===` on them compares identity, not contents.",
            "Spread, `Object.assign`, `slice` and `Array.from` copy one level only; nested objects are still shared.",
            "Use `structuredClone` for a real deep copy of plain data (including `Date`, `Map`, `Set`); never for functions or class instances, and never `JSON.parse(JSON.stringify(x))` as a cloning tool.",
            "Functions that receive arrays or objects do not mutate them: they return new values built with `map`, `filter`, `reduce`, `flatMap`, `Object.entries` / `Object.fromEntries` and `Object.groupBy`.",
            "Use `toSorted`, `toReversed`, `toSpliced` and `with` instead of `sort`, `reverse`, `splice` and index assignment on shared arrays.",
            "Every `reduce` has an initial value, and every `sort` / `toSorted` has a numeric comparator.",
            "A test for a pure function snapshots its input and asserts it is unchanged after the call.",
        ]),
    ],
});
