// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-ttd-1-2",
    title: "Happy path, boundaries & invalid input",
    slug: { _type: "slug", current: "happy-path-boundaries-invalid-input" },
    description:
        "The course progress bar showed \"NaN%\" on a new course and \"125%\" after a double click, while its only test, 2 of 4 lessons is 50%, stayed green. Learn to write the test list before the code: the happy path, the values on both sides of every boundary, empty and invalid input, and repeated requests - and when not to test a case at all.",
    estimatedTime: 25,

    scenario: {
        role: "Developer on the CodeDev learning platform team",
        problem:
            "Two support tickets about the progress bar on https://app.codedev.test/courses arrived on the same day. An instructor who had just created a course with no lessons yet saw \"NaN%\" on its page. A learner who double-clicked \"Mark as complete\" on the last lesson saw \"125%\". The function behind the bar had a test, and the test passed.",
    },

    content: [
        h2("1. The incident: a progress bar that can count past 100"),
        p("This is the code that shipped, together with its one test:"),
        code("typescript", `
// progress.ts - the version that shipped
type Lesson = { id: number; required: boolean };
type Completion = { lessonId: number };

export function courseProgress(lessons: Lesson[], completions: Completion[]): number {
    const done = completions.filter((c) => lessons.some((l) => l.id === c.lessonId)).length;
    return Math.round((done * 100) / lessons.length);
}

// progress.test.ts
it("shows half the course as 50%", () => {
    const lessons = [1, 2, 3, 4].map((id) => ({ id, required: true }));
    expect(courseProgress(lessons, [{ lessonId: 1 }, { lessonId: 2 }])).toBe(50);
});`, "progress.ts"),
        p("The test is not wrong. It checks the **happy path**: normal data, the case everybody thinks of. The bugs in the tickets live everywhere else: in a course with zero lessons, in an event that arrived twice, in an optional lesson that was counted. A function is defined by all its inputs, and this test looked at one."),

        h2("2. Reproduce it and read the evidence"),
        p("Both tickets can be reproduced in a Node REPL in under a minute, without the app:"),
        code("text", `
> 0 * 100 / 0
NaN
> \`\${Math.round(0 * 100 / 0)}%\`
'NaN%'
> JSON.stringify({ percent: NaN })
'{"percent":null}'

> // 4 lessons, the learner had 1-3 done, then double-clicked "complete" on lesson 4
> courseProgress(fourLessons, [{lessonId:1},{lessonId:2},{lessonId:3},{lessonId:4},{lessonId:4}])
125`, "node"),
        p("Three facts come out of this. Dividing by zero in JavaScript does not throw, it quietly gives `NaN`, and `NaN` becomes `null` when it is sent as JSON, so the API would have answered `{\"percent\":null}` without any error in the logs. The double click sent two `POST /lessons/4/complete` requests, both succeeded, and the function counted **events** instead of **lessons**. And nothing in the code mentions `required`, so optional lessons count too."),
        p("None of this needed a browser or a database to find. It needed someone to ask, before writing the function: what are the unusual inputs?"),

        h2("3. Four kinds of input every test list needs"),
        p("When you write tests for a function, go through four questions. Each one finds a different family of bugs:"),
        numbered([
            "**Happy path.** Normal, valid data: the case the feature was built for. One or two tests are enough. It proves the function works at all.",
            "**Boundaries.** Every `<`, `<=`, `>`, `>=`, every limit and every \"at least\" or \"up to\" in the rule. Test the value **on** the line and the values **just next to it** on both sides. Off-by-one bugs live exactly there and nowhere else.",
            "**Empty and invalid input.** Zero items, an empty string, `null`, a negative id, a string where a number belongs. Decide what the function should do (return 0? return an error result? throw?) and write it down as a test.",
            "**Repeated requests.** The same event twice: a double click, a retry after a timeout, a message delivered twice by a queue. Real systems repeat things. Decide whether the second one counts.",
        ]),
        h3("Equivalence classes: why you do not test every value"),
        p("You cannot test every number. You do not need to. Split the inputs into **classes** that the rule treats the same way, and pick one value from the middle of each class plus the values at its edges. For \"a quiz pays full EXP on attempt 1, half on attempts 2 and 3, and there are no more attempts\", the classes are: attempt 1, attempts 2-3, and everything else (invalid). The values worth testing are 1, 2, 3 and 4, plus 0 and a non-integer for the invalid class. Testing 2 and also 3 is not repetition: 3 is the edge where `<= 3` and `< 3` disagree."),
        h3("When not to write the test"),
        bullets([
            "**Do not test the same class twice.** If 2 and 3 pass, 2.0 adds nothing. More tests in the middle of a class make the suite slower without catching more bugs.",
            "**Validate untrusted input once, at the edge.** Data from a request, a file or JSON must be checked. A private helper that only receives values your own code has already checked does not need its own `null` tests; its type says what it accepts.",
            "**Do not test states the type system forbids.** If `required` is typed `boolean`, a test passing `\"yes\"` to an internal function tests TypeScript, not your code. Test it where the value is still `unknown`, such as the JSON body of a request.",
        ]),

        h2("4. Write the test list first"),
        p("The cheapest moment to think about edges is before the code exists, when nothing is pushing you to believe the code already works. Vitest lets you write the list as real entries with `it.todo`. They show up in the test report as a to-do list, and you turn them into tests one by one:"),
        code("typescript", `
// progress.test.ts - the list the team wrote after the tickets, before touching the code
import { describe, it } from "vitest";

describe("calculateProgress", () => {
    it.todo("happy path: completed required lessons as a percentage, rounded down");
    it.todo("optional lessons count neither as done nor in the total");
    it.todo("ignores completions for lessons that are not in the course");
    it.todo("counts a lesson completed several times once (double click, retry)");
    it.todo("a course with no required lessons is 0, not NaN");
    it.todo("returns an invalid_input error for null, wrong types and ids that are not positive integers");
});`, "progress.test.ts"),
        code("bash", `
$ npx vitest run progress
 ↓ progress.test.ts (6 tests | 6 skipped)
   Tests  6 todo (6)`, "terminal"),
        p("Notice what the list forced the team to decide. How is the percentage rounded? (Down, so the bar shows 100 only when everything is done: a learner with one lesson left is not \"complete\".) What does invalid input give back? (An error result the page can show, not an exception and not `NaN`.) Those are product decisions. Writing tests first is how they get made on purpose instead of by accident."),

        h2("5. Worked example: the quiz EXP rule"),
        p("Here is the full treatment for a smaller CodeDev rule: a quiz passed on attempt 1 pays its full EXP, attempts 2 and 3 pay half (rounded down), and there is no attempt 4. The function returns an error result instead of throwing, because the attempt number comes from a request."),
        code("typescript", `
// quizExp.ts
type ExpResult = { ok: true; exp: number } | { ok: false; error: "invalid_attempt" };

export function quizExp(baseExp: number, attempt: unknown): ExpResult {
    if (!Number.isInteger(attempt) || (attempt as number) < 1 || (attempt as number) > 3) {
        return { ok: false, error: "invalid_attempt" };
    }
    return { ok: true, exp: attempt === 1 ? baseExp : Math.floor(baseExp / 2) };
}`, "quizExp.ts"),
        code("typescript", `
// quizExp.test.ts
import { describe, expect, it } from "vitest";
import { quizExp } from "./quizExp";

describe("quizExp", () => {
    it("pays full EXP on the first attempt (happy path)", () => {
        expect(quizExp(8, 1)).toEqual({ ok: true, exp: 8 });
    });

    // boundaries: both edges of "attempts 2 and 3", and the first value outside
    it.each([
        [2, { ok: true, exp: 4 }],
        [3, { ok: true, exp: 4 }],
        [4, { ok: false, error: "invalid_attempt" }],
    ])("attempt %i gives %o", (attempt, expected) => {
        expect(quizExp(8, attempt)).toEqual(expected);
    });

    it("rounds half EXP down for an odd base", () => {
        expect(quizExp(5, 2)).toEqual({ ok: true, exp: 2 });
    });

    // invalid input: below the range, not an integer, not a number at all
    it.each([0, -1, 1.5, "2", null])("rejects attempt %o", (attempt) => {
        expect(quizExp(8, attempt)).toEqual({ ok: false, error: "invalid_attempt" });
    });
});`, "quizExp.test.ts"),
        p("Count what this suite would catch: `> 3` written as `>= 3` (attempt 3 fails), `< 1` written as `< 0` (attempt 0 fails), `Math.round` instead of `Math.floor` (base 5 fails), a missing integer check (1.5 fails), a missing type check (\"2\" fails, since `\"2\" > 3` is a legal comparison in JavaScript). Each test exists because it kills a specific mistake."),
        h3("Repeated requests are a test case too"),
        p("The quiz rule says nothing about double clicks, but the code that **awards** the EXP must. If the award is keyed by the attempt id, the second request is recognised. The test sends the same thing twice, which is all a double click is:"),
        code("typescript", `
it("awards EXP once when the same attempt is submitted twice", () => {
    const ledger = new ExpLedger();
    ledger.award({ attemptId: "qa_501", userId: "u1", exp: 8 });
    ledger.award({ attemptId: "qa_501", userId: "u1", exp: 8 });   // the retry
    expect(ledger.total("u1")).toBe(8);
});`, "expLedger.test.ts"),
        challenge("chal_quiz_ttd_121"),

        h2("6. How to verify your test list is complete"),
        bullets([
            "**Break a boundary on purpose.** Change one `<=` to `<` (or `>=` to `>`) in the code and run the tests. At least one must fail. If none does, the boundary has no test on its edge. Lesson 3.4 turns this habit into a tool, mutation testing.",
            "**Run the tickets as tests.** Every bug report contains an input. Paste it into a test: the empty course and the double-clicked completion become two `it` blocks that must fail on the shipped code.",
            "**Check the branches.** With the coverage package installed (`@vitest/coverage-v8`), `npx vitest run --coverage` reports which branches never ran. An `if` that no test entered is a case nobody wrote down. Coverage tells you what did not run; it does not tell you that what ran was checked.",
            "**Read the list against the rule.** Every number in the rule (1, 3, 100%, \"at least\", \"up to\") should appear in the tests with its neighbours.",
        ]),

        h2("7. Your turn: progress from the test list"),
        p("The team's test list from section 4 is now your specification. Write `calculateProgress(lessons, completions)` so that every item holds. The inputs arrive as JSON, so they are typed `unknown` and must be checked before use. The challenge description repeats the list with the exact error shape and rounding rule."),
        code("typescript", `
type Progress =
    | { ok: true; percent: number; completedRequired: number; totalRequired: number }
    | { ok: false; error: "invalid_input" };

function calculateProgress(lessons: unknown, completions: unknown): Progress {
    // 1. validate: arrays, lessons { id: positive integer, required: boolean },
    //    completions { lessonId: positive integer }
    // 2. which lesson ids are required?
    // 3. which of them were completed (once each)?
    // 4. percent, and what if there is nothing required?
}`),
        challenge("chal_coding_ttd_122"),

        h2("8. Common mistakes"),
        bullets([
            "**Only the happy path.** One test with normal data, like the shipped progress test. How to spot it: no test has an empty array, a zero, a `null` or a value next to a limit.",
            "**Testing the middle instead of the edge.** Tests at 1 and 10 for a rule about \"the first 3\". How to spot it: change the comparison operator and see if anything fails.",
            "**Counting events instead of things.** Arrays of events contain duplicates in real life. How to spot it: the code uses `.length` of an event list where the rule talks about lessons, users or challenges.",
            "**Letting `NaN` escape.** Division by a count that can be zero, `Number(\"\")`, `parseInt` of junk. How to spot it: a division whose divisor comes from input, with no test where that input is empty.",
            "**Validating deep inside instead of at the edge.** `null` checks in every helper, but none where the JSON arrives. How to spot it: functions typed with exact types that still check for `null`, while the request handler passes `req.body` straight through.",
        ]),

        h2("9. Summary"),
        bullets([
            "A test list covers four kinds of input: the happy path, both sides of every boundary, empty and invalid input, and repeated requests.",
            "Pick one value per equivalence class plus the values on its edges; skip duplicates within a class, internal re-validation and states the types already forbid.",
            "Write the list before the code (it.todo) so rounding, empty input and errors are decided on purpose, then prove each boundary test by breaking the comparison once.",
        ]),

        h2("Sources"),
        bullets([
            "Vitest API reference: test.each and test.todo - vitest.dev/api",
            "Martin Fowler / Ham Vocke, The Practical Test Pyramid (unit tests and what to test) - martinfowler.com/articles/practical-test-pyramid.html",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Pick one function with a limit in a project you know (a page size, a minimum password length, a discount threshold). Write its test list as it.todo entries with the four kinds of input, then turn them into tests and check each boundary by flipping its comparison once."),
    ],
});
