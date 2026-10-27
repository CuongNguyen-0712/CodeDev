// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-ttd-3-3",
    title: "Write tests that catch bugs, graded by mutants",
    slug: { _type: "slug", current: "write-tests-that-catch-bugs-graded-by-mutants" },
    description:
        "A refactor deleted the minimum-price rule of the CodeDev checkout and changed how discounts are rounded, and the coupon tests stayed green with 100% coverage. Learn to judge a test by the bugs it would catch instead of the lines it runs: think in small planted bugs (mutants), derive one case per rule and edge, compute expected values by hand, and write test cases as data that a runner checks against the real code and against mutants.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer, CodeDev checkout team",
        problem:
            "Saturday 10:20. The payment provider rejects checkouts for the course \"SQL in 30 Days\" (49,000 VND) with \"amount must be greater than 0\": learners with the 50,000 VND welcome coupon are being charged -1,000 VND. On Monday finance also finds orders that are 1 VND cheaper than the price list allows. Both come from Friday's pull request \"refactor: simplify applyCoupon\", which removed two lines and changed one. The coupon tests passed on that pull request, and the coverage report for coupon.ts said 100%.",
    },

    content: [
        h2("1. The incident: a rule deleted, every test green"),
        p("This is the diff that was merged on Friday. The author's intent was a cleanup: fewer lines, one less branch."),
        code("text", `
 export function applyCoupon(price: number, coupon: Coupon, today: string): number {
   if (today > coupon.expiresOn) return price;
-  if (price <= MIN_PRICE) return price;
-  const discount = coupon.kind === "percent" ? Math.floor((price * coupon.value) / 100) : coupon.value;
-  return Math.max(price - discount, MIN_PRICE);
+  const discount = coupon.kind === "percent" ? Math.round((price * coupon.value) / 100) : coupon.value;
+  return price - discount;
 }`, "PR #702 \"refactor: simplify applyCoupon\""),
        p("And this is the whole test file, unchanged by the pull request:"),
        code("typescript", `
// src/checkout/coupon.test.ts
const coupon = (kind: "percent" | "fixed", value: number, expiresOn = "2026-12-31") => ({ kind, value, expiresOn });

test("percent coupon", () => expect(applyCoupon(200000, coupon("percent", 10), "2026-10-26")).toBe(180000));
test("fixed coupon", () => expect(applyCoupon(199000, coupon("fixed", 20000), "2026-10-26")).toBe(179000));
test("expired coupon", () => expect(applyCoupon(199000, coupon("fixed", 20000, "2026-10-01"), "2026-10-26")).toBe(199000));`, "coupon.test.ts"),
        code("text", `
 PASS  src/checkout/coupon.test.ts (3 tests)
File       | % Stmts | % Branch | % Funcs | % Lines
coupon.ts  |   100   |   100    |   100   |   100`, "CI on PR #702"),

        h2("2. Read the evidence: what could these tests ever catch?"),
        p("Look at each test and ask which bug would make it fail:"),
        bullets([
            "**\"percent coupon\"**: 10% of 200,000 is exactly 20,000. `Math.floor` and `Math.round` agree on whole numbers, so this test cannot tell them apart. The price is far above 10,000, so the minimum price never matters.",
            "**\"fixed coupon\"**: 199,000 - 20,000 = 179,000, again far above the minimum.",
            "**\"expired coupon\"**: checks the expiry rule, with a date 25 days in the past - far from the expiry day itself.",
        ]),
        p("Each test checks the **happy middle** of one rule. None of them sits on an edge: no fractional discount, no discount bigger than the price, no cheap course, no coupon used on its last day. The refactor broke two edges, and no test was standing there. And coverage? After the refactor there are fewer lines, and the three tests still run all of them: 100%. Coverage measures what ran, not what was checked."),

        h2("3. Core idea: a test is worth the bugs it catches"),
        p("A better question than \"is this line covered?\" is: **if this line were slightly wrong, would a test fail?** A small, deliberate change to the code is called a **mutant**: `>` becomes `>=`, `Math.floor` becomes `Math.round`, a line disappears. If at least one test fails on the mutant, the tests **kill** it. If all tests still pass, it **survives**, and you have found a behaviour that nobody checks."),
        p("You can design tests from that idea, before any tool is involved:"),
        numbered([
            "**List the rules** in the specification, one per line. For applyCoupon: expiry, percent discount, fixed discount, rounding down, minimum price, cheap courses untouched.",
            "**For each rule, imagine the likely mistakes**: a comparison off by one, the wrong rounding, a missing line, two cases swapped. Those are your mutants.",
            "**For each mistake, choose the input where it changes the answer**: the expiry day itself, a discount with a fraction of .5 or more, a discount larger than the price, a free course. That input is your test case.",
            "**Compute the expected value by hand**, from the specification, not by running the code. A value copied from the code's output only proves the code agrees with itself.",
        ]),
        callout("info", "When not to write more cases",
            "One case per rule-and-edge is the goal, not every combination. Ten cases that each kill a different mutant are worth more than a hundred cases in the middle of the same rule. Also do not chase mutants in code that has no behaviour you care about, such as log messages; lesson 3.4 shows how to tell a useful survivor from noise."),

        challenge("chal_quiz_ttd_331"),

        h2("4. Worked example: the late submission penalty"),
        p("A different rule from the platform. A coding submission is worth its full score when it is on time, 80% of the score (rounded down to whole points) when it is up to 24 hours late, and nothing after that:"),
        code("typescript", `
// src/submissions/lateScore.ts
export function lateScore(score: number, hoursLate: number): number {
  if (hoursLate <= 0) return score;                         // on time
  if (hoursLate <= 24) return Math.floor((score * 8) / 10); // up to 24 hours late: 80%, rounded down
  return 0;                                                 // later than that
}`, "lateScore.ts"),
        p("Now list the mistakes someone could make here, and for each one the input that exposes it:"),
        bullets([
            "`hoursLate <= 24` becomes `< 24`: exactly 24 hours late would score 0. **Case: 24 hours late.**",
            "`hoursLate <= 0` becomes `< 0`: an on-time submission would lose 20%. **Case: 0 hours late.**",
            "`Math.floor` becomes `Math.round`: a score whose 80% has a fraction of .5 or more. 87 points: 69.6 should give 69, not 70. **Case: 87 points, late.**",
            "The 80% becomes 90% (a typo in the constant): **any late case whose answer you computed by hand.**",
            "`return 0` becomes `return score`: **Case: 25 hours late.**",
        ]),
        p("Four cases kill all five mistakes. Written as data, with a column that says which mistake each row is there for:"),
        code("typescript", `
// src/submissions/lateScore.test.ts
test.each([
  { name: "on time keeps the full score",     score: 87, hoursLate: 0,  expected: 87, kills: "<= 0 became < 0" },
  { name: "24 hours late still gets 80%",     score: 87, hoursLate: 24, expected: 69, kills: "<= 24 became < 24, round, 90%" },
  { name: "25 hours late gets nothing",       score: 87, hoursLate: 25, expected: 0,  kills: "return 0 became return score" },
  { name: "1 hour late: 80% of 90 is exact",  score: 90, hoursLate: 1,  expected: 72, kills: "80% became 90%" },
])("$name", ({ score, hoursLate, expected }) => {
  expect(lateScore(score, hoursLate)).toBe(expected);
});`, "lateScore.test.ts (Vitest)"),
        p("Check the expected values by hand once: 87 x 8 / 10 = 69.6, rounded down to 69; 90 x 8 / 10 = 72. Then break the code on purpose, one mistake at a time, and watch the right row fail. That is mutation testing done by hand, and it takes two minutes for a function this size."),

        h2("5. Test cases as data"),
        p("A list of `{ name, input, expected }` objects is the same thing as a `test.each` table, without the framework. Writing tests this way has a useful side effect: the cases can be run against **anything** with the same signature - the real function, an old version, or a mutant. That is how the challenge grades you. The code runner has no test framework, so your cases are plain data, and a small runner at the bottom of the file does what Vitest and a mutation tool would do:"),
        bullets([
            "**It checks your cases first.** At least 6 cases, all with different names, and every expected value must be what the correct `applyCoupon` returns. A case that fails on correct code is a wrong test, not a strict one.",
            "**It runs your valid cases against seven mutants** of `applyCoupon`, each with one planted bug, the kind of mistake you listed in section 3.",
            "**It prints, per mutant, killed or survived.** A survivor line shows the change that was made, the way a mutation report does, so you know which edge your cases are missing.",
        ]),
        p("The rule of `applyCoupon` is in the challenge description and at the top of the file. Do not read the mutants first and write one case per mutant; write the cases from the rule as in section 3, run them, and use the survivors to find what you missed. That is the habit the exercise trains."),

        h2("6. The challenge"),
        challenge("chal_coding_ttd_332"),

        h2("7. How to check your own tests"),
        bullets([
            "**Expected values come from the specification.** Compute them by hand, or from a second source you trust (a price table from finance), never by pasting the function's output.",
            "**Every case should fail for exactly one reason.** If a case is the only one that kills a mutant, its name should say which edge it covers: \"coupon used on its expiry day\", not \"test 4\". Lesson 1.3 applies: a failing case should tell the reader what broke.",
            "**Break the code yourself.** Before you merge a test file, flip one comparison or delete one line in the code under test and run it. If nothing fails, you have found the next case to write.",
            "**Re-run after a refactor.** A refactor should keep every case green. Cases designed as in section 3 would have turned PR #702 red three times: on a cheap course, on a discount bigger than the price, and on a fractional discount.",
        ]),

        h2("8. Common mistakes when writing test cases"),
        bullets([
            "**Only round numbers.** Spot it: every percentage in the tests produces a whole number, so no rounding rule is ever checked.",
            "**Edges far from the edge.** Spot it: an \"expired\" test that uses a date weeks ago instead of the day after expiry, and no test on the expiry day.",
            "**Expected values copied from the output.** Spot it: the expected value is a number nobody can explain without running the code, or the test was written after looking at the result.",
            "**Measuring tests by coverage.** Spot it: a review comment that says \"100% coverage, LGTM\". Ask which mistake each test would catch.",
            "**Many cases, one behaviour.** Spot it: five tests that differ only in the price, all in the middle of the same rule.",
        ]),

        h2("9. Summary"),
        numbered([
            "Judge a test by the bugs it would catch: if a small change to a line would leave every test green, that line's behaviour is not tested, whatever the coverage says.",
            "Design cases from the rules: list the likely mistakes for each rule and pick the input where each one changes the answer, with an expected value computed by hand.",
            "Cases written as data can be run against the real code and against mutants; a surviving mutant names the case you still need.",
        ]),

        h2("Sources"),
        bullets([
            "Vitest documentation: test.each - vitest.dev/api",
            "StrykerJS documentation: mutant states (killed, survived) and supported mutators - stryker-mutator.io/docs",
            "Martin Fowler: The Practical Test Pyramid - martinfowler.com/articles/practical-test-pyramid.html",
        ]),
        callout("tip", "Self-practice (not graded): mutate your own tests",
            "Pick one function with a business rule from a project you work on and its tests. Make five mutants by hand - one comparison flipped, one constant changed, one line removed, one rounding changed, two branches swapped - and run the tests after each. Write down which mutants survived and add one case for each, with a name that says which edge it covers."),
    ],
});
