// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-tsf-1-2",
    title: "Unions & narrowing: the undefined crash",
    slug: { _type: "slug", current: "typescript-unions-narrowing-undefined-crash" },
    description:
        "The day after courier C-03 left Chợ Sớm, the order tracking page went white for every customer he had been delivering to: \"Cannot read properties of undefined (reading 'name')\". In TypeScript with strict mode the same code does not compile. Learn union types and literal unions, why strictNullChecks makes undefined and null part of the type, how the checker narrows a union through if statements, typeof, in, Array.isArray and early returns, the difference between ?? and || when the value is 0, and why the ! operator only silences the error.",
    estimatedTime: 20,

    scenario: {
        role: "Junior frontend developer at Chợ Sớm, an online grocery in Hà Nội, moving the web shop from JavaScript to TypeScript",
        problem:
            "Courier C-03 left the company on Monday and was removed from the couriers list, but 46 of the orders he had been given that morning still had his id. On Tuesday every one of those customers opened the tracking page and got a blank screen. At 06:30, before the daily assignment run, the same crash hit every order that had no courier yet.",
    },

    content: [
        h2("1. The incident"),
        p("The \"Đơn hàng của bạn\" page shows one line per order: who is bringing it, the courier's phone number, and how many minutes away they are. It is the most visited page of the Chợ Sớm site between 07:00 and 10:00, when customers wait at home for their groceries."),
        p("On Monday evening courier C-03 left the company, and the admin tool removed him from the couriers list. Nobody reassigned the 46 orders he had been given for Tuesday morning. On Tuesday each of those customers opened the tracking page and saw a white screen; the browser console said `TypeError: Cannot read properties of undefined (reading 'name')`. Worse, the same thing had been happening every morning at 06:30, before the assignment run gives orders a courier - the support team had just assumed the site was \"slow early in the morning\"."),

        h2("2. Reproduce it"),
        code("javascript", String.raw`
// tracking.js: the order tracking page, cut down
const couriers = [
  { id: "C-07", name: "Trần Văn Hùng", phone: "0903 112 233" },
  { id: "C-12", name: "Lê Thị Mai", phone: "0912 445 566" },
];

function trackingLine(order) {
  const courier = couriers.find((c) => c.id === order.courierId);
  return ` + "`${order.id}: ${courier.name} (${courier.phone}) arrives in ${order.etaMinutes} min`" + String.raw`;
}

console.log(trackingLine({ id: "CS-24017", courierId: "C-12", etaMinutes: 25 }));
console.log(trackingLine({ id: "CS-24018", courierId: "C-03", etaMinutes: 40 })); // C-03 left on Monday`, "tracking.js"),
        code("text", String.raw`
$ node tracking.js
CS-24017: Lê Thị Mai (0912 445 566) arrives in 25 min
tracking.js:9
  return ` + "`${order.id}: ${courier.name} (${courier.phone}) arrives in ${order.etaMinutes} min`" + String.raw`;
                                 ^

TypeError: Cannot read properties of undefined (reading 'name')
    at trackingLine (tracking.js:9:34)`),
        p("`Array.prototype.find` returns the first matching element - **or `undefined` when nothing matches**. The code was written for the happy path, where every order has a courier who still works here. JavaScript only finds out it was wrong when it tries to read `.name` from `undefined`, in the customer's browser."),
        p("Now the same function in TypeScript. The `Order` type says what the backend really sends: `courierId` is `null` until the assignment run, and `etaMinutes` is `null` until the courier's app reports a first position:"),
        code("typescript", String.raw`
type Courier = { id: string; name: string; phone: string };
type Order = { id: string; courierId: string | null; etaMinutes: number | null };

const couriers: Courier[] = [
  { id: "C-07", name: "Trần Văn Hùng", phone: "0903 112 233" },
  { id: "C-12", name: "Lê Thị Mai", phone: "0912 445 566" },
];

function trackingLine(order: Order): string {
  const courier = couriers.find((c) => c.id === order.courierId);
  return ` + "`${order.id}: ${courier.name} (${courier.phone}) arrives in ${order.etaMinutes} min`" + String.raw`;
}`, "tracking.ts"),
        code("text", String.raw`
$ npx tsc
tracking.ts:11:26 - error TS18048: 'courier' is possibly 'undefined'.
tracking.ts:11:43 - error TS18048: 'courier' is possibly 'undefined'.

Found 2 errors in the same file, starting at: tracking.ts:11`),
        p("The type checker knows what `find` returns - its declaration in the standard library says `T | undefined` - so it refuses to let you read `.name` until you have dealt with the `undefined` case. The crash that took a day to notice in production is a compile error."),

        h2("3. Union types"),
        p("`Courier | undefined` is a **union type**: a value of this type is a `Courier` **or** `undefined`. You write unions with `|`, and you can build them from any types:"),
        code("typescript", String.raw`
let courierId: string | null = null;      // not assigned yet
courierId = "C-12";                       // fine
courierId = 12;                           // error TS2322: Type 'number' is not assignable to type 'string'.

type OrderStatus = "placed" | "packed" | "delivering" | "delivered";   // a union of literal types
let status: OrderStatus = "packed";
status = "shipped";
// error TS2322: Type '"shipped"' is not assignable to type 'OrderStatus'.`),
        bullets([
            "**A union of literal types** is TypeScript's enum: `OrderStatus` accepts exactly four strings, and the editor autocompletes them. A typo like `\"deliverd\"` is a compile error instead of an order stuck forever in an unknown status.",
            "**`T | null` and `T | undefined`** are how TypeScript says \"maybe missing\". Under **`strictNullChecks`** (part of `strict`), `null` and `undefined` are **not** allowed in a `string` or a `Courier`: if a value can be missing, the type must say so, and every reader must handle it. Without strict mode, `find` would return plain `Courier` and the bug would compile.",
        ]),
        p("With a union, you can only use what **every** member has. A `string | number` has `toString()`, but not `toUpperCase()`:"),
        code("text", String.raw`
function show(id: string | number) { return id.toUpperCase(); }

error TS2339: Property 'toUpperCase' does not exist on type 'string | number'.
  Property 'toUpperCase' does not exist on type 'number'.`),
        p("To use what only one member has, you first have to prove which member you hold. That is called **narrowing**."),

        h2("4. Narrowing"),
        p("The type checker follows the control flow of your function - every `if`, `return`, `throw` and `switch` - and gives a variable a **narrower type** on each path, based on the checks you wrote. The type in the comments is what your editor shows when you hover the variable:"),
        code("typescript", String.raw`
function trackingLine(order: Order): string {
  const courier = couriers.find((c) => c.id === order.courierId);
  // courier: Courier | undefined
  if (courier === undefined) {
    // courier: undefined
    return ` + "`${order.id}: courier not found`" + String.raw`;
  }
  // courier: Courier - the only way to get here is courier !== undefined
  return ` + "`${order.id}: ${courier.name} (${courier.phone})`" + String.raw`;
}`),
        image("narrowing-flow", {
            alt: "Diagram titled 'Narrowing: each check removes a member of the union'. At the top, const courier = couriers.find(...) has the type Courier | undefined. A decision diamond tests courier === undefined. On the true path, courier has the type undefined and the function returns 'courier C-03 is not available'; the path ends there. On the false path, after the if, courier has the type Courier and courier.name is allowed, because that code is only reachable when it is a Courier. A box 'Without the check' lists: courier.name gives error TS18048 'courier' is possibly 'undefined'; courier!.name compiles because ! removes undefined from the type, not from the value, and throws the same TypeError at runtime; courier?.name compiles with the type string | undefined and shows 'undefined'. A side panel 'Checks that narrow' lists: x === undefined and x !== null remove exactly that member; if (x) removes null and undefined but also 0, empty string and NaN; typeof x === 'string' for primitives; 'store' in x to tell object types apart by a property; Array.isArray(x) for arrays; x ?? fallback uses the fallback only for null and undefined so 0 stays 0. In red: x || fallback also replaces 0 and empty string, the ETA 0 bug; x! performs no check at all, a promise the checker cannot verify.",
            caption: "The early return is what makes courier a Courier on the next line.",
        }),
        p("The checks the type checker understands:"),
        code("typescript", String.raw`
// === and !== against null or undefined remove exactly that member
function eta(minutes: number | null): string {
  if (minutes === null) return "on the way";
  return ` + "`${minutes} min`" + String.raw`;                  // minutes: number
}

// typeof, for primitive types
function normalise(id: string | number): string {
  if (typeof id === "string") return id.toUpperCase();   // id: string
  return ` + "`CS-${id}`" + String.raw`;                    // id: number
}

// in, to tell object types apart by a property only one of them has
type Pickup = { store: string; readyAt: string };
type Delivery = { address: string; slot: string };
function where(d: Pickup | Delivery): string {
  if ("store" in d) return ` + "`pick up at ${d.store} from ${d.readyAt}`" + String.raw`;   // d: Pickup
  return ` + "`deliver to ${d.address}, ${d.slot}`" + String.raw`;                          // d: Delivery
}

// Array.isArray, for T[] versus anything else
function skus(input: string | string[]): string[] {
  return Array.isArray(input) ? input : input.split(",");
}`),
        bullets([
            "**Early returns keep code flat.** Handle the missing case first and return; the rest of the function then works with the narrow type, without nesting.",
            "**Truthiness narrows too**: `if (courier)` removes `undefined` and `null`. But it also treats `0`, `\"\"` and `NaN` as missing - fine for an object, dangerous for a number or a string (next section).",
            "**Narrowing is per variable.** If you copy `order.etaMinutes` into a local `const eta`, check `eta`, and keep using `eta`. Checking a property and then calling a function before reading it again can lose the narrowing, because the function might have changed the object.",
        ]),
        challenge("chal_quiz_tsf_121", "In the first question, list the values for which || uses its right side. In the second, for each line ask two questions: does tsc accept it, and what happens when find returned undefined?"),

        h2("5. ?. and ?? - and the 0 trap"),
        p("Two operators make the missing case short to write. **Optional chaining** `a?.b` reads `b` if `a` is not `null` or `undefined`, and otherwise stops and gives `undefined`. **Nullish coalescing** `a ?? b` gives `a`, unless `a` is `null` or `undefined`, in which case it gives `b`:"),
        code("typescript", String.raw`
const name = courier?.name ?? "a Chợ Sớm courier";   // string`),
        p("The older `a || b` looks similar but uses `b` whenever `a` is **falsy**: `null`, `undefined`, `false`, `0`, `\"\"` or `NaN`. The tracking page had a second, quieter bug because of it:"),
        code("typescript", String.raw`
const etaMinutes: number | null = 0;    // the courier is at the door
console.log(` + "`${etaMinutes || \"soon\"}`" + String.raw`);   // soon
console.log(` + "`${etaMinutes ?? \"soon\"}`" + String.raw`);   // 0`),
        p("The type checker does not catch this one: `etaMinutes || \"soon\"` is perfectly typed (`number | string`). It is a logic bug that the types make easy to see once you look for it: whenever the type contains `number` or `string`, ask what `0` or `\"\"` should do, and prefer `??` or an explicit `=== null` check."),

        h2("6. The ! operator"),
        p("There is a one-character way to make the compile error go away: the **non-null assertion** `courier!` tells the checker \"trust me, this is not `null` or `undefined`\":"),
        code("typescript", String.raw`
return ` + "`${order.id}: ${courier!.name} (${courier!.phone})`" + String.raw`;   // compiles`),
        p("It compiles, and it crashes with exactly the same `TypeError` as the JavaScript version, because `!` changes the type, not the value - it is erased like every other annotation. Treat `!` as a comment saying \"I checked this somewhere the compiler cannot see\". When you can write the check instead, write the check."),
        callout("warning", "Type assertions are promises, not checks",
            "x!, and the `as` assertions you will meet in lesson 8, never produce runtime code. If the promise is wrong, the program fails exactly as plain JavaScript would - only now the type checker said it was fine. In code review, every ! deserves the question: what happens when it is wrong?"),

        h2("7. The fix"),
        p("The real tracking line has five cases, and the types tell you all of them: `courierId` can be `null`, `find` can return `undefined`, and `etaMinutes` can be `null` or `0`. Writing each check in order gives a function the compiler accepts and the customers can read:"),
        code("typescript", String.raw`
function courierLine(order: Order): string {
  if (order.courierId === null) {
    return ` + "`${order.id}: waiting for a courier`" + String.raw`;
  }
  const courier = couriers.find((c) => c.id === order.courierId);
  if (courier === undefined) {
    // reported to the ops dashboard as well: an order points to a courier who no longer exists
    return ` + "`${order.id}: courier ${order.courierId} is not available`" + String.raw`;
  }
  return ` + "`${order.id}: ${courier.name} (${courier.phone})`" + String.raw`;
}`),
        numbered([
            "**Missing data is part of the type.** `courierId: string | null` documents the morning before the assignment run; `find`'s `Courier | undefined` documents couriers who left.",
            "**Each case is handled where it appears**, with an early return, so the code that reads `courier.name` can only run when there is a courier.",
            "**No `!` and no `||`.** The checks are explicit, so `0` and `\"\"` keep their meaning.",
            "**The test that should have existed** includes an order without a courier and an order whose courier is not in the list - the two shapes the types already listed.",
        ]),

        h2("8. Your turn"),
        p("The challenge has the full tracking line, with the ETA as well. Under `--strict` the starter does not compile: the error message is the bug report."),
        challenge("chal_fix_tsf_122", "Handle the cases in the order the comment lists them, each with an early return. Check courierId === null before calling find, then courier === undefined after it. For the ETA, compare with null and with 0 explicitly - !order.etaMinutes treats 0 as missing."),

        h2("9. Pitfalls"),
        bullets([
            "**Forgetting that `find`, `Map.get`, `at()` and friends can return `undefined`**: strict mode reminds you; without it the bug compiles.",
            "**Silencing the error with `!`**: it compiles and crashes exactly like the JavaScript version.",
            "**`||` with numbers and strings**: `0 || x` and `\"\" || x` are `x`. Use `??` or compare with `null` / `undefined`.",
            "**`?.` without a fallback**: `courier?.name` is `string | undefined`, and a template string prints it as `\"undefined\"`.",
            "**`!== null` when the value can be `undefined`** (or the other way round): each comparison removes only the member it names. `x != null` (loose) removes both, but say what you mean.",
            "**Turning off `strictNullChecks`** to make a migration \"easier\": it hides exactly this class of bug.",
        ]),

        h2("10. Checklist"),
        bullets([
            "Every value that can be missing has `| null` or `| undefined` in its type - and the backend contract says which one.",
            "Results of `find`, `Map.get` and similar lookups are checked before use.",
            "Missing cases are handled with early returns, so the main path works with narrow types.",
            "`??` is used for defaults; `||` only for real booleans.",
            "`!` appears only with a comment that says why the value cannot be missing.",
            "Tests include the missing cases the types describe.",
        ]),
        p("Next lesson: object types and interfaces. Two hundred delivery labels were printed with \"undefined\" where the apartment number should be, because of one misspelled property name."),
    ],
});
