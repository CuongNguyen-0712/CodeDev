// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-tsf-4-2",
    title: "Mini project: a typed order pipeline",
    slug: { _type: "slug", current: "typescript-mini-project-typed-order-pipeline" },
    description:
        "The nightly reconciliation at Chợ Sớm found seven orders marked as delivered that had never been paid, and one refund for an order that had already left the warehouse. The JavaScript job that replays the day's event log accepted any event in any order. Rebuild it in TypeScript using the whole course: untrusted lines parsed from unknown with type predicates, events and order states as discriminated unions, transitions as exhaustive switches, derived types and generic helpers for the report - so that an impossible order history is an error message instead of a wrong number in the accounts.",
    estimatedTime: 25,

    scenario: {
        role: "Junior frontend developer at Chợ Sớm, an online grocery in Hà Nội, moving the web shop from JavaScript to TypeScript",
        problem:
            "Every event in an order's life - placed, paid, shipped, delivered, cancelled - is appended to a log, and a nightly job replays the log to build the accounts. The job trusted the log. A courier app bug sent \"delivered\" for orders that were never paid, a support tool sent \"cancelled\" for an order already on a scooter, and the accounts showed revenue nobody had received and a refund for groceries the customer kept.",
    },

    content: [
        h2("1. The incident"),
        p("Every change to an order at Chợ Sớm is an **event** appended to a log: the shop writes `placed`, the payment gateway writes `paid`, the courier app writes `shipped` and `delivered`, and the support tool writes `cancelled`. At 02:00 a job replays the day's log to rebuild the state of every order, and the accounts are built from that state."),
        p("In October, Đinh Thị Thảo, the accountant, found seven orders that the accounts counted as delivered revenue but the bank had never paid: a courier app bug sent `delivered` for orders still waiting for payment. The same month a support agent cancelled an order that was already on a scooter, and the job refunded 245.000 đ for groceries the customer had received. The replay job was 80 lines of JavaScript that set `order.status = event.type` for every line it read."),

        h2("2. The plan"),
        p("This lesson rebuilds the job in TypeScript, and every stage uses something from the course. Before any code, write the types: they are the specification."),
        image("order-pipeline", {
            alt: "Diagram titled 'The order pipeline: check at the edge, then let the types carry it'. Four stages from left to right: an event log line such as {\"type\":\"paid\",\"order\":\"CS-24204\",\"amount\":170000}, which is a string that can contain anything; parseEvent, which narrows unknown step by step with type predicates isText and isWhole, with no any and no as (lessons 1, 2 and 8) - an invalid line gives null and 'line 3: invalid event'; apply, which switches on event.type, checks state.status and has assertNever in the default (lessons 3, 6 and 7) - an impossible transition gives a message and the state is kept; and describe plus the report, which switches on state.status, sorts a copy of the orders and computes totals (lessons 4, 5 and 6). Below, the OrderState discriminated union on status: placed with total goes to paid when paid equals the total, paid goes to shipped, shipped (total, courier) goes to delivered (total, courier). placed can be cancelled with refund 0, paid can be cancelled with refund = total; cancelled has total, refund and reason. Every other arrow is an error message, for example: CS-24204 cannot be shipped when placed; CS-24204 paid 170000, expected 180000; CS-24210 already exists; unknown order CS-24299.",
            caption: "Only parseEvent sees untrusted data. Everything after it works with types that are true.",
        }),
        code("typescript", String.raw`
type Item = { sku: string; qty: number; price: number };

// what can happen to an order: a discriminated union on type (lesson 6)
type OrderEvent =
  | { type: "placed"; order: string; items: Item[] }
  | { type: "paid"; order: string; amount: number }
  | { type: "shipped"; order: string; courier: string }
  | { type: "delivered"; order: string }
  | { type: "cancelled"; order: string; reason: string };

// what an order can be: a discriminated union on status
type OrderState =
  | { status: "placed"; total: number }
  | { status: "paid"; total: number }
  | { status: "shipped"; total: number; courier: string }
  | { status: "delivered"; total: number; courier: string }
  | { status: "cancelled"; total: number; refund: number; reason: string };`, "orders.ts"),
        bullets([
            "**Each state carries exactly its data.** A shipped order has a courier; a placed order cannot have one. A cancelled order has a refund and a reason. The old job's single object with a dozen optional fields allowed \"delivered, no courier, refund 245.000\".",
            "**Two unions, two tags.** Events are told apart by `type`, states by `status`. The job is a function from (state, event) to a new state - or an error.",
            "**Derived types stay derived.** `OrderEvent[\"type\"]` is the union of the five event names and `OrderState[\"status\"]` the union of the five statuses (lesson 7) - use them for a lookup table of labels, and a new status will be a compile error there too.",
        ]),

        h2("3. Stage 1: parse every line from unknown"),
        p("The log is text, written by four different systems, one of which has a known bug. Each line goes from `string` to `OrderEvent | null`, and nothing else in the program sees raw data. Small type predicates keep the checks readable (lesson 8):"),
        code("typescript", String.raw`
function isText(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}

function isWhole(value: unknown, min: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min;
}`),
        p("The shape of a `parseEvent` that uses them:"),
        code("typescript", String.raw`
function parseEvent(line: string): OrderEvent | null {
  let data: unknown;
  try {
    data = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  if (!("type" in data) || !("order" in data) || !isText(data.order)) return null;
  const order = data.order;   // string, from here on

  switch (data.type) {
    case "shipped":
      return "courier" in data && isText(data.courier)
        ? { type: "shipped", order, courier: data.courier }
        : null;
    // ... one case per event type ...
    default:
      return null;   // "refunded", 42, a typo: not an event
  }
}`),
        bullets([
            "**`switch (data.type)`** works on an `unknown` value: each `case` compares with a literal. The `default` here returns `null` - this is input validation, so an unknown type is bad data, not a forgotten case.",
            "**Build the event from checked values**, property by property. Spreading `data` would let unchecked extra properties into the typed world.",
            "**Arrays need one more step.** `Array.isArray(data.items)` narrows to `any[]` - the standard library's choice. Assign it to `const rawItems: unknown[] = data.items;` and check every element; no `as` is needed.",
        ]),

        h2("4. Stage 2: transitions as an exhaustive switch"),
        p("`apply(state, event)` returns the new state, or a message explaining why the event is impossible. `placed` is special - it is the only event for an order that does not exist yet - so handle it first; after that, `event` is narrowed to the four other types, and `state` to `OrderState`:"),
        code("typescript", String.raw`
function apply(state: OrderState | undefined, event: OrderEvent): OrderState | string {
  if (event.type === "placed") {
    // ... a new order, or "<order> already exists"
  }
  if (state === undefined) return ` + "`unknown order ${event.order}`" + String.raw`;
  const invalid = ` + "`${event.order} cannot be ${event.type} when ${state.status}`" + String.raw`;

  switch (event.type) {
    case "shipped":
      return state.status === "paid"
        ? { status: "shipped", total: state.total, courier: event.courier }
        : invalid;
    // ... paid, delivered, cancelled ...
    default:
      return assertNever(event);   // "placed" was handled above, so nothing is left
  }
}`),
        bullets([
            "**`assertNever` in the default** proves every event type has a case. When the team adds a `returned` event next year, this function stops compiling until someone decides what a return does to each state.",
            "**`state.status === \"paid\"` narrows `state`**, so in the `shipped` case the checker knows `state.total` exists - and in `delivered` it knows `state.courier` exists only after checking `state.status === \"shipped\"`.",
            "**Return a new state object; never change the old one.** The report compares states, and a log replay must give the same result every time (lesson 4's lesson about shared data).",
            "**Errors are values.** Returning `string` for an impossible event keeps the job running, and the caller decides what to do with the message. Throwing would stop the whole replay at the first bad line.",
        ]),
        callout("tip", "Write the transition table before the code",
            "Five events and five states make 25 combinations. List them in a table - most cells are \"cannot be X when Y\" - and the switch almost writes itself. The table is also the test plan: every cell that is not an error needs a test, and a few error cells too."),

        h2("5. Stage 3: the report"),
        p("The report line for each state is one more exhaustive switch, this time on `state.status`. The orders are printed in a stable order, by id, from a **sorted copy** (lesson 4), and the totals are sums over the states (lesson 5's helpers would do it in one line each):"),
        code("text", String.raw`
line 2: CS-24204 cannot be shipped when placed
line 3: CS-24204 paid 170000, expected 180000
line 5: CS-24204 cannot be delivered when paid
line 6: unknown order CS-24299
CS-24204 paid 180000
orders 1, revenue 180000, refunds 0`),
        p("That is the October incident, replayed: the courier app's `delivered` for an unpaid order is now an error line instead of revenue, and so is the support tool's cancellation of a shipped order."),

        h2("6. Testing the pipeline"),
        numbered([
            "**One happy path per final state**: an order that ends delivered, one cancelled before payment, one cancelled after payment.",
            "**Every kind of bad line**: invalid JSON, valid JSON that is not an object, an unknown type, a missing or empty order id, an empty item list, a zero quantity, a price sent as a string.",
            "**Impossible transitions**: events in the wrong order, a payment with the wrong amount, events for an unknown order, a second `placed`, anything after `delivered` or `cancelled`.",
            "**An empty log**: the report must still print its totals.",
        ]),
        p("The challenge's test runner does exactly this. The hidden tests are the cases from this list that the visible tests do not show."),

        h2("7. Your turn"),
        challenge("chal_coding_tsf_421", "Work in the order of the pipeline. parseEvent: try/catch around JSON.parse, exclude null and arrays, check order once, then switch (data.type) with one case per event; for items, assign data.items to an unknown[] and check every element (qty at least 1, price at least 0). apply: handle placed first, then unknown orders, then switch (event.type) with assertNever in the default; compute the total with reduce. describe: one case per status. Test with the visible cases before submitting."),

        h2("8. What you have learned"),
        bullets([
            "**Lesson 1** - TypeScript checks before the code runs, then disappears; strict mode is not optional; strings from the outside are converted once, at the edge.",
            "**Lesson 2** - `T | undefined` and narrowing: `find` can miss, `0` is not missing, and `!` only silences the checker.",
            "**Lesson 3** - interfaces describe objects; optional properties must be checked before a template string prints `undefined`.",
            "**Lesson 4** - `readonly` arrays and `toSorted` keep shared data shared; tuples for small results.",
            "**Lesson 5** - generics keep the caller's type where `any` would throw it away.",
            "**Lesson 6** - discriminated unions and `assertNever` turn \"we added a case\" into a list of compile errors.",
            "**Lesson 7** - utility types derive patches, cards and tables from one interface; optional still accepts `undefined`.",
            "**Lesson 8** - data from outside is `unknown` until a check makes the type true.",
        ]),
        p("The habit behind all of it: **make the types describe the real data, including the missing and impossible cases, and let the compiler find the code that forgot them.** From here, the same TypeScript runs in React components, in Node services and in tests - the next courses on your roadmap build on it."),
    ],
});
