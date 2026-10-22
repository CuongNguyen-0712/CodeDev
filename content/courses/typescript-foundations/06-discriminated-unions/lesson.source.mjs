// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-tsf-3-1",
    title: "Discriminated unions & exhaustive switch",
    slug: { _type: "slug", current: "typescript-discriminated-unions-exhaustive-switch" },
    description:
        "Chợ Sớm started accepting MoMo on Thursday. By Friday every MoMo receipt said \"received NaN đ\", and the accounting import rejected 312 rows. The fee function had no case for the new payment method, and JavaScript returned undefined without a word. Learn to model data that comes in several shapes as a discriminated union, how a switch on the tag narrows each case, and three ways to make the type checker find every place a new member is not handled yet: a return type, assertNever with the never type, and a Record over the tags.",
    estimatedTime: 20,

    scenario: {
        role: "Junior frontend developer at Chợ Sớm, an online grocery in Hà Nội, moving the web shop from JavaScript to TypeScript",
        problem:
            "MoMo e-wallet payments went live on Thursday morning. The payment form, the payment page and the order page were updated; the function that computes the processing fee for receipts and the daily accounting export was not. Every MoMo payment got a fee of undefined, every receipt said \"received NaN đ\", and on Friday the accountant's import tool rejected 312 rows.",
    },

    content: [
        h2("1. The incident"),
        p("Until last week, Chợ Sớm customers could pay by card, cash on delivery or bank transfer. Each method has its own data - the last four digits of a card, the bank reference, whether the courier collected the cash - and its own processing fee. On Thursday the team added MoMo, the e-wallet most of its customers already use. The ticket listed the payment form, the redirect to MoMo and the order page; all three were done, tested and shipped."),
        p("On Friday morning Đinh Thị Thảo, the accountant, could not import Thursday's settlement file: 312 rows had `NaN` in the \"received\" column. Customers who opened their receipts saw the same: **Đã nhận: NaN đ**. Every one of those rows was a MoMo payment."),

        h2("2. Reproduce it"),
        code("javascript", String.raw`
// fees.js: processing fee per payment, for receipts and the accounting export
function processingFee(payment) {
  switch (payment.method) {
    case "card":
      return Math.round(payment.amount * 0.02);
    case "cod":
      return 15000;
    case "bank":
      return 0;
  }
}

const payments = [
  { method: "card", amount: 245000, last4: "4242" },
  { method: "momo", amount: 185000, phone: "0912345678" }, // new since Thursday
];
for (const p of payments) {
  const fee = processingFee(p);
  console.log(` + "`${p.method}: amount ${p.amount}, fee ${fee}, received ${p.amount - fee}`" + String.raw`);
}`, "fees.js"),
        code("text", String.raw`
$ node fees.js
card: amount 245000, fee 4900, received 240100
momo: amount 185000, fee undefined, received NaN`),
        p("A `switch` that matches no case falls out of the bottom, and a function that ends without `return` returns `undefined`. `185000 - undefined` is `NaN`. The function was written when there were three methods; nothing connected it to the place where the fourth was added. In a big codebase there are dozens of functions like it - labels, icons, refund rules, the accounting export - and the only way to find them all in JavaScript is to search and hope."),

        h2("3. Discriminated unions"),
        p("A payment is one of several **shapes**, and each shape has different properties. TypeScript models that as a union of object types that share one property with a different **literal type** in each member - the **tag**, or discriminant:"),
        code("typescript", String.raw`
type Payment =
  | { method: "card"; amount: number; last4: string }
  | { method: "cod"; amount: number; collected: boolean }
  | { method: "bank"; amount: number; reference: string }
  | { method: "momo"; amount: number; phone: string };`),
        bullets([
            "**`method` is the tag.** Its type is a different string literal in each member, so the value of `method` tells you - and the checker - exactly which shape you have.",
            "**Shared properties** (`amount`) can be read on any `Payment`. Properties that only some members have (`last4`, `phone`) cannot, until you have narrowed to those members.",
            "**Impossible combinations are unrepresentable.** A card payment with a bank reference, or a MoMo payment without a phone, does not fit any member, so it does not compile. Compare with one big type full of optional properties (`last4?`, `reference?`, `phone?`): there, every combination is allowed, and every reader has to guess which properties are set.",
        ]),
        h3("Narrowing with switch"),
        p("Checking the tag narrows the union, exactly like the checks from lesson 2. A `switch` on the tag is the usual way to write it:"),
        code("typescript", String.raw`
function label(p: Payment): string {
  switch (p.method) {
    case "card":
      return ` + "`card ****${p.last4}`" + String.raw`;   // p: { method: "card"; amount: number; last4: string }
    case "cod":
      return ` + "`cash ${p.last4}`" + String.raw`;
      // error TS2339: Property 'last4' does not exist on type '{ method: "cod"; amount: number; collected: boolean; }'.
    case "bank":
      return ` + "`bank transfer ${p.reference}`" + String.raw`;
    case "momo":
      return ` + "`MoMo ${p.phone}`" + String.raw`;
  }
}`),
        p("Inside each case, `p` has exactly that member's type: the editor autocompletes `last4` after `case \"card\"`, and refuses it after `case \"cod\"`. `if (p.method === \"card\")` narrows the same way."),

        h2("4. Exhaustiveness: finding the forgotten case"),
        p("Here is Thursday's fee function in TypeScript, with the union that already includes `momo`:"),
        code("typescript", String.raw`
function processingFee(payment: Payment): number {
  switch (payment.method) {
    case "card":
      return Math.round(payment.amount * 0.02);
    case "cod":
      return 15000;
    case "bank":
      return 0;
  }
}`),
        code("text", String.raw`
$ npx tsc
fees.ts:7:43 - error TS2366: Function lacks ending return statement and return type does not include 'undefined'.

7 function processingFee(payment: Payment): number {
                                            ~~~~~~`),
        p("Before `momo` was added, the three cases covered every member, so TypeScript knew the end of the function was unreachable. With a fourth member, a payment can fall out of the switch and return `undefined` - which `: number` does not allow. Adding `momo` to `Payment` makes **every** function written this way fail to compile, in every file, until it handles MoMo. That is the to-do list the team did not have on Thursday."),
        p("The return-type check only works for functions that return a value from every case. A more explicit pattern works everywhere, with the **`never`** type:"),
        code("typescript", String.raw`
function assertNever(value: never): never {
  throw new Error(` + "`unexpected value: ${JSON.stringify(value)}`" + String.raw`);
}

function processingFee(payment: Payment): number {
  switch (payment.method) {
    case "card":
      return Math.round(payment.amount * 0.02);
    case "cod":
      return 15000;
    case "bank":
      return 0;
    default:
      return assertNever(payment);
      // error TS2345: Argument of type '{ method: "momo"; amount: number; phone: string; }'
      //   is not assignable to parameter of type 'never'.
  }
}`),
        bullets([
            "**`never` is the type with no values.** Nothing can be assigned to it - except a value that has been narrowed down to nothing.",
            "**Each case removes one member.** In the `default`, `payment` has whatever is left. If every member has a case, nothing is left: `payment` is `never`, and the call compiles. If one member is missing, `payment` has that member's type, and the error message names it.",
            "**At runtime** the default is unreachable for valid data, but if bad data does arrive (an old app version sending `\"zalopay\"`), `assertNever` throws a clear error instead of returning `undefined`.",
        ]),
        image("exhaustive-switch", {
            alt: "Diagram titled 'A switch on the tag removes one member per case. What is left must be never.' The union Payment has four members told apart by method: card with last4, cod, bank with reference, and the new momo with phone. Below, switch (p.method): in case \"card\", p is the card member and p.last4 is allowed, leaving cod | bank | momo; in case \"cod\", p is the cod member and p.last4 is TS2339, leaving bank | momo; in case \"bank\", leaving momo; in the default, return assertNever(p) gets momo, not never, so tsc reports error TS2345 at the default: Argument of type '{ method: \"momo\"; amount: number; phone: string; }' is not assignable to parameter of type 'never'. Three ways the checker finds the forgotten case: assertNever(v: never): never in the default, which works for every switch and any return type and also throws if bad data arrives at runtime; a return type with no default, function fee(p: Payment): number, which gives TS2366 Function lacks ending return statement and return type does not include 'undefined'; and a Record over the tags, Record<Payment[\"method\"], number>, which gives TS2741 Property 'momo' is missing - for lookup tables of labels, rates and icons.",
            caption: "Adding a member to the union turns every unhandled switch into a compile error.",
        }),
        h3("Lookup tables: Record over the tags"),
        p("When each case is just a value - a label, a rate, an icon - a table is shorter than a switch. Type its keys with the union of tags, and a missing key is an error too:"),
        code("typescript", String.raw`
const METHOD_LABEL: Record<Payment["method"], string> = {
  card: "Thẻ ngân hàng",
  cod: "Tiền mặt khi nhận hàng",
  bank: "Chuyển khoản",
};
// error TS2741: Property 'momo' is missing in type '{ card: string; cod: string; bank: string; }'
//   but required in type 'Record<"card" | "cod" | "bank" | "momo", string>'.`),
        p("`Payment[\"method\"]` is an **indexed access type**: the type of the `method` property of `Payment`, which is the union of the four literals. When a member is added, this type updates by itself."),
        challenge("chal_quiz_tsf_311", "For the first question, think about what the return type annotation promises and what happens to a payment that matches no case. For the second, ask of each pattern: when a fifth member is added, does anything stop compiling, or is the new member handled silently?"),

        h2("5. What makes a good tag"),
        bullets([
            "**A string literal per member**, with a name that reads well in a `switch`: `method`, `kind`, `type`, `status`. Numbers and booleans work too, but strings are clearer in logs and JSON.",
            "**The same property name in every member**, at the top level. A tag nested in a sub-object, or missing from one member, does not narrow.",
            "**Data from outside must be checked before it gets the type.** `JSON.parse` does not know about your union: a payload with `\"method\": \"zalopay\"` will happily be called a `Payment` if you only cast it. Lesson 8 shows how to check it.",
            "**Unions of states, not only of kinds.** An order that is `placed`, `paid`, `shipped` or `cancelled`, with different data in each state, is the same pattern - and the final lesson builds on it.",
        ]),

        h2("6. The fix"),
        code("typescript", String.raw`
function processingFee(payment: Payment): number {
  switch (payment.method) {
    case "card":
      return Math.round(payment.amount * 0.02);
    case "cod":
      return payment.collected ? 15000 : 0;
    case "bank":
      return 0;
    case "momo":
      return Math.max(1000, Math.round(payment.amount * 0.015));
    default:
      return assertNever(payment);
  }
}`, "fees.ts"),
        code("text", String.raw`
card: amount 245000, fee 4900, received 240100
momo: amount 185000, fee 2775, received 182225`),
        numbered([
            "**`Payment` is a discriminated union**, so each method's data is described exactly, and impossible combinations do not compile.",
            "**Every switch on `payment.method` ends in `assertNever`**, and every lookup table is a `Record<Payment[\"method\"], ...>`. Adding a method now produces a list of compile errors - one per place that needs a decision.",
            "**The MoMo ticket would have been different**: \"add `momo` to `Payment`, then fix every compile error\" covers the fee function, the receipt and the accounting export, whoever wrote them.",
            "**The accounting test** builds one payment of every method and checks every row has a number - it would have failed on Thursday.",
        ]),

        h2("7. Your turn"),
        p("The daily settlement needs three functions over all four methods: the fee, a description for the accounting export and whether the money has actually arrived. Write each as an exhaustive switch."),
        challenge("chal_coding_tsf_312", "Start each function with switch (p.method) and a default: return assertNever(p); then add one case per method until it compiles. In each case p has that method's properties (installments, collected, reference, phone). For the MoMo minimum, Math.max(1000, ...) is shorter than an if. To mask the phone, slice(0, 3) and slice(-3)."),

        h2("8. Pitfalls"),
        bullets([
            "**`default: return 0`** (or any other value) handles every future member silently - the opposite of what you want. Put `assertNever` in the default and give each member its own case.",
            "**One type with many optional properties** instead of a union: every combination compiles, and no switch can be exhaustive.",
            "**Switching on `p.method as string`** or on a value typed `string`: the union is gone, and so is the check.",
            "**Forgetting the return type** on a function without `assertNever`: TypeScript infers `number | undefined` and reports nothing.",
            "**Trusting JSON**: a tag from the network can hold any string. Check it before you call it a `Payment` (lesson 8).",
            "**Missing `break` in a switch that does not return**: falling through to the next case is legal JavaScript. Return from every case, or turn on `noFallthroughCasesInSwitch`.",
        ]),

        h2("9. Checklist"),
        bullets([
            "Data that comes in several shapes is a discriminated union with a string literal tag.",
            "Every switch on the tag ends in `default: return assertNever(x)`.",
            "Lookup tables keyed by the tag are `Record<Union[\"tag\"], ...>`.",
            "Adding a member to a union is done by changing the type first and fixing the compile errors.",
            "Tests include one value of every member.",
        ]),
        p("Next lesson: utility types. A quick-edit form in the admin sent `price: undefined`, a spread copied it over the real price, and 40 products showed NaN đ on the shop."),
    ],
});
