// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-tsf-1-1",
    title: "Annotations, inference & strict mode",
    slug: { _type: "slug", current: "typescript-annotations-inference-strict-mode" },
    description:
        "On Saturday morning the Chợ Sớm checkout showed a total of 15.500.030.000 đ for a basket of morning glory and pork belly, and the payment gateway refused 37 orders before anyone noticed. The cause was one string from a form that JavaScript happily added to a number. Learn what TypeScript is (a type checker that runs before your code, then disappears), how to annotate variables, parameters and return types, what inference gives you for free, what strict mode turns on and why every project should use it, and why values from forms must be converted and checked once, at the edge.",
    estimatedTime: 20,

    scenario: {
        role: "Junior frontend developer at Chợ Sớm, an online grocery in Hà Nội, moving the web shop from JavaScript to TypeScript",
        problem:
            "A change to the checkout let shoppers choose a delivery slot, and the shipping fee now comes from a <select> element. On Saturday between 07:00 and 08:10 the checkout showed totals in the billions of đồng and the payment gateway rejected every order that had a shipping fee. 37 shoppers gave up. Nothing crashed and no test failed.",
    },

    content: [
        h2("1. The incident"),
        p("Chợ Sớm delivers fresh groceries in Hà Nội before 10 in the morning, and Saturday 07:00 is its busiest hour. On Friday evening a small change went live: shoppers can now choose a delivery slot, and each slot has its own shipping fee - 30.000 đ for 'before 8', 15.000 đ for 'before 10'. The fee comes from a `<select>` element on the checkout page."),
        p("At 07:12 the support chat filled up. Bùi Lan Anh had put two bunches of rau muống and a piece of thịt ba chỉ in her basket - 155.000 đ - and the checkout said she owed **15.500.030.000 đ**. The VNPay page refused the payment as over the limit. By 08:10, when the change was rolled back, 37 baskets had been abandoned. There was no exception in the logs and every unit test was green: the tests called the total function with numbers."),

        h2("2. Reproduce it"),
        p("The checkout logic, cut down to the lines that matter. `form` stands for the values the browser gives you: every `<select>` and `<input>` value is a string, even when it looks like a number."),
        code("javascript", String.raw`
// checkout.js: the Saturday version
const form = { shipping: "30000", voucher: "" }; // <select> and <input> values are always strings

const cart = [
  { sku: "VEG-101", name: "Rau muống", price: 15000, qty: 2 },
  { sku: "MEA-204", name: "Thịt ba chỉ", price: 125000, qty: 1 },
];

function subtotal(lines) {
  return lines.reduce((sum, line) => sum + line.price * line.qty, 0);
}

function orderTotal(subtotal, shipping) {
  return subtotal + shipping;
}

const total = orderTotal(subtotal(cart), form.shipping);
console.log("total:", total);
console.log("VNPay amount:", total * 100);`, "checkout.js"),
        code("text", String.raw`
$ node checkout.js
total: 15500030000
VNPay amount: 1550003000000`),
        p("`155000 + \"30000\"` is not an error in JavaScript: when one side of `+` is a string, `+` joins strings, so the result is `\"15500030000\"`. Then `total * 100` turns that string back into a number - 1.550.003.000.000, because VNPay wants the amount times 100. Every step is legal JavaScript, so nothing throws. The bug is a **type** bug: `orderTotal` was written for two numbers and got a number and a string. This course is about catching that kind of bug while you type, not at 07:12 on a Saturday."),

        h2("3. What TypeScript is"),
        p("TypeScript is JavaScript plus **type annotations**: you write which kind of value a variable, a parameter or a return value holds, and a program called the **type checker** (`tsc`) reads your whole project and reports every place where the code does not respect them. Three facts shape everything else in this course:"),
        bullets([
            "**Types are checked before the code runs.** `tsc` reads `.ts` files, reports errors, and writes plain `.js` files. In a project it runs in your editor (the red squiggles), in a pre-commit hook and in CI.",
            "**Types are erased.** The `.js` output is your code with the annotations removed. At runtime there is no `number` or `string` check that TypeScript added: a form field is still a string.",
            "**Running is not checking.** Node 24 can run `node checkout.ts` directly: it strips the types and runs the rest, without checking anything. Bundlers such as Vite and esbuild do the same. Only `tsc` (or your editor, which uses the same checker) finds type errors.",
        ]),
        image("types-erased", {
            alt: "Diagram titled 'Types are checked before the code runs, then erased'. On the left, a file checkout.ts declares orderTotal(subtotal: number, shipping: number): number and calls orderTotal(155000, \"30000\"). Path one goes to tsc --strict, which reads every annotation and checks every call; one arrow leads to a red box 'error TS2345, nothing is emitted: Argument of type string is not assignable to parameter of type number', the other to a green box 'no errors: checkout.js', the same code with the annotations removed. Path two goes from checkout.ts down to 'node checkout.ts': Node 24 strips the types and runs, never checking them, and leads to a red box 'runtime: the Saturday bug ships' with total 15500030000 and VNPay amount 1550003000000. A bottom panel lists: type errors are found by running tsc in CI or the editor, never by running the program; at runtime there are no types, so convert and check form strings once at the edge; annotate parameters and exported return types and let inference type the rest.",
            caption: "tsc reads the types and reports errors. Everything that only runs the code throws them away.",
        }),
        p("To follow along, create a folder with a `tsconfig.json`, install TypeScript and run the checker:"),
        code("json", String.raw`
{
  "compilerOptions": {
    "target": "es2024",
    "module": "nodenext",
    "strict": true,
    "noEmit": true
  }
}`, "tsconfig.json"),
        code("bash", String.raw`
npm install --save-dev typescript   # TypeScript 5.9
npx tsc                              # checks every .ts file in the folder, emits nothing (noEmit)
node checkout.ts                     # Node 24 runs it, without checking`),

        h2("4. Annotations"),
        p("An annotation is a colon and a type after a name. You can put one on a variable, on each parameter, and after the parameter list for the return value:"),
        code("typescript", String.raw`
let zone: string = "hanoi";
let deliveredToday: number = 0;
let isMember: boolean = false;
const prices: number[] = [15000, 125000];

function orderTotal(subtotal: number, shipping: number): number {
  return subtotal + shipping;
}`),
        p("The everyday types are the JavaScript ones: `string`, `number` (integers and decimals alike), `boolean`, `bigint`, `null` and `undefined`. `number[]` is an array of numbers. For an object you describe its properties; give the description a name with `type` so you can reuse it:"),
        code("typescript", String.raw`
type CartLine = { sku: string; name: string; price: number; qty: number };

function subtotal(lines: CartLine[]): number {
  return lines.reduce((sum, line) => sum + line.price * line.qty, 0);
}`),
        p("Annotate the checkout this way and the Saturday call no longer compiles:"),
        code("text", String.raw`
$ npx tsc
checkout.ts:18:42 - error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.

18 const total = orderTotal(subtotal(cart), form.shipping);
                                            ~~~~~~~~~~~~~

Found 1 error in checkout.ts:18`),
        p("Read the message from the end: the **parameter** is `number`, the **argument** you passed is `string`, and a string cannot go where a number is expected. The squiggle points at the exact expression. This is the whole value of TypeScript in one line: the bug that cost 37 orders is now a red underline in the editor on Friday afternoon."),

        h2("5. Inference: types you do not write"),
        p("You do not annotate everything. When a variable is initialised, TypeScript **infers** its type from the value, and when a function returns, it infers the return type from the `return` statements:"),
        code("typescript", String.raw`
let count = 0;                             // number
const zone = "hanoi";                      // "hanoi" - a const can only ever hold this exact string
let city = "hanoi";                        // string - a let can change later
const prices = [15000, 125000];            // number[]
const line = { sku: "VEG-101", qty: 2 };   // { sku: string; qty: number }
const mixed = [1, "a"];                    // (string | number)[]
function half(n: number) { return n / 2; } // returns number

count = "3";
// error TS2322: Type 'string' is not assignable to type 'number'.`),
        bullets([
            "**`const zone`** gets the **literal type** `\"hanoi\"`: the only value it can ever have. `let city` gets the wider `string`. Literal types become very useful in the next lessons.",
            "**`const line`** still has changeable properties: `const` stops `line` from pointing to another object, but `line.qty = 3` is fine, and `qty` stays a `number`.",
            "**Callbacks are typed from where they are used.** In `lines.reduce((sum, line) => ...)` you never wrote a type for `line`: TypeScript knows `lines` is `CartLine[]`, so `line` is a `CartLine`. A typo is caught immediately:",
        ]),
        code("text", String.raw`
const names = cart.map((line) => line.nmae);
// error TS2339: Property 'nmae' does not exist on type 'CartLine'.`),
        h3("When to annotate"),
        bullets([
            "**Always annotate parameters.** Nothing tells TypeScript what a caller will pass, and strict mode refuses to guess (next section).",
            "**Annotate return types of functions other files use.** The annotation is a promise: if a later edit returns a string by accident, the error appears inside the function, not in ten callers.",
            "**Annotate a variable when it starts empty or must be wider than its first value**: `let total: number;` declared before an `if`, or `const ids: string[] = [];`.",
            "**Do not annotate the rest.** `const count: number = 0` says the same thing twice; let inference do it and keep the code readable.",
        ]),
        challenge("chal_quiz_tsf_111", "For the first question, remember what + does in JavaScript when one side is a string - TypeScript describes JavaScript, it does not change it. For the second, ask for each snippet: what type was inferred, and does the next line respect it?"),

        h2("6. Strict mode"),
        p("`\"strict\": true` in `tsconfig.json` (or `--strict` on the command line) turns on a family of checks that are off by default for backwards compatibility. Rename the Saturday `checkout.js` to `checkout.ts` and run the checker in strict mode, before adding a single annotation:"),
        code("text", String.raw`
$ npx tsc --strict --noEmit checkout.ts
checkout.ts:9:19 - error TS7006: Parameter 'lines' implicitly has an 'any' type.
checkout.ts:10:24 - error TS7006: Parameter 'sum' implicitly has an 'any' type.
checkout.ts:10:29 - error TS7006: Parameter 'line' implicitly has an 'any' type.
checkout.ts:13:21 - error TS7006: Parameter 'subtotal' implicitly has an 'any' type.
checkout.ts:13:31 - error TS7006: Parameter 'shipping' implicitly has an 'any' type.

Found 5 errors in the same file, starting at: checkout.ts:9`),
        p("`any` is TypeScript's \"I do not know, allow everything\" type: a value of type `any` can be added to anything, passed anywhere and have any property read. Without strict mode, a parameter without an annotation silently becomes `any` - and `orderTotal(subtotal, shipping)` would accept a string without a word. **`noImplicitAny`** turns that silence into error TS7006. The other checks that `strict` turns on:"),
        bullets([
            "**`strictNullChecks`**: `null` and `undefined` are not allowed where a value is expected unless the type says so. The crash in the next lesson is exactly this.",
            "**`strictFunctionTypes`** and **`strictBindCallApply`**: callbacks and `fn.call(...)` arguments are checked properly.",
            "**`strictPropertyInitialization`**: class properties must be set in the constructor.",
            "**`useUnknownInCatchVariables`**: the `error` in `catch (error)` is `unknown`, not `any` (lesson 8).",
            "**`noImplicitThis`**, **`alwaysStrict`** and **`strictBuiltinIteratorReturn`**: smaller checks with the same idea.",
        ]),
        callout("tip", "Start strict, stay strict",
            "Every new TypeScript project should have \"strict\": true from the first commit; tsc --init already writes it. Turning it on later means fixing hundreds of errors at once. When you migrate a JavaScript project, convert one file at a time with strict on, rather than converting everything with strict off. Everything in this course, and the code runner that grades your challenges, uses tsc 5.9 with --strict."),

        h2("7. Strings at the edge"),
        p("Annotations stop a string from reaching `orderTotal`, but the string still exists: the form gives you `\"30000\"`, and you have to turn it into a number yourself. JavaScript has three tools, and each has a trap:"),
        code("text", String.raw`
text          Number(text)   parseInt(text)   parseFloat(text)
"30000"       30000          30000            30000
" 30000 "     30000          30000            30000
"30.000"      30             30               30
"30,000"      NaN            30               30
""            0              NaN              NaN
"abc"         NaN            NaN              NaN
"1e5"         100000         1                100000`),
        bullets([
            "**`\"30.000\"` is 30, not 30.000 đ.** Vietnamese uses dots between the thousands, JavaScript reads the dot as a decimal point. A shopper who types a voucher of `20.000` gets 20 đ off.",
            "**`parseInt` stops at the first character it does not understand**, so `\"30,000\"` becomes 30 without any error.",
            "**`Number(\"\")` is 0**, which may or may not be what an empty field should mean - decide it explicitly.",
            "**`NaN` is a `number`.** `Number(\"abc\")` returns `NaN`, and TypeScript is happy: the type is `number`. Check with `Number.isNaN(x)`, or better, `Number.isSafeInteger(x)` when you expect whole đồng.",
        ]),
        p("The rule that follows: convert a string **once**, as close as possible to where it enters the program, check it there, and from then on pass numbers around. TypeScript cannot check the content of a string, but it can make sure nothing downstream ever receives one."),

        h2("8. The fix"),
        p("The shipping `<select>` only offers fixed values without dots (`\"30000\"`, `\"15000\"`), so `Number` plus a check is enough there. The function returns a `number`, so `orderTotal` can only ever be called with numbers:"),
        code("typescript", String.raw`
type CartLine = { sku: string; name: string; price: number; qty: number };

// The checkout form: <select> and <input> values are always strings.
const form: Record<string, string> = { shipping: "30000", voucher: "" };

const cart: CartLine[] = [
  { sku: "VEG-101", name: "Rau muống", price: 15000, qty: 2 },
  { sku: "MEA-204", name: "Thịt ba chỉ", price: 125000, qty: 1 },
];

// Strings become numbers once, at the edge, and are checked there.
function shippingFee(text: string): number {
  const fee = Number(text);
  if (!Number.isSafeInteger(fee) || fee < 0) {
    throw new Error(` + "`invalid shipping fee: ${JSON.stringify(text)}`" + String.raw`);
  }
  return fee;
}

function subtotal(lines: CartLine[]): number {
  return lines.reduce((sum, line) => sum + line.price * line.qty, 0);
}

function orderTotal(subtotal: number, shipping: number): number {
  return subtotal + shipping;
}

const total = orderTotal(subtotal(cart), shippingFee(form.shipping));
console.log("total:", total);
console.log("VNPay amount:", total * 100);`, "checkout.ts"),
        code("text", String.raw`
$ npx tsc && node checkout.ts
total: 185000
VNPay amount: 18500000`),
        numbered([
            "**Every parameter is annotated**, so strict mode is satisfied and nothing is silently `any`.",
            "**`shippingFee` is the only place that touches the string.** It refuses anything that is not a whole, non-negative number of đồng, with a message that says which value was wrong.",
            "**`orderTotal(subtotal(cart), form.shipping)` no longer compiles.** If someone \"simplifies\" the call back to the form value, the type checker - running in CI - stops the deploy.",
            "**The test that should have existed** calls the checkout with the form exactly as the browser builds it, strings included.",
        ]),

        h2("9. Your turn"),
        p("The voucher field is a free text `<input>`, and shoppers type amounts with dots: `20.000`, `1.250.000`. Write the two functions of the checkout yourself, annotations first: the starter does not compile under `--strict`, and the compile error is the first thing the runner will show you."),
        challenge("chal_coding_tsf_112", "Start by adding the annotations and check that the starter compiles (the tests will still fail). For toVnd, trim first, handle the empty field, then check the shape of the text before you convert it - a regular expression like /^\\d+$/ is a good start, and Number(text) alone turns \"155.000\" into 155. For orderTotal, decide free shipping from the subtotal before the voucher."),

        h2("10. Pitfalls"),
        bullets([
            "**Running is not checking**: `node file.ts`, Vite and esbuild strip types without checking them. Run `tsc` in CI, or type errors reach production.",
            "**Implicit `any`**: without strict mode, a parameter with no annotation accepts anything. Turn on `strict` and keep it on.",
            "**`+` with a string**: TypeScript allows `number + string` (it is valid JavaScript) and the result is a `string`. The error only appears where that string is used as a number.",
            "**Form values are strings**, even from `<input type=\"number\">` (`.value` is a string; number and range inputs also have `.valueAsNumber`).",
            "**`Number(\"30.000\")` is 30** and `parseInt(\"30,000\")` is 30: check the shape of the text before converting it.",
            "**`NaN` has type `number`**: the type checker cannot tell you a conversion failed. Check with `Number.isNaN` or `Number.isSafeInteger`.",
        ]),

        h2("11. Checklist"),
        bullets([
            "`tsconfig.json` has `\"strict\": true`, and `tsc` runs in CI on every pull request.",
            "Every function parameter has an annotation; functions used from other files annotate their return type.",
            "Local variables are inferred, unless they start empty or must hold more than their first value.",
            "Strings from forms, URLs and environment variables are converted once, at the edge, and checked there.",
            "Tests call your code with values shaped like the real input - strings from the form, not convenient numbers.",
        ]),
        p("Next lesson: unions and narrowing. The order tracking page went white for every customer whose courier had just left the company: \"Cannot read properties of undefined (reading 'name')\"."),
    ],
});
