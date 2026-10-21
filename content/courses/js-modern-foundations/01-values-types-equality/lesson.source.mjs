// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-jsf-1-1",
    title: "Values, types & equality traps",
    slug: { _type: "slug", current: "values-types-equality-traps" },
    description:
        "A checkout shows \"Total: $0.30000000000000004\", another shows \"Total: $NaN\", and mobile customers pay for items they removed. Learn how JavaScript values and types really behave - primitives vs objects, typeof, == vs ===, NaN, floating-point money and truthy/falsy - and total a cart exactly in integer cents.",
    estimatedTime: 20,

    scenario: {
        role: "Junior full-stack developer, online bookstore",
        problem:
            "The Friday release added a coupon field and a mobile app checkout. By Monday, support has three kinds of tickets: a receipt that reads \"Total: $0.30000000000000004\" for two $0.10 and $0.20 bookmarks, 37 orders saved with a total of NaN after customers pasted coupon codes like \"10%\", and 214 mobile orders that charged for books the customer had set to quantity 0. The web checkout uses exactly the same cart code and never charges for removed books.",
    },

    content: [
        h2("1. The incident: one cart function, three bugs"),
        p("This is the cart code that shipped. It looks reasonable, it passed a quick manual test, and every line of it is valid JavaScript:"),
        code("javascript", `
// checkout.js
function cartTotal(lines) {
    let total = 0;
    for (const line of lines) {
        const qty = line.qty || 1;                  // "default to one item"
        total += parseFloat(line.price) * qty;
    }
    return total;
}

function applyCoupon(total, discount) {
    if (discount == 0) return total;               // no coupon
    if (discount > total) throw new Error("Coupon is larger than the total");
    return total - discount;
}

const total = applyCoupon(cartTotal(cart.lines), couponField.value);
summaryEl.textContent = \`Total: $\${total}\`;`, "checkout.js"),
        p("Nothing here throws, and nothing here is random. Each bug comes from a precise rule about JavaScript values: how numbers are stored, how `==` converts its operands, which values count as \"false\", and what `NaN` does to every comparison. Before reading on, predict what two of those lines do."),
        challenge("chal_quiz_jsf_111"),

        h2("2. Reproduce it in 30 seconds"),
        p("You do not need the shop to reproduce these bugs. Open a terminal, run `node` (Node 24), and type the values the code saw in production:"),
        code("javascript", `
> 0.1 + 0.2
0.30000000000000004

> "0" || 1          // web form: quantities are strings
'0'
> 0 || 1            // mobile app: quantities are JSON numbers
1

> const discount = "10%";
> discount == 0     // "10%" -> Number("10%") -> NaN, and NaN == 0 is false
false
> discount > 31.5   // NaN again: every comparison with NaN is false
false
> 31.5 - discount
NaN`, "node REPL"),
        p("Three different mechanisms, one lesson: **a value carries a type, and JavaScript quietly converts between types when you mix them**. To write checkout code that works the first time, you need to know which conversions happen, and where to stop them."),

        h2("3. Primitive values and object values"),
        p("Every JavaScript value is either a **primitive** or an **object**. There are exactly seven primitive types: `string`, `number`, `bigint`, `boolean`, `undefined`, `null` and `symbol`. Everything else - plain objects, arrays, functions, dates, maps - is an object."),
        bullets([
            "**Primitives are immutable and compared by value.** `\"abc\" === \"abc\"` is true. String methods such as `toUpperCase()` return a new string; they never change the old one.",
            "**Objects are compared by identity.** A variable holds a reference to the object, not a copy. Two objects with the same contents are still two different objects.",
        ]),
        code("javascript", `
let label = "Total";
let copy = label;
copy += ":";
console.log(label);                 // "Total" - primitives are copied by value

const cartA = { total: 30 };
const cartB = cartA;                // same object, second name
cartB.total = 0;
console.log(cartA.total);           // 0

console.log({ id: 1 } === { id: 1 });        // false - two different objects
console.log([1, 2] === [1, 2]);              // false
console.log(cartA === cartB);                // true  - same reference`, "values.js"),
        callout("info", "const does not freeze an object",
            "const means the variable cannot be re-assigned. The object it points to can still be changed. Lesson 1.2 shows how to copy objects safely with spread and structuredClone."),

        h3("typeof, and its one famous lie"),
        p("`typeof` returns a string naming the type of a value. It is the right tool for primitives, with one exception you must memorise:"),
        code("javascript", `
typeof "19.99"        // "string"
typeof 19.99          // "number"
typeof NaN            // "number"   - NaN is a number value: "not a valid number"
typeof 10n            // "bigint"
typeof true           // "boolean"
typeof undefined      // "undefined"
typeof Symbol("id")   // "symbol"
typeof null           // "object"   - a bug from 1995, kept for compatibility
typeof [1, 2]         // "object"   - use Array.isArray(value)
typeof (() => {})     // "function"`, "typeof.js"),
        bullets([
            "Check for null with `value === null`, never with `typeof`.",
            "Check for an array with `Array.isArray(value)`.",
            "Check for \"some object\" with `value !== null && typeof value === \"object\"`.",
        ]),

        h2("4. == vs === and type coercion"),
        p("`===` (strict equality) compares type and value, and never converts anything: values of different types are simply not equal. `==` (loose equality) first tries to convert both sides to the same type, following rules that are easy to misremember:"),
        numbered([
            "If both sides have the same type, compare them like `===`.",
            "`null` and `undefined` are equal to each other, and to nothing else.",
            "A boolean is converted to a number first (`true` -> 1, `false` -> 0).",
            "When a string meets a number, the string is converted with `Number(...)`.",
            "An object is converted to a primitive (arrays become strings: `[]` -> `\"\"`), then the rules start again.",
        ]),
        code("javascript", `
0 == ""              // true   ("" -> 0)
0 == "0"             // true   ("0" -> 0)
"" == "0"            // false  (both strings: compared as text)
false == "0"         // true   (false -> 0, "0" -> 0)
[] == false          // true   ([] -> "" -> 0, false -> 0)
null == 0            // false  (null only equals undefined)
null == undefined    // true
"10%" == 0           // false  ("10%" -> NaN)

0 === ""             // false - different types, no conversion
0 === "0"            // false`, "equality.js"),
        p("Notice that `==` is not even transitive: `0 == \"\"` and `0 == \"0\"` are both true, but `\"\" == \"0\"` is false. That is why the coupon check `discount == 0` treated an empty field as \"no coupon\" but let `\"10%\"` through. The fix is not a cleverer comparison; it is to **convert and validate the input once, explicitly**, and then compare numbers with `===`."),
        callout("tip", "One accepted use of ==",
            "value == null is true for exactly null and undefined, and some style guides allow it as a short \"is it missing?\" check. Everywhere else, use === and !==. Linters enforce this with the eqeqeq rule."),

        h2("5. NaN: the value that is not equal to itself"),
        p("`NaN` (\"not a number\") is what you get when a numeric operation has no meaningful result: `Number(\"abc\")`, `parseFloat(\"\")`, `0 / 0`, `undefined + 1`, `31.5 - \"10%\"`. It has two properties that make it dangerous:"),
        bullets([
            "**It spreads.** Any arithmetic with `NaN` gives `NaN`, so one bad field turns the whole total into `NaN`.",
            "**Every comparison with it is false.** `NaN == 0`, `NaN > 10`, `NaN < 10` and even `NaN === NaN` are all false. Guards like `if (discount > total)` silently pass.",
        ]),
        p("So you can never detect NaN with `===`. Use the functions made for it, and know the one to avoid:"),
        code("javascript", `
const x = Number("abc");     // NaN

x === NaN                    // false - always, even when x is NaN
Number.isNaN(x)              // true  - checks for the NaN value, no conversion
Object.is(x, NaN)            // true  - SameValue comparison

isNaN("abc")                 // true  - the old global converts first...
isNaN("")                    // false - ...and "" converts to 0
Number.isNaN("abc")          // false - a string is not the NaN value

Number.isFinite(31.5)        // true
Number.isFinite(NaN)         // false - also false for Infinity and for "31.5"
Number.isInteger(2)          // true
Number.isInteger("2")        // false - no conversion

Object.is(0, -0)             // false - the only other place Object.is differs from ===
[NaN].includes(NaN)          // true  - includes uses SameValueZero
[NaN].indexOf(NaN)           // -1    - indexOf uses ===`, "nan.js"),
        callout("warning", "Validate, don't hope",
            "For input that must be a number, Number.isFinite or Number.isInteger is a better guard than any NaN check: it rejects NaN, Infinity and values that are still strings, in one call."),

        h2("6. Why 0.1 + 0.2 is not 0.3, and how to store money"),
        p("A JavaScript `number` is a 64-bit binary floating-point value (IEEE 754 double). Binary fractions can represent 1/2, 1/4 or 3/8 exactly, but not 1/10 - just as decimal cannot write 1/3 exactly. `0.1` is stored as the nearest double, which is very slightly more than 0.1. Adding two approximations gives a third approximation, and when it is printed, JavaScript shows the shortest decimal that identifies that exact double: `0.30000000000000004`."),
        image("money-float-vs-cents", {
            alt: "Diagram comparing two ways to total $0.10 and $0.20. On the left, floats: 0.1 and 0.2 are stored as approximations and their sum prints as 0.30000000000000004. On the right, the strings are converted to 10 and 20 cents and added exactly to 30, then formatted as $0.30. A bottom row shows the rule: parse at the edge, compute in integers, format at the edge.",
            caption: "Whole numbers up to Number.MAX_SAFE_INTEGER (2^53 - 1) are exact, so integer cents never drift.",
        }),
        p("Rounding at the end hides the problem for one sum but not for every program: `19.99 * 100` is `1998.9999999999998`, and comparisons such as `paid === total` fail on values that print the same. The industry standard is simple:"),
        bullets([
            "**Store and compute money as integers in the smallest unit** (cents for USD, the whole amount for currencies without minor units such as JPY or VND). Databases store `integer`/`bigint` cents or an exact `numeric` type, never a float.",
            "**Convert text to cents without going through a float.** Validate the string, then build the integer from its dollars and cents parts.",
            "**Format only for display**, with `Intl.NumberFormat`, and never parse a displayed string back into a number.",
        ]),
        code("javascript", `
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

usd.format(30 / 100);        // "$0.30"
usd.format(129921 / 100);    // "$1,299.21"

Number.MAX_SAFE_INTEGER;     // 9007199254740991 cents - about 90 trillion dollars
// Beyond that, use BigInt: 9007199254740993n is exact.`, "format.js"),

        h2("7. Truthy, falsy and the default that charged customers"),
        p("Wherever JavaScript needs a boolean - `if`, `while`, `!`, `&&`, `||`, the ternary - it converts the value. Exactly eight values are **falsy**:"),
        code("javascript", `
false   0   -0   0n   ""   null   undefined   NaN`),
        p("Every other value is **truthy**, including some that look empty or false to a human:"),
        code("javascript", `
Boolean("0")         // true  - a non-empty string
Boolean("false")     // true
Boolean(" ")         // true
Boolean([])          // true  - every object is truthy, even an empty array
Boolean({})          // true`, "truthy.js"),
        p("Now the mobile bug is clear. `line.qty || 1` returns `1` whenever `line.qty` is falsy. From the web form, a removed item has quantity `\"0\"` - truthy - so it stays `\"0\"` and the multiplication converts it to 0. From the mobile app it is the number `0` - falsy - so it becomes `1`. Same code, different type, different bill."),
        bullets([
            "`a || b` returns `b` when `a` is **any** falsy value: `0`, `\"\"` and `NaN` included.",
            "`a ?? b` (nullish coalescing) returns `b` only when `a` is `null` or `undefined`. `0 ?? 1` is `0`. Use `??` for defaults when 0 or \"\" are legitimate values.",
            "`if (items.length)` is fine because a length is always a number; `if (value)` on user input is almost never what you mean - say what you check: `value !== \"\"`, `Number.isInteger(qty)`, `user !== null`.",
        ]),
        callout("info", "A default is not validation",
            "Switching to line.qty ?? 1 stops 0 from becoming 1, but \"abc\" and \"1.5\" still get through. A quantity that arrives from outside your code must be parsed and checked once, at the boundary, and rejected if it is not a whole number."),

        h2("8. The fix: parse at the edge, compute in cents"),
        p("The rewrite moves all conversion to one place. Every price and quantity is validated and converted to an integer when it enters the checkout, the arithmetic only ever sees integers, and the total is formatted once for the screen. Invalid input is rejected with an error the UI can show, instead of turning into `NaN` or a wrong charge:"),
        code("javascript", `
// checkout.js - after the fix
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function applyCoupon(totalCents, discountCents) {
    // NaN, Infinity, "10%" and 12.5 all fail this one check.
    if (!Number.isSafeInteger(discountCents) || discountCents < 0) {
        throw new RangeError(\`Invalid discount: \${JSON.stringify(discountCents)}\`);
    }
    return Math.max(0, totalCents - discountCents);
}

const { cents } = checkoutTotal(cart.lines);           // your exercise below
const payable = applyCoupon(cents, parseCoupon(couponField.value)); // coupon text -> cents (0 when empty)
summaryEl.textContent = \`Total: \${usd.format(payable / 100)}\`;`, "checkout.js"),
        p("The heart of the fix is `checkoutTotal`: it turns price strings such as `\"19.99\"` into integer cents without a float, accepts only whole, non-negative quantities (where 0 means zero, not one), and refuses the whole cart if any line is bad - a cart with one unreadable line must never be charged. Write it:"),
        code("javascript", `
function checkoutTotal(lines) {
    let cents = 0;
    for (const { price, qty } of lines) {
        // 1. price: a string like "19.99" -> 1999 (validate first, then dollars * 100 + cents)
        // 2. qty: "2" or 2 -> 2; "0" or 0 -> 0; anything else -> throw
        // 3. cents += priceCents * quantity
    }
    return { cents, display: "..." };    // format once, at the end
}`),
        challenge("chal_coding_jsf_112", "Validate the price string with a regular expression such as /^(\\d+)(?:\\.(\\d{1,2}))?$/ before converting it, and build the cents from the two captured groups (pad a one-digit fraction: \"4.5\" is 450 cents). For quantities, accept a string only if it is all digits, then let Number.isInteger and a >= 0 check decide. Format with Intl.NumberFormat once, at the end."),

        h2("9. Pitfalls to recognise in code review"),
        bullets([
            "`parseFloat` and `parseInt` **stop at the first bad character.** `parseFloat(\"19.99abc\")` is `19.99` and `parseInt(\"12px\")` is `12`. They are for reading numbers out of text, not for validating input.",
            "`Number()` **is strict, but has its own surprises.** `Number(\"\")` and `Number(\" \")` are `0`, `Number(\"1e3\")` is `1000`, `Number(\"0x10\")` is `16`. Validate the format first if those are not valid amounts in your domain.",
            "`+` **concatenates when either side is a string.** `\"19.99\" + 5` is `\"19.995\"`, while `\"19.99\" - 5` is the number `14.989999999999998`. Convert (to cents) before you add.",
            "`toFixed` **is for display only.** It returns a string and rounds a value that is already approximate: `(1.005).toFixed(2)` is `\"1.00\"`, because 1.005 is stored as 1.00499999999999989...",
            "**Comparing objects compares identity.** Two carts with the same lines are not `===`; compare the fields you care about.",
        ]),

        h2("10. Checklist"),
        bullets([
            "Every comparison uses `===` / `!==` (the only tolerated exception is `value == null`).",
            "No code checks for NaN with `===` or `==`; it uses `Number.isNaN`, or better, validates with `Number.isFinite` / `Number.isInteger`.",
            "`typeof` is never used to detect `null` or arrays; `value === null` and `Array.isArray` are.",
            "Money is stored, added and compared as integer cents; text is converted to cents without going through a float.",
            "Amounts are formatted with `Intl.NumberFormat` only for display, and displayed strings are never parsed back.",
            "Input from forms, URLs and JSON is parsed and validated once, at the boundary; invalid input is rejected, not defaulted.",
            "Defaults use `??` when 0 or \"\" are legitimate values; `||` is used only when every falsy value should be replaced.",
        ]),
    ],
});
