// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-saf-2-2",
    title: "Refactor without changing behaviour: tests first, then small steps",
    slug: { _type: "slug", current: "refactor-without-changing-behaviour" },
    description:
        "A pull request titled \"refactor, no behaviour change\" split calculatePrice into tidy functions, CI was green, and a week later finance found 412 orders whose charged total differed from the invoice by 1 đồng. Learn what refactoring means and what it does not, how to pin today's behaviour with characterization (golden-master) tests before you touch anything, how to move in small steps that each keep the tests green, why quirks stay until someone decides otherwise, and how to review a refactor for hidden behaviour changes.",
    estimatedTime: 20,

    scenario: {
        role: "Backend developer, CodeDev learning platform",
        problem:
            "Finance's monthly reconciliation for CodeDev found 412 orders where the amount charged to the learner is 1 đồng higher than the total on the e-invoice, and the e-invoice provider started rejecting corrections. All 412 orders were placed after pull request #812, \"refactor(pricing): split calculatePrice, no behaviour change\", was merged. The pull request had two approvals and a green CI run. Nobody meant to change a price.",
    },

    content: [
        h2("1. The incident: a refactor that changed prices"),
        p("`calculatePrice(order)` computes what a learner pays for a cart of premium courses: counted items, bundle discount, coupons, VAT, rounding to the whole đồng, free for staff. It was one long function, hard to read, and the team wanted to add a new coupon type. A developer split it into small functions. The tests passed, two reviewers approved, and the change shipped."),
        p("A week later finance sent this query and its output:"),
        code("sql", `
-- orders whose charged amount does not match the invoice total
SELECT o.id, o.created_at, o.total_vnd AS charged, i.total_vnd AS invoiced,
       o.total_vnd - i.total_vnd AS diff
FROM orders.orders o
JOIN billing.invoices i ON i.order_id = o.id
WHERE o.total_vnd <> i.total_vnd
ORDER BY o.created_at;

   id    |     created_at      | charged | invoiced | diff
---------+---------------------+---------+----------+------
 ord_9104| 2026-10-14 09:12:40 |   13581 |    13580 |    1
 ord_9133| 2026-10-14 10:03:11 |  275000 |   274999 |    1
 ...
(412 rows)`, "reconciliation query"),
        p("The invoice system still used the old pricing library; the checkout used the new code. Every difference is exactly 1 đồng, and the first one appears an hour after the deploy of #812."),

        h2("2. Read the evidence"),
        p("Here is the part of the diff that matters, and the part of the same pull request that hid it:"),
        code("text", `
--- a/pricing/calculatePrice.ts
-  // VAT 10%, round at the very end only
-  let total = (amount * 110) / 100;
-  total = Math.round(total);
+  const net = Math.round(amount);          // "whole đồng, cleaner"
+  return totalWithVat(net);

--- a/pricing/calculatePrice.test.ts
   test("one course, no coupon", () => {
     expect(calculatePrice({ items: [{ courseId: "c1", priceVnd: 199000 }], coupon: null, staff: false }))
       .toBe(218900);
   });`, "pull request #812, two hunks"),
        p("Rounding before VAT and rounding after VAT give the same result for most carts - for every cart whose discounted amount is already a whole number, which is every cart in the test file. They differ when a percent discount leaves half a đồng: 12,345.5 rounds up to 12,346 and becomes 13,580.6, so 13,581 with VAT, while 12,345.5 with VAT is 13,580.05 and rounds to 13,580. One test with a round price could not see the difference. The CI was green because nothing it checked had changed."),

        h2("3. Core idea: what refactoring is, and what it is not"),
        p("**Refactoring** is changing the structure of code without changing what it does - what callers can observe: return values, saved data, emails sent, errors thrown. Renaming, extracting a function, moving code to another module, replacing a loop with `reduce` are refactorings *if* nothing observable changes. Two consequences follow:"),
        bullets([
            "**You need a definition of \"what it does\" before you start.** For legacy code that definition is not the spec in someone's head, it is the code's current output. Tests that record it are called **characterization tests**; when they compare many recorded outputs at once they are often called a **golden master**.",
            "**A refactor never needs to change a test's expected value.** If an expected value changes, behaviour changed. That may be the right thing to do, but it is a separate change with its own review, not part of a refactor.",
        ]),
        h3("Why small steps"),
        p("Each step is one mechanical change - extract one function, inline one variable, rename one thing - followed by running the tests. When a step breaks something, you know which one, and the fix is to undo a few lines. A big-bang rewrite that changes twenty things at once and then fails leaves you searching all twenty. Commit after each green step; `git bisect` and code review both get easier."),
        h3("Keep the quirks"),
        p("Old code is full of behaviour that looks accidental: a repeated course counts once but only after invalid prices are dropped, a staff flag must be exactly `true`, a bundle and a coupon percent do not add up. Some of these are bugs, some are business rules nobody wrote down. During a refactor you keep all of them. If one looks wrong, write it down, ask the person who owns the rule, and change it later in its own pull request, with its own test."),
        h3("When not to refactor"),
        bullets([
            "**Code nobody needs to change.** An ugly function that works and that no upcoming feature touches is not worth the risk. Refactor where you are about to work.",
            "**When the behaviour is the thing you want to change.** Then write the new behaviour as a failing test and change it on purpose. Mixing \"tidy up\" and \"change the rule\" in one diff is how #812 happened.",
            "**Without a safety net you can trust.** If you cannot record the current behaviour (no way to run the code on realistic inputs), building that harness is the first task, not an optional extra.",
        ]),
        challenge("chal_quiz_saf_221"),

        h2("4. Worked example: pin the behaviour, then move in small steps"),
        h3("Step 1: record a golden master"),
        p("Collect realistic inputs - here, last month's carts, including staff carts, broken coupons and duplicate items - run the **current** code on them, and save the outputs. You do not need to know whether each result is \"right\"; you only claim it is what production does today."),
        code("typescript", `
// scripts/record-golden-prices.ts - run once, before the refactor
import { writeFileSync } from "node:fs";
import { calculatePrice } from "../pricing/calculatePrice";
import carts from "./carts-2026-09.json";           // 2,000 real carts, ids anonymised

const golden = carts.map((cart) => ({ cart, total: calculatePrice(cart) }));
writeFileSync("pricing/golden/prices.json", JSON.stringify(golden, null, 2));
console.log(\`recorded \${golden.length} carts\`);`, "record-golden-prices.ts"),
        code("typescript", `
// pricing/golden.test.ts - runs on every commit of the refactor
import golden from "./golden/prices.json";
import { calculatePrice } from "./calculatePrice";

test("every recorded cart keeps its price", () => {
  const differ = golden.filter((g) => calculatePrice(g.cart) !== g.total);
  expect(differ.slice(0, 5)).toEqual([]);   // show the first few differences, not 2,000 lines
});`, "golden.test.ts"),
        p("Real data is good at covering what people actually do; it is bad at edge cases nobody has hit yet. Add a few hand-written carts for each rule boundary: 2, 3, 4 and 5 courses; a coupon of 0, 1, 100 and 101 percent; a fixed coupon bigger than the cart; a discounted amount that ends in half a đồng. The incident in section 1 would have been caught by that last one."),
        h3("Step 2: check that the net can catch something"),
        p("Before trusting the tests, break the code on purpose: change the 10 percent bundle to 11, or move the `Math.round`. At least one test must fail. If none does, the net has a hole exactly there - add a case and try again. This is mutation testing by hand, and it takes two minutes."),
        h3("Step 3: extract one piece at a time"),
        p("Here is the technique on a different function from the progress module, `submissionExp`, which turns a graded submission into experience points:"),
        code("typescript", `
// before: one function
function submissionExp(s: Submission): number {
  let exp = 0;
  if (s.passed) {
    if (s.difficulty === "easy") exp = 10; else if (s.difficulty === "medium") exp = 20; else exp = 35;
    if (s.attempt > 1) exp = exp / 2;
    if (s.hintLevel3Opened) exp = exp / 2;
  }
  return Math.floor(exp);
}

// step 1 (commit, tests green): extract the table, nothing else
function baseExp(difficulty: Difficulty): number {
  if (difficulty === "easy") return 10;
  if (difficulty === "medium") return 20;
  return 35;
}

// step 2 (commit, tests green): extract the penalties, keeping their order and the single floor at the end
function afterPenalties(exp: number, s: Submission): number {
  let result = exp;
  if (s.attempt > 1) result = result / 2;
  if (s.hintLevel3Opened) result = result / 2;
  return result;
}

// step 3 (commit, tests green): the original function now reads like its spec
function submissionExp(s: Submission): number {
  if (!s.passed) return 0;
  return Math.floor(afterPenalties(baseExp(s.difficulty), s));
}`, "three small, separately committed steps"),
        p("Notice what did **not** happen: no `Math.floor` moved into `afterPenalties` (the rounding stays where it was: once, at the end), no reordering of the penalties, no \"while I'm here\" change to the rule that a failed submission gets 0. Each step was small enough to check by reading."),

        h2("5. How to verify a refactor"),
        bullets([
            "**The golden master is identical after every commit.** Run it per commit, not once at the end, so a difference points at one step.",
            "**No expected value changed.** On a refactor pull request, `git diff main -- '*.test.ts'` should show added tests only. An edited `toBe(...)` is a behaviour change in disguise: stop and ask why.",
            "**The boundary cases exist.** For each rule in the spec, there is a test on both sides of its boundary. Coverage tools show lines that ran; they do not show whether 3 and 4 courses were both tried.",
            "**Production agrees.** For pricing, compare totals computed by old and new code on a day of real traffic (log both, charge with the old) before switching - or keep the reconciliation query from section 1 as a daily check.",
        ]),

        h2("6. Your turn: split calculatePrice"),
        p("The challenge gives you the old `calculatePrice` - long, nested, correct - and its spec rule by rule. Write the small functions the description names, then rebuild `calculatePrice` from them. The test runner calls each small function on its own and the top-level function too, and the hidden regression tests cover every rule with odd inputs. Keep the old code next to yours while you work and compare them on the same inputs: that is your golden master."),
        challenge("chal_coding_saf_222"),

        h2("7. Common mistakes"),
        bullets([
            "**Updating the expected value to make the test green.** The test then guards the new behaviour, not the old one. Spot it: a refactor diff that edits assertions.",
            "**Refactor and behaviour change in one pull request.** Reviewers cannot tell which lines are meant to change results. Spot it: a title with \"refactor\" and \"fix\" or \"also\", or a description that needs the word \"except\".",
            "**Tests with only round numbers.** Rounding, percentages and boundaries hide behind them. Spot it: every price in the test file ends in 000 and every cart has one or two items.",
            "**Rounding or validating at a new step.** Moving `Math.round`, a `<=` or a duplicate check one step earlier looks like tidying and changes results. Spot it: a rounding or filtering call that moved between functions in the diff.",
            "**Fixing a quirk silently.** \"This can't be intended\" is a question for the owner of the rule, not a reason to change it inside a refactor. Spot it: a golden-master difference explained as \"the old result was wrong anyway\".",
        ]),

        h2("8. Summary"),
        numbered([
            "Refactoring changes structure, never observable behaviour - and a refactor never needs to change a test's expected value. Behaviour changes go in their own, reviewed change.",
            "Pin today's behaviour first: a golden master of realistic inputs plus hand-written cases at every rule boundary, checked by breaking the code on purpose. Keep the quirks.",
            "Move in small steps, run the tests and commit after each one, and verify with an unchanged golden master per commit, untouched assertions, and a comparison against production.",
        ]),

        h2("Sources"),
        bullets([
            "Martin Fowler: Refactoring (2nd edition) and the definition of refactoring - refactoring.com",
            "Michael Feathers: Working Effectively with Legacy Code (characterization tests)",
            "Refactoring catalog: Extract Function - refactoring.com/catalog/extractFunction.html",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Pick a long function in your own project that you are about to change for a feature. Record its outputs for 50-100 realistic inputs plus one case on each side of every boundary you can find, break the function on purpose to check the tests catch it, and then extract one piece per commit with the tests green each time. Write down every quirk you find and ask its owner about it instead of fixing it."),
    ],
});
