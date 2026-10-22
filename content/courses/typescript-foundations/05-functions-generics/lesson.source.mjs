// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-tsf-2-2",
    title: "Functions & generics",
    slug: { _type: "slug", current: "typescript-functions-generics" },
    description:
        "The Monday report told the founders of Chợ Sớm that last week's revenue was NaN đ. A reporting helper typed with any had accepted a misspelled property name, and nothing complained until the email went out. Learn how TypeScript types functions - parameters, optional and default values, rest parameters, return types, callbacks and function types - why any switches the checker off for everything it touches, and how generic functions keep the caller's type: type parameters, inference at the call site, constraints with extends and keyof, and the generic types you already use every day.",
    estimatedTime: 20,

    scenario: {
        role: "Junior frontend developer at Chợ Sớm, an online grocery in Hà Nội, moving the web shop from JavaScript to TypeScript",
        problem:
            "A refactoring renamed the total field of an order in one place, and a typo crept into the call that sums the week's paid orders. The report job ran on Monday at 08:00 and emailed \"Doanh thu tuần: NaN đ\" to the founders and to the investor who had asked for weekly numbers. The helper had been converted to TypeScript a month earlier - with any.",
    },

    content: [
        h2("1. The incident"),
        p("Every Monday at 08:00 a small job builds the Chợ Sớm weekly report - orders by status, revenue, the biggest basket, review stars - and emails it to the two founders. Since March it also goes to an investor, who asked for weekly numbers before the next funding round."),
        p("This Monday the first line said **Doanh thu tuần: NaN đ**. The founders called the team at 08:05. The cause was one typo, `\"totl\"`, in a call to a helper that sums a property over a list. The helper file had been \"converted to TypeScript\" a month earlier: its parameters were typed `any[]` and `string`, which the checker accepts without question."),

        h2("2. Reproduce it"),
        code("javascript", String.raw`
// report.js: the Monday revenue report
function sumBy(items, key) {
  return items.reduce((sum, item) => sum + item[key], 0);
}

const orders = [
  { id: "CS-24101", status: "paid", total: 245000 },
  { id: "CS-24102", status: "paid", total: 185000 },
  { id: "CS-24103", status: "cancelled", total: 90000 },
];
const paid = orders.filter((o) => o.status === "paid");
console.log("revenue this week:", sumBy(paid, "totl"), "đ");`, "report.js"),
        code("text", String.raw`
$ node report.js
revenue this week: NaN đ`),
        p("`item[\"totl\"]` is `undefined`, `0 + undefined` is `NaN`, and `NaN` plus anything stays `NaN`. The TypeScript version that ran in production was the same code with annotations that promise nothing:"),
        code("typescript", String.raw`
function sumBy(items: any[], key: string): number {
  return items.reduce((sum, item) => sum + item[key], 0);
}

sumBy(paid, "totl");   // compiles: any[] accepts the orders, string accepts "totl"`),

        h2("3. Typing functions"),
        p("You met parameter and return annotations in lesson 1. Functions have a few more shapes worth typing precisely:"),
        code("typescript", String.raw`
// optional and default parameters, and a rest parameter
function fee(weightKg: number, express = false, ...extras: number[]): number {
  const base = weightKg <= 3 ? 15000 : 15000 + (weightKg - 3) * 5000;
  return (express ? base * 2 : base) + extras.reduce((a, b) => a + b, 0);
}
fee(2);                     // express defaults to false
fee(2, true, 5000, 3000);   // extras: [5000, 3000]
fee();
// error TS2555: Expected at least 1 arguments, but got 0.

// a function that returns nothing useful returns void
function log(message: string): void {
  console.log(message);
}

// a function type, for callbacks and variables that hold functions
type Scorer<T> = (item: T) => number;
const byTotal: Scorer<Order> = (o) => o.total;   // o is an Order: typed from the declaration`),
        bullets([
            "**A default value** makes the parameter optional and gives it the default's type (`express` is `boolean`). Write `weightKg?: number` for an optional parameter without a default; inside the function it is `number | undefined`.",
            "**A rest parameter** collects the remaining arguments into an array: `...extras: number[]`.",
            "**`void`** means \"the caller should not use the return value\" - typical for event handlers and loggers.",
            "**Function types** `(item: T) => number` describe callbacks. When you pass an arrow function where a function type is expected, its parameters are typed from that type (contextual typing) - which is why you almost never annotate callback parameters.",
        ]),

        h2("4. any switches the checker off"),
        p("`any` is not \"some type\": it means **do not check**. A value of type `any` can be assigned to every type, every property can be read from it, every function can be called with it - and everything computed from it is `any` too:"),
        code("typescript", String.raw`
function sumBy(items: any[], key: string): number {
  return items.reduce((sum, item) => sum + item[key], 0);
  //                   ^ item: any, item[key]: any, sum + item[key]: any
}`),
        p("That is how `any` spreads: one `any` parameter makes every expression that touches it unchecked, and the `: number` return annotation is a promise nobody verifies - `NaN` is a number anyway. The helper accepted orders, but it would have accepted reviews, strings or `null` just as happily. The fix is not to write a separate `sumOrderTotals` for every type, but to let the function **keep** the type of what it receives."),
        image("any-vs-generic", {
            alt: "Diagram titled 'any forgets the type. A type parameter carries it through the call.' Left panel, With any: function sumBy(items: any[], key: string): number is called as sumBy(orders, \"totl\"). items: any[] means Order is forgotten at the parameter; key: string accepts every string. It compiles, and computes 0 + undefined + undefined = NaN, so the founders receive 'revenue this week: NaN đ'. And any spreads: item[key] is any, the sum is any, anything computed from it is unchecked too. Right panel, With a type parameter: function sumBy<T>(items: readonly T[], value: (item: T) => number): number is called as sumBy(orders, (o) => o.totl). orders is Order[], so T = Order is inferred, so the callback's o is an Order, which gives error TS2551: Property 'totl' does not exist on type 'Order'. Did you mean 'total'? The same function called as sumBy(reviews, (r) => r.stars) gets T = Review: one implementation, checked separately at every call; the type goes in with the argument and comes out typed.",
            caption: "T is filled in at every call, from the arguments.",
        }),

        h2("5. Generic functions"),
        p("A **generic function** has a **type parameter**, written in angle brackets before the parameter list. `T` is a placeholder for \"whatever type the caller uses\", and you can use it in the parameters and the return type:"),
        code("typescript", String.raw`
function first<T>(items: readonly T[]): T | undefined {
  return items[0];
}

const o = first(orders);            // T = Order   ->  o: Order | undefined
const n = first([15000, 12000]);    // T = number  ->  n: number | undefined
const s = first<string>([]);        // T written explicitly: s: string | undefined`),
        bullets([
            "**You rarely write `T` at the call.** TypeScript **infers** it from the arguments: `orders` is `Order[]`, so `T` is `Order`. Write it explicitly only when there is nothing to infer from, like an empty array.",
            "**The type flows through.** What goes in as `Order[]` comes out as `Order | undefined`, so the caller keeps every check on the result - unlike `any`, which would hand back `any`.",
            "**The name `T` is a convention**, like `i` in a loop. Use descriptive names when there are several: `<Item, Key>`.",
        ]),
        p("Now the report helper. Instead of a property name, it takes a callback that reads the value. The callback's parameter is typed `T`, so the property access happens where the type checker can see it:"),
        code("typescript", String.raw`
function sumBy<T>(items: readonly T[], value: (item: T) => number): number {
  return items.reduce((total, item) => total + value(item), 0);
}

sumBy(paid, (o) => o.total);        // 430000
sumBy(paid, (o) => o.totl);
// error TS2551: Property 'totl' does not exist on type 'Order'. Did you mean 'total'?
sumBy(reviews, (r) => r.stars);     // the same function, T = Review`),
        p("The callback is also more flexible than a property name: `sumBy(lines, (l) => l.price * l.qty)` sums a computed value, which a string key never could."),

        h2("6. Constraints and keyof"),
        p("Sometimes a generic function needs to know **something** about `T`. A **constraint**, `T extends ...`, says what every `T` must have - and lets you use it inside the function:"),
        code("typescript", String.raw`
// any T, as long as it has an id: string
function indexById<T extends { id: string }>(items: readonly T[]): Map<string, T> {
  return new Map(items.map((item) => [item.id, item]));
}

indexById(orders);     // Map<string, Order>
indexById([1, 2]);
// error TS2322: Type 'number' is not assignable to type '{ id: string; }'.`),
        p("`keyof T` is the union of `T`'s property names - for `Order`, `\"id\" | \"status\" | \"total\"`. With it you can write the string-key version of a helper safely, and `T[K]` is the type of that property:"),
        code("typescript", String.raw`
function pluck<T, K extends keyof T>(items: readonly T[], key: K): T[K][] {
  return items.map((item) => item[key]);
}

const statuses = pluck(orders, "status");   // OrderStatus[]
pluck(orders, "totl");
// error TS2345: Argument of type '"totl"' is not assignable to parameter of type 'keyof Order'.`),
        callout("tip", "Generics you already use",
            "Array<T>, ReadonlyArray<T>, Map<K, V>, Set<T>, Promise<T> and Record<K, V> are generic types from the standard library, and find, map, filter and reduce are generic methods: that is how find on an Order[] knows to return Order | undefined. ES2024 added Map.groupBy(items, (item) => key), a generic that returns Map<Key, Item[]> - try it on the orders, grouped by status."),

        h2("7. The fix"),
        p("The reporting module now has a handful of generic helpers. None of them mentions `Order` or `Review`, and none of them accepts a property name as a plain string:"),
        code("typescript", String.raw`
export function sumBy<T>(items: readonly T[], value: (item: T) => number): number {
  return items.reduce((total, item) => total + value(item), 0);
}

export function pluck<T, K extends keyof T>(items: readonly T[], key: K): T[K][] {
  return items.map((item) => item[key]);
}

// in the report job
const paid = orders.filter((o) => o.status === "paid");
const revenue = sumBy(paid, (o) => o.total);`, "report.ts"),
        numbered([
            "**No `any`.** The helpers are generic, so the type of every argument reaches every callback, and every typo is a compile error.",
            "**Callbacks instead of property names**, or `keyof T` when a property name is really needed.",
            "**`readonly T[]` parameters**: the helpers read lists, they never change them (lesson 4).",
            "**A lint rule** (`@typescript-eslint/no-explicit-any`) now flags new `any` in pull requests, so \"converting\" a file to TypeScript means typing it.",
        ]),

        h2("8. Your turn"),
        p("The report needs two more helpers, and they must work for orders and for product reviews alike. `countBy` has its signature; `maxBy` and `sumBy` do not exist yet, so the test runner does not compile until you write them."),
        challenge("chal_coding_tsf_221", "Write maxBy and sumBy with the same shape as countBy: function name<T>(items: readonly T[], callback: (item: T) => ...): .... For countBy, a Map keeps keys in insertion order, and counts.get(k) ?? 0 handles a new key. For maxBy, start with an undefined best and replace it only when the score is strictly higher, so the first of several equal items wins; reduce without an initial value throws on an empty list."),

        h2("9. Pitfalls"),
        bullets([
            "**`any` in a signature**: it turns off checking for the arguments and for everything computed from them. Use a generic or `unknown` (lesson 8).",
            "**String property names**: `\"totl\"` is a fine `string`. Use a callback, or `K extends keyof T`.",
            "**Return annotations do not check `any`**: `return anyValue` satisfies `: number`.",
            "**Generics that do not connect anything**: `function log<T>(x: T): void` gains nothing over `(x: unknown)`. A type parameter is useful when it links an input to an output or two inputs to each other.",
            "**Writing the type argument when it can be inferred**: `first<Order>(orders)` is noise - and can hide a mismatch inference would have shown.",
            "**`reduce` without an initial value** throws `TypeError: Reduce of empty array with no initial value` on an empty array; its type does not warn you.",
        ]),

        h2("10. Checklist"),
        bullets([
            "No `any` in function signatures; a lint rule enforces it.",
            "Helpers that work on many types are generic, and their type parameters connect inputs to outputs.",
            "Property access happens in typed callbacks or through `keyof T`, never through free strings.",
            "Callback parameters are typed from context, not annotated by hand.",
            "Empty inputs have a defined result (`0`, `undefined`, an empty map) and a test.",
        ]),
        p("Next lesson: discriminated unions and exhaustive switches. A new payment method went live, and every receipt paid with it said the total was NaN đ."),
    ],
});
