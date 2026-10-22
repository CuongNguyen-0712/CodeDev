// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-tsf-4-1",
    title: "unknown vs any: parsing JSON safely",
    slug: { _type: "slug", current: "typescript-unknown-vs-any-parsing-json-safely" },
    description:
        "A farm that supplies Chợ Sớm changed its webhook to send quantities as strings. The code that received it said `as StockUpdate`, the type checker believed it, and the stock of eggs became the string \"4812\": the shop sold eggs it did not have for a whole morning. Learn why every value from outside - JSON, forms, URLs, localStorage, caught errors - is untyped until you check it, the difference between any and unknown, why `as` is a promise and not a check, how to narrow unknown step by step, write type predicates and assertion functions, and handle the unknown in catch.",
    estimatedTime: 20,

    scenario: {
        role: "Junior frontend developer at Chợ Sớm, an online grocery in Hà Nội, moving the web shop from JavaScript to TypeScript",
        problem:
            "Farms post their deliveries to a Chợ Sớm webhook, which adds them to the stock. On Monday the egg farm in Ba Vì upgraded its system, which now sends \"qty\": \"12\" instead of 12. The webhook handler cast the parsed body to StockUpdate. The stock of eggs went from 48 to \"4812\", the shop showed 4812 boxes available, and 61 orders were accepted for eggs that did not exist. A second farm renamed sku to product the same week, and 30 kg of pomelos were added to the stock of a product called undefined.",
    },

    content: [
        h2("1. The incident"),
        p("Chợ Sớm buys from about twenty farms around Hà Nội. Each farm's system calls a webhook when a truck leaves: which product, how many, and which warehouse - Long Biên (`HN-LB`) or Cầu Giấy (`HN-CG`). The handler adds the quantity to the stock, and the shop shows how many can be ordered."),
        p("On Monday at 04:50 the egg farm in Ba Vì sent its first delivery from a new system. At 06:30 the shop said 4812 boxes of eggs were in stock. By the time the warehouse noticed, at 09:15, 61 customers had ordered eggs that were never coming. The handler had been converted to TypeScript the month before. It compiled without a single error."),

        h2("2. Reproduce it"),
        code("typescript", String.raw`
type Warehouse = "HN-LB" | "HN-CG";
interface StockUpdate { sku: string; qty: number; warehouse: Warehouse }

const stock = new Map<string, number>([["EGG-020", 48]]);

function handleWebhook(body: string): void {
  const update = JSON.parse(body) as StockUpdate;
  stock.set(update.sku, (stock.get(update.sku) ?? 0) + update.qty);
}

handleWebhook('{"sku":"EGG-020","qty":"12","warehouse":"HN-LB"}');   // the farm's new format
handleWebhook('{"product":"FRT-201","qty":30,"warehouse":"HN-LB"}'); // another farm renamed sku
console.log(stock);`, "webhook.ts"),
        code("text", String.raw`
$ npx tsc && node webhook.ts
Map(2) { 'EGG-020' => '4812', undefined => 30 }`),
        p("`stock` is a `Map<string, number>`, and yet it holds the string `'4812'` and a key `undefined`. The types were never wrong in the code; they were wrong about the **data**. `JSON.parse` turns any text into any value, and `as StockUpdate` told the checker to believe it was a `StockUpdate`. From that line on, every check TypeScript did was based on something nobody had checked."),

        h2("3. any versus unknown"),
        p("`JSON.parse` is declared to return `any`. You met `any` in lesson 5: it switches the checker off. TypeScript has a second \"I do not know\" type that does the opposite, **`unknown`**:"),
        code("typescript", String.raw`
const a: any = JSON.parse(body);
a.sku.toUpperCase();     // compiles - and throws if sku is missing
const n: number = a.qty; // compiles - and n may be a string

const data: unknown = JSON.parse(body);
data.sku;
// error TS18046: 'data' is of type 'unknown'.
const s: string = data;
// error TS2322: Type 'unknown' is not assignable to type 'string'.`),
        bullets([
            "**`any` allows everything**: any property, any call, assignment to any type. It is the type of \"trust me\".",
            "**`unknown` allows nothing** until you narrow it: you can store it, pass it on, compare it - but not read properties or use it as a `string`. It is the type of \"check me\".",
            "**Both accept every value.** The difference is only what you may do with the value afterwards - which is exactly the difference between the incident and the fix.",
        ]),
        p("So the first rule for data from outside: **give it the type `unknown`**, by annotating the result of `JSON.parse`, `localStorage.getItem` parsing, `await response.json()` and the like. The compile errors that follow are the list of checks you have to write."),

        h2("4. as is a promise, not a check"),
        p("A **type assertion** `value as T` changes what the checker believes about a value. It generates no code - it is erased like every annotation - so at runtime nothing is converted and nothing is checked:"),
        code("typescript", String.raw`
const update = JSON.parse(body) as StockUpdate;   // no check: update.qty may be "12"
const update2 = data as StockUpdate;              // same, from unknown`),
        p("Assertions have legitimate uses - when you know more than the checker, for example right after a check it cannot follow. But on data from outside, `as` is the `!` of lesson 2 applied to a whole object: a promise the compiler cannot verify, broken the first time the other side changes its format. The farm did not even need to make a mistake: it changed its format, and nobody on either side ran a check."),
        image("trust-boundary", {
            alt: "Diagram titled 'At the boundary, data has no type until you check it'. On the left, outside the trust boundary, the farm's webhook body {\"sku\": \"EGG-020\", \"qty\": \"12\", \"warehouse\": \"HN-LB\"} with qty in red: it can be any text at all, a string qty, a renamed field, half a body. Path one, in red: JSON.parse(body) as StockUpdate. JSON.parse returns any; as only changes what the checker believes. No code runs, so qty is still the string \"12\", typed as number: 48 + \"12\" = \"4812\" eggs in stock, as text, and stock.set(undefined, 30) when sku was renamed to product. Path two, in green: const data: unknown = JSON.parse(body). unknown allows nothing until a check narrows it, TS18046 otherwise. The checks in order: try/catch for valid JSON, else 'not JSON'; typeof data === 'object' for an object, else 'not an object'; 'sku' in data and typeof for a non-empty string, else 'bad sku'; Number.isInteger(data.qty) for an integer, else 'bad qty'; equality with 'HN-LB' or 'HN-CG' for a known warehouse, else 'bad warehouse'. Only then is it a StockUpdate: every property was checked, so the type is true, and the reason for a rejection is known.",
            caption: "Types describe the inside of your program. At the edge, code has to make them true.",
        }),

        h2("5. Narrowing unknown"),
        p("The narrowing tools from lesson 2 all work on `unknown`, one step at a time. Each check gives the value a slightly more precise type:"),
        code("typescript", String.raw`
function parseUpdate(body: string): StockUpdate | string {
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return "not JSON";
  }
  // data: unknown
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return "not an object";
  }
  // data: object
  if (!("sku" in data) || typeof data.sku !== "string" || data.sku === "") {
    return "bad sku";
  }
  // data: object & Record<"sku", unknown>, and data.sku: string
  // ... the same for qty and warehouse ...
}`),
        bullets([
            "**`JSON.parse` throws on invalid text**, so the parse itself belongs in a `try`. A body cut off in the middle is the most common bad input of all.",
            "**`typeof data === \"object\"` is true for `null` and for arrays** - a famous JavaScript quirk. Exclude both explicitly.",
            "**`\"sku\" in data`** narrows an `object` to one that has a `sku` property (of type `unknown`), and then `typeof data.sku === \"string\"` narrows the property.",
            "**Check what the type promises, and nothing less**: `qty: number` in this program means a whole number of boxes, so `Number.isInteger`, which also rejects `NaN`, `Infinity` and `1.5`. `warehouse: Warehouse` means one of two strings, so compare with both.",
            "**Return the reason**, not only `false`: \"line 2 rejected: bad qty\" in the log is what lets the farm fix its side in five minutes.",
        ]),

        h2("6. Type predicates and assertion functions"),
        p("A check you need in several places can be packaged as a **type predicate**: a function returning `boolean` whose return type says what `true` means:"),
        code("typescript", String.raw`
function isWarehouse(value: unknown): value is Warehouse {
  return value === "HN-LB" || value === "HN-CG";
}

function isStockUpdate(value: unknown): value is StockUpdate {
  return typeof value === "object" && value !== null &&
    "sku" in value && typeof value.sku === "string" && value.sku !== "" &&
    "qty" in value && Number.isInteger(value.qty) &&
    "warehouse" in value && isWarehouse(value.warehouse);
}

if (isStockUpdate(data)) {
  data.qty;   // data: StockUpdate in this branch
}

// an assertion function throws instead of returning false
function assertStockUpdate(value: unknown): asserts value is StockUpdate {
  if (!isStockUpdate(value)) throw new Error(` + "`not a stock update: ${JSON.stringify(value)}`" + String.raw`);
}
assertStockUpdate(data);
data.warehouse;   // data: StockUpdate from here on`),
        callout("warning", "A predicate is also a promise",
            "TypeScript does not check that the body of isStockUpdate really checks what value is StockUpdate claims. If someone adds a property to StockUpdate and forgets the predicate, it still compiles. Keep predicates next to the type they check, test them with bad input, and for larger APIs consider a validation library such as Zod or Valibot, which derives the type from the checks so they cannot drift apart."),

        h2("7. unknown in catch"),
        p("Strict mode includes `useUnknownInCatchVariables` (lesson 1): the error in `catch (error)` is `unknown`, because JavaScript can `throw` anything - a string, a number, an object. So the same rule applies:"),
        code("typescript", String.raw`
try {
  await syncStock();
} catch (error) {
  console.log(error.message);
  // error TS18046: 'error' is of type 'unknown'.
  console.log(error instanceof Error ? error.message : String(error));   // fine
}`),
        p("`instanceof Error` narrows to `Error`, which has `message` and `cause` (lesson 7 of the JavaScript course). Everything else gets turned into a string for the log."),
        challenge("chal_fix_tsf_411", "Replace the parse with a try/catch around JSON.parse into a variable typed unknown, then add one check per rejection reason, in the order the comment lists them. After typeof data === \"object\", exclude null and arrays. Use \"sku\" in data before reading data.sku, Number.isInteger for qty (it rejects strings and 1.5), and compare the warehouse with both allowed strings."),

        h2("8. The fix"),
        p("The webhook handler now parses into `unknown`, checks every property, and answers the farm with the reason for a rejection; only checked updates reach the stock. The farm in Ba Vì received `400 bad qty` on its first request and fixed its format before 05:00."),
        numbered([
            "**Data from outside is `unknown`**, never `any`, and never cast with `as`.",
            "**Every property the type promises is checked**, including the parts the type cannot express on its own: whole numbers, non-empty strings.",
            "**Rejections carry a reason** and go back to the sender and into the log.",
            "**The test that should have existed** sends the handler bad bodies - a string quantity, a renamed field, half a body - not only good ones.",
        ]),

        h2("9. Pitfalls"),
        bullets([
            "**`as` on parsed JSON**: no check happens. The type is only as true as the sender's last deploy.",
            "**`any` from libraries**: `JSON.parse`, `response.json()` and many older libraries return `any`. Annotate the result as `unknown` to turn the checker back on.",
            "**`typeof x === \"object\"`** is also true for `null` and arrays.",
            "**`typeof x === \"number\"`** is also true for `NaN`, `Infinity` and `1.5`: check what you really need.",
            "**Predicates that drift** from their type: they still compile. Test them, or derive the type from a schema.",
            "**`catch (error)` and `error.message`**: the error is `unknown`; use `instanceof Error`.",
        ]),

        h2("10. Checklist"),
        bullets([
            "Every value from JSON, forms, URLs, storage and other services starts as `unknown`.",
            "No `as` and no `any` at the boundary; checks narrow the value step by step.",
            "`JSON.parse` is inside a `try`; rejected input returns or logs a reason.",
            "Repeated checks are type predicates or assertion functions, kept next to their type and tested with bad input.",
            "`catch` blocks narrow the error with `instanceof Error`.",
        ]),
        p("Next lesson: the mini project. You will put the whole course together in a typed order pipeline - unknown events in, a discriminated union of order states, exhaustive switches and a report out."),
    ],
});
