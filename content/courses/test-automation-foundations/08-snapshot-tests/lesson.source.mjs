// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-qaf-3-2",
    title: "Snapshot tests that don't lie",
    slug: { _type: "slug", current: "snapshot-tests-that-dont-lie" },
    description:
        "A snapshot that changes on every run trains the team to update it without reading - and then it approves real bugs. Learn what snapshot tests are good for, the Node 24 workflow (t.assert.snapshot, --test-update-snapshots, the .snapshot file), how to make snapshots deterministic by injecting the clock and id generator or normalizing volatile fields, how to review a snapshot diff like code, and why a snapshot always needs one or two exact assertions next to it.",
    estimatedTime: 20,

    scenario: {
        role: "QA automation engineer, online shop billing team",
        problem:
            "The invoice JSON had a snapshot test that failed on almost every run: new invoice UUIDs, a new createdAt, and a customer object whose key order depended on whether the cache was warm. Running node --test --test-update-snapshots and committing the result became a reflex. Last sprint one of those updates accepted invoices for Vietnamese customers without the 10% VAT line; the snapshot diff in the pull request was 600 lines long and was approved unread. Finance found the problem in the monthly tax report. Your job: make the snapshot stable, so that its diff only ever shows real changes, and put an exact check on the numbers that must never silently change.",
    },

    content: [
        h2("1. The incident: a snapshot nobody read"),
        p("The billing service turns an order into an invoice. Each line and each tax entry gets a UUID, the invoice records when it was created, and VN customers pay 10% VAT. All amounts are integer cents."),
        code("javascript", `
const VAT_RATE = { VN: 10 };   // percent

export function buildInvoice(order) {
    const lines = order.items.map((item) => ({
        id: crypto.randomUUID(),
        sku: item.sku,
        qty: item.qty,
        amountCents: item.qty * item.priceCents,
    }));
    const subtotalCents = lines.reduce((sum, line) => sum + line.amountCents, 0);

    const taxes = [];
    const rate = VAT_RATE[order.customer.country];
    if (rate) {
        taxes.push({ id: crypto.randomUUID(), name: \`VAT \${rate}%\`,
                     amountCents: Math.round((subtotalCents * rate) / 100) });
    }
    const taxCents = taxes.reduce((sum, tax) => sum + tax.amountCents, 0);

    return {
        invoiceId: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        customer: order.customer,
        lines, taxes, subtotalCents, taxCents,
        totalCents: subtotalCents + taxCents,
    };
}`, "src/invoice.js"),
        p("The test for it was one line of real work: take a snapshot of the whole invoice."),
        code("javascript", `
import { test } from "node:test";
import { buildInvoice } from "../src/invoice.js";

const order = {
    customer: { name: "Nguyen An", country: "VN" },
    items: [
        { sku: "MUG-01", qty: 2, priceCents: 1250 },
        { sku: "TEE-02", qty: 1, priceCents: 1500 },
    ],
};

test("invoice for a VN order", (t) => {
    t.assert.snapshot(buildInvoice(order));
});`, "test/invoice.test.js"),
        p("It failed on every run, because every run produced four new UUIDs and a new timestamp. In production the `customer` object also came either from the cache (keys stored alphabetically) or from the database (keys in column order), so even the key order changed. After a few weeks the team's habit was: the snapshot is red, run `node --test --test-update-snapshots`, commit, move on."),
        p("Then a refactor moved the country from `order.country` to `order.customer.country`, and one code path kept reading the old field. VN invoices lost their VAT line. The snapshot went red, someone ran the update, and the pull request contained a 600-line snapshot diff - 590 lines of new UUIDs and timestamps, and 10 lines that mattered. It was approved."),
        callout("warning", "A test that is always red is a test that is never read",
            "The snapshot did detect the bug: it failed. But it had failed on every run for weeks, so its failure carried no information. A check that cries wolf is worse than no check, because it also trains people to approve its updates blindly."),

        h2("2. Reproduce it"),
        p("Run the test twice. The first run has no snapshot file yet, so it fails and tells you how to create one:"),
        code("bash", `
$ node --test
✖ invoice for a VN order (13.4ms)
  Error [ERR_INVALID_STATE]: Invalid state: Cannot read snapshot file
  '...\\test\\invoice.test.js.snapshot.' Missing snapshots can be generated
  by rerunning the command with the --test-update-snapshots flag.

$ node --test --test-update-snapshots
✔ invoice for a VN order (17.0ms)`),
        p("Now nothing has changed in the code - run it again:"),
        code("bash", `
$ node --test
✖ invoice for a VN order (21.4ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected

    '\\n' +
      '{\\n' +
  +   '  "invoiceId": "3e0d64b8-ccf9-4095-914b-e6d375bdd655",\\n' +
  +   '  "createdAt": "2026-10-21T09:39:05.670Z",\\n' +
  -   '  "invoiceId": "b9f55193-a43c-46b7-9ff9-6c3247edb9f6",\\n' +
  -   '  "createdAt": "2026-10-21T09:38:13.713Z",\\n' +
      '  "customer": {\\n' +
  ...
  +   '      "id": "b736c5f5-201e-4edc-8fd4-859056c598aa",\\n' +
  -   '      "id": "5f96820f-59cd-40db-a306-5548963d6aa2",\\n' +`),
        p("That is the churn: a failure with zero information. Now simulate the refactor bug (VAT is no longer added) and do what the team did:"),
        code("bash", `
$ node --test --test-update-snapshots
✔ invoice for a VN order (16.2ms)
ℹ pass 1
ℹ fail 0`),
        code("text", `
  "taxes": [],
  "subtotalCents": 4000,
  "taxCents": 0,
  "totalCents": 4000`, "test/invoice.test.js.snapshot (excerpt)"),
        p("Green. `--test-update-snapshots` does not check anything: it **writes down whatever the code produced today** and declares it correct. The wrong invoice is now the expected invoice, and every future run defends the bug."),

        h2("3. What a snapshot test is - and what it is not"),
        p("A snapshot test (also called a **golden master** or **approval test**) records the output of the code once, has a human approve it, and from then on fails when the output differs from the approved version. It does not know what is correct; it only knows what was approved. Its value is exactly as good as the review of each approval."),
        p("That makes it a good fit for **wide outputs**, where writing an assertion per field would be long and brittle, and where any change deserves a human look:"),
        bullets([
            "Documents: invoices, receipts, order confirmation JSON.",
            "API responses: the full body of `GET /orders/:id`, so a renamed or dropped field is noticed.",
            "Rendered text: email and SMS templates, CSV exports, error messages shown to customers.",
            "Configuration or SQL generated by code, where a small change can have a big effect.",
        ]),
        p("And a bad fit for the values that the business cannot afford to get wrong: totals, taxes, discounts, the amount charged to a card. For those, write an **exact assertion** with a value you worked out by hand, as in lesson 1-2 (Assertions that explain failures). An exact assertion fails with a message that names the rule; nobody can \"update\" it with a flag."),
        callout("info", "Snapshot or exact assertion?",
            "Ask: if this value changed, would I want a reviewer to decide whether that is fine? Then a snapshot is a reasonable check. Would it be a bug no matter what anyone thinks? Then it needs an exact assertion. Many tests need both."),

        h2("4. Snapshots in Node 24"),
        p("`t.assert.snapshot(value)` works on Node 24 without any flag. The workflow has four steps:"),
        numbered([
            "Write the test. The first `node --test` fails with \"Missing snapshots can be generated by rerunning the command with the --test-update-snapshots flag.\" A missing snapshot is a failure, never a silent pass - so CI can never create one by accident.",
            "Run `node --test --test-update-snapshots` locally. Node writes `<test file>.snapshot` next to the test file and the test passes.",
            "**Open the file and read it** as if it were a new test, because it is one: every value in it becomes an expectation. Then commit it together with the test.",
            "From then on, `node --test` compares the output with the file. When the output changes on purpose, re-run with `--test-update-snapshots`, review the diff of the `.snapshot` file and commit it.",
        ]),
        p("The file is plain JavaScript text that you can read in a diff. This is the snapshot for an invoice built with a fixed clock and fixed ids (section 5 shows how):"),
        code("javascript", `
exports[\`VN invoice: full document 1\`] = \`
{
  "invoiceId": "id-4",
  "createdAt": "2026-10-21T09:00:00.000Z",
  "customer": {
    "name": "Nguyen An",
    "country": "VN"
  },
  "lines": [
    {
      "id": "id-1",
      "sku": "MUG-01",
      "qty": 2,
      "amountCents": 2500
    },
    ...
  ],
  "taxes": [
    {
      "id": "id-3",
      "name": "VAT 10%",
      "amountCents": 400
    }
  ],
  "subtotalCents": 4000,
  "taxCents": 400,
  "totalCents": 4400
}
\`;`, "test/invoice-fixed.test.js.snapshot"),
        p("Details worth knowing, all checked on Node 24.14:"),
        bullets([
            "Each entry is named after the **test name plus a counter**: the first `t.assert.snapshot` in a test is `1`, the second is `2`. Entries are sorted by name in the file.",
            "Renaming a test makes its entry \"not found\": the test fails with `Snapshot 'new name 1' not found` until you update. An update rewrites the whole file, so entries of deleted or renamed tests disappear.",
            "The default serializer is `JSON.stringify(value, null, 2)`. That has consequences: object keys appear in **insertion order** (`{ b: 1, a: 2 }` and `{ a: 2, b: 1 }` give different snapshots), `undefined` properties vanish, a `Date` becomes its ISO string, and a `Map` or `Set` becomes `{}` - its contents are silently not compared at all.",
            "`t.assert.snapshot(value, { serializers: [f1, f2] })` replaces the default: `f1` receives the value, `f2` receives what `f1` returned, and the last function's result is written as a string. Make the last one return a string; a function that returns an object is written as `[object Object]`.",
            "`snapshot.setDefaultSnapshotSerializers([...])` (import `snapshot` from `node:test`) sets the serializers for every snapshot in that file, and `snapshot.setResolveSnapshotPath(fn)` lets you store snapshot files elsewhere, for example in a `__snapshots__` folder.",
        ]),
        callout("warning", "--test-update-snapshots never belongs in CI",
            "In CI a snapshot must only be compared. A pipeline step that runs with --test-update-snapshots turns every snapshot test into a test that cannot fail."),

        h2("5. Make snapshots deterministic"),
        p("A snapshot is only useful if the same code gives the same snapshot on every run, on every machine. Anything that changes by itself - the clock, random ids, key order from a merge, the order of rows from a database without `ORDER BY` - has to be pinned down. There are two ways, and the first is better when you can use it."),
        h3("Option 1: inject the clock and the id generator"),
        p("Pass the volatile dependencies in, with the real ones as defaults (lesson 2-1, Stubs, mocks & fakes, has more on this). Production code calls `buildInvoice(order)` exactly as before; the test passes a frozen clock and a counter:"),
        code("javascript", `
export function buildInvoice(order, {
    now = () => new Date(),
    newId = () => crypto.randomUUID(),
} = {}) {
    // ... same as before, but every crypto.randomUUID() is newId()
    // and new Date() is now()
}`, "src/invoice.js"),
        code("javascript", `
function fixedDeps() {
    let next = 0;
    return {
        now: () => new Date("2026-10-21T09:00:00.000Z"),
        newId: () => \`id-\${++next}\`,
    };
}

test("VN invoice: full document", (t) => {
    t.assert.snapshot(buildInvoice(order, fixedDeps()));
});`, "test/invoice-fixed.test.js"),
        p("A fresh `fixedDeps()` per test keeps the counter from leaking between tests - the same shared-state trap as in lesson 3-1, Flaky tests: order, time & shared state."),
        h3("Option 2: normalize volatile fields before the snapshot"),
        p("Sometimes you cannot inject: the value comes back from an HTTP endpoint, a database row with a `DEFAULT now()` column, or a library. Then normalize the value before it is snapshotted, with a small function shared by the whole suite:"),
        bullets([
            "**Timestamps** become a fixed placeholder such as `\"<timestamp>\"`. Match the whole string against an ISO-8601 pattern, so a date-only field like `\"2026-11-20\"` (a due date, which is real data) is kept.",
            "**Ids** become stable placeholders numbered by first appearance: `\"<id-1>\"`, `\"<id-2>\"`, ... The same id must always get the same placeholder. If the invoice id appears again inside a refund's `invoiceId`, both become `\"<id-1>\"`, so the snapshot still shows that the two are connected. Replacing every id with one constant `\"<id>\"` would hide a refund that points at the wrong invoice.",
            "**Key order** is made stable by sorting object keys, at every depth. Arrays keep their order: the order of invoice lines is real data.",
            "Everything else stays exactly as it was. A normalizer that rounds amounts or drops \"noisy\" fields hides precisely the changes the snapshot is for.",
            "It returns a **copy**. If it changed the object in place, the test's exact assertions afterwards would check `\"<id-1>\"` instead of the real value - or worse, a shared fixture would be changed for the next test.",
        ]),
        p("You plug it in with the `serializers` option, so the test itself stays one line:"),
        code("javascript", `
import { test } from "node:test";
import { normalizeForSnapshot } from "../test-support/normalize-snapshot.js";

const stable = [normalizeForSnapshot, (value) => JSON.stringify(value, null, 2)];

test("GET /invoices/:id returns the full invoice", async (t) => {
    const body = await getJson(\`/invoices/\${invoiceId}\`);
    t.assert.snapshot(body, { serializers: stable });
});`, "test/invoice-api.test.js"),
        p("Keep helpers like this outside the `test/` folder: `node --test` runs every `.js` file inside a `test/` folder as a test file, helpers included."),
        challenge("chal_coding_qaf_321", "Write one recursive walk that returns a new value: arrays map over their items, objects build a new object from Object.keys(obj).sort(), strings are checked against the two regexes. For the ids, keep a Map from the original uuid to its placeholder that lives for one call, and only create a new placeholder when the uuid is not in it yet."),

        h2("6. Review snapshot diffs like code"),
        p("Determinism makes a snapshot diff small. Small is what makes it reviewable - but someone still has to review it. The habits that keep snapshots honest:"),
        bullets([
            "**Small, focused snapshots.** Snapshot the part a test is about: the `taxes` array for a tax test, the email body for a template test. One 600-line snapshot of a whole page or a whole database dump is never read.",
            "**Update only for an intended change.** Before running `--test-update-snapshots`, say in one sentence what should change (\"the VAT line gets a `rateBps` field\"). Then check that the diff shows exactly that and nothing else.",
            "**Read the diff like code.** Every `-` line is a promise you are breaking, every `+` line a new promise. A removed tax line, a total that moved, a field that turned into `null` - each needs a reason in the pull request.",
            "**Separate commits.** Put snapshot updates in their own commit (\"update invoice snapshots: add rateBps to tax lines\"), so a reviewer can see code changes and their effect on the output side by side, instead of one mixed diff.",
            "**Exact assertions next to the snapshot.** One or two exact checks on the values that must never change silently, in a separate test with a name that says the rule.",
        ]),
        image("normalized-snapshot-diff", {
            alt: "Two snapshot diffs of the same change, side by side. Left, the raw invoice snapshot: 16 changed lines, 10 of them in red because they are volatile - the old and new invoiceId UUID, the old and new createdAt timestamp, the customer object with its keys in a different order, and the old and new UUIDs of two invoice lines. The remaining 6 lines, in amber, are the real change: the taxes array with the VAT 10% entry becomes an empty array, taxCents goes from 400 to 0 and totalCents from 4400 to 4000. Footer: 10 of 16 lines are noise, the lost VAT hides among them and the update is approved unread. Right, the normalized snapshot: createdAt is <timestamp>, keys are sorted, ids are <id-1> to <id-3>, and these context lines are unchanged. Only 6 lines changed, all amber: taxCents 400 to 0, the taxes array losing its <id-4> VAT entry, and totalCents 4400 to 4000. Footer: every changed line is a real change.",
            caption: "Normalizing ids, timestamps and key order removes the noise, so the only lines left in the diff are the behaviour change a reviewer has to decide on.",
        }),

        h2("7. The fix"),
        p("The team made three changes. First, `buildInvoice` takes `now` and `newId` as injected dependencies (section 5, option 1), so the unit test's snapshot is identical on every run. Second, the API test that cannot inject anything uses the shared normalizer through `serializers`. Third - and this is what would have stopped the incident on its own - the tax rule got its own exact test:"),
        code("javascript", `
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildInvoice } from "../src/invoice.js";

const order = {
    customer: { name: "Nguyen An", country: "VN" },
    items: [
        { sku: "MUG-01", qty: 2, priceCents: 1250 },
        { sku: "TEE-02", qty: 1, priceCents: 1500 },
    ],
};

// Deterministic dependencies: a frozen clock and a counter instead of random UUIDs.
function fixedDeps() {
    let next = 0;
    return {
        now: () => new Date("2026-10-21T09:00:00.000Z"),
        newId: () => \`id-\${++next}\`,
    };
}

test("VN invoice: VAT 10% is charged", () => {
    const invoice = buildInvoice(order, fixedDeps());
    assert.equal(invoice.taxCents, 400, "VAT for a 4000-cent VN order");
    assert.equal(invoice.totalCents, 4400);
});

test("VN invoice: full document", (t) => {
    t.assert.snapshot(buildInvoice(order, fixedDeps()));
});`, "test/invoice-fixed.test.js"),
        p("Replay the refactor bug against this suite. Even if someone runs the update flag out of habit, the snapshot test goes green but the exact test does not:"),
        code("bash", `
$ node --test --test-update-snapshots test/invoice-fixed.test.js
✖ VN invoice: VAT 10% is charged (11.8ms)
✔ VN invoice: full document (8.3ms)
ℹ pass 1
ℹ fail 1

✖ VN invoice: VAT 10% is charged
  AssertionError [ERR_ASSERTION]: VAT for a 4000-cent VN order

  0 !== 400`),
        p("And without the flag, the snapshot diff is now short enough to read in ten seconds:"),
        code("bash", `
$ node --test test/invoice-fixed.test.js
  + actual - expected
  +   '  "invoiceId": "id-3",\\n' +
  -   '  "invoiceId": "id-4",\\n' +
  +   '  "taxes": [],\\n' +
  -   '  "taxes": [\\n' +
  -   '    {\\n' +
  -   '      "id": "id-3",\\n' +
  -   '      "name": "VAT 10%",\\n' +
  -   '      "amountCents": 400\\n' +
  -   '    }\\n' +
  -   '  ],\\n' +
  +   '  "taxCents": 0,\\n' +
  +   '  "totalCents": 4000\\n' +
  -   '  "taxCents": 400,\\n' +
  -   '  "totalCents": 4400\\n' +`),
        p("Every line is about the lost VAT. Even the `invoiceId` line is: the counter hands out ids in call order, and with no tax line created the invoice got `id-3` instead of `id-4`. That is the one weakness of a plain counter - one extra or missing object renumbers everything created after it. If that gets noisy, give each kind its own prefix (`line-1`, `tax-1`, `inv-1`)."),
        callout("success", "After the fix",
            "The invoice snapshots have not changed on a run without a code change since. Two months later a pull request changed the VAT name from \"VAT 10%\" to \"VAT (10%)\" for the new PDF layout; the snapshot diff was 2 lines, the update went in its own commit, and the reviewer approved it after reading both lines."),

        h2("8. Pitfalls"),
        bullets([
            "**Updating to make it green.** `--test-update-snapshots` accepts the current output as correct. Use it only after you know what should change, and read the diff it produces.",
            "**Snapshots that churn.** Timestamps, random ids, key order from merges, unordered query results. If a snapshot changes without a code change, fix the test before you do anything else.",
            "**Normalizing too much.** Replacing every number, or dropping fields \"to reduce noise\", removes what the snapshot was supposed to check. Normalize only values that are volatile by design.",
            "**One constant placeholder for all ids.** `\"<id>\"` everywhere hides which object refers to which. Number placeholders by first appearance so relationships stay visible.",
            "**`Map`, `Set` and class instances in the default serializer.** `JSON.stringify` turns a `Map` into `{}`, so its contents are never compared. Convert to plain objects or arrays before snapshotting.",
            "**Snapshot as the only check on money.** A reviewer can approve a wrong total; an exact assertion cannot be approved away.",
            "**Huge snapshots.** If the snapshot is longer than what someone would read in review, split it or snapshot a smaller part.",
        ]),
        callout("tip", "Watch the snapshot fail once",
            "After writing a snapshot test, change one character in the code it covers (a tax name, a field name) and run node --test. You should see a short, readable diff pointing at that character. If you see a wall of UUIDs instead, the snapshot is not ready."),

        h2("9. Checklist"),
        bullets([
            "Use snapshots for wide outputs a human should review; use exact assertions for totals, taxes and other critical values - usually both.",
            "First run fails, `node --test --test-update-snapshots` writes `<test file>.snapshot`, you read it and commit it.",
            "Never run `--test-update-snapshots` in CI.",
            "Run the suite twice without changes: the snapshot must be identical.",
            "Inject the clock and the id generator where you can; otherwise normalize timestamps, ids (numbered by first appearance) and key order.",
            "Keep each snapshot small and focused on what the test is about.",
            "Before updating, state the intended change; after updating, check the diff shows only that.",
            "Put snapshot updates in their own commit, and read every line of their diff in review.",
        ]),
    ],
});
