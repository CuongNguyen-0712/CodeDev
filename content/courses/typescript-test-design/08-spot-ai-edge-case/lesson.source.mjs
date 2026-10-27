// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-ttd-3-2",
    title: "Spot the AI mistake: the 80% certificate boundary",
    slug: { _type: "slug", current: "spot-the-ai-mistake-80-percent-certificate-boundary" },
    description:
        "An AI assistant wrote the certificate rule \"at least 80% of the required items\" and three tests for it. The tests pass, coverage is 100%, and learners who finished exactly 80% get no certificate. Learn to read a rule for its boundaries before you read the code, why rounding a percentage moves the boundary, when floating point bites, how to compare in whole numbers, what to do with an empty course and invalid input, and how to review AI-written tests for the cases they leave out.",
    estimatedTime: 20,

    scenario: {
        role: "Backend developer and code reviewer, CodeDev learning platform",
        problem:
            "Support has three tickets about certificates on https://app.codedev.test since Thursday's release. A learner finished 4 of the 5 items of \"Git Basics\" - exactly 80% - and gets no certificate. Another finished 33 of 41 items, 80.5%, with the same result. And an admin reports that a course whose required items were removed by mistake now gives a certificate to every learner who opens it. The certificate rule was rewritten last week with an AI coding assistant; its tests are green and the coverage report shows 100% for the file.",
    },

    content: [
        h2("1. The incident: green tests, wrong certificates"),
        p("The request to the assistant was one paragraph: \"Write isEligibleForCertificate(completed, required) for the CodeDev certificate service. A learner gets the course certificate when they have completed at least 80% of the required items (lessons and graded challenges). Return true or false.\" This is what came back, tests included:"),
        code("typescript", `
// src/certificates/eligibility.ts
export function isEligibleForCertificate(completed: number, required: number): boolean {
  if (required === 0) return true;                            // nothing to complete, so nothing is missing
  const percent = Math.round((completed / required) * 100);   // e.g. 41 of 50 -> 82
  return percent > 80;
}

// src/certificates/eligibility.test.ts
test("certificate rules", () => {
  expect(isEligibleForCertificate(9, 10)).toBe(true);    // 90%
  expect(isEligibleForCertificate(1, 2)).toBe(false);    // 50%
  expect(isEligibleForCertificate(10, 10)).toBe(true);   // 100%
});`, "as merged"),
        p("Everything about it looks careful: a comment for the special case, a comment with an example, a test with a true and a false answer. The reviewer ran the tests, saw green and 100% coverage, and approved. Nobody asked the one question that matters for a rule with a number in it: **what happens exactly at the number?**"),

        h2("2. Reproduce it with a table, not with one example"),
        p("Do not reproduce a boundary bug with one input. Write a small table of inputs around the boundary and print what the code answers. Any script works; a throwaway file run with `npx tsx` is enough:"),
        code("typescript", `
// scratch/eligibility-table.ts
import { isEligibleForCertificate } from "../src/certificates/eligibility";

const rows: Array<[number, number]> = [[4, 5], [8, 10], [33, 41], [39, 49], [79, 100], [0, 0]];
for (const [completed, required] of rows) {
  const percent = required ? ((completed / required) * 100).toFixed(2) : "-";
  console.log(\`\${completed} of \${required} (\${percent}%): \${isEligibleForCertificate(completed, required)}\`);
}`, "eligibility-table.ts"),
        code("text", `
4 of 5 (80.00%): false
8 of 10 (80.00%): false
33 of 41 (80.49%): false
39 of 49 (79.59%): false
79 of 100 (79.00%): false
0 of 0 (-): true`, "npx tsx scratch/eligibility-table.ts"),
        p("Three tickets, three rows: exactly 80% is refused, 80.49% is refused, and an empty course certifies everyone. The rows also tell you that the bug is not one wrong character. Three separate decisions in four lines of code are wrong."),

        h2("3. Core idea: a rule with a number has edges"),
        p("Before you read any implementation, read the **request** and write down its edges. \"At least 80% of the required items\" gives you:"),
        bullets([
            "**The boundary itself.** \"At least\" means 80% is in: `>=`, not `>`. Inputs that are exactly 80%: 4 of 5, 8 of 10, 40 of 50.",
            "**Just inside and just outside.** The smallest step above and below 80% for a given number of items: 33 of 41 (80.49%) is in, 39 of 49 (79.59%) is out.",
            "**Empty input.** A course with 0 required items: 0 of 0 is not \"80% of something\". The request does not say, so you decide, write it down, and test it. For a certificate the safe answer is no: an empty course is almost always a data mistake, as the third ticket shows.",
            "**Invalid input.** A negative count, a fraction, or more completed than required (duplicate progress rows). None of them should produce a certificate.",
        ]),
        p("This is the boundary list from lesson 1.2 applied to one function. It takes a minute, and it is the list you compare both the code and its tests against."),
        h3("Why rounding moves the boundary"),
        p("`Math.round` turns every percentage from 79.5 up to just under 80.5 into 80. Combine it with `>` and everything in that range is refused, including 80.49%, which met the rule. Swap the operator and the error flips to the other side of the line. Either way, the effective boundary is no longer 80%. Rounding is for **display** (\"You completed 80% of the course\"); a decision should be made on the exact value."),
        h3("Why floating point can bite, and how to avoid it"),
        p("At 80% the division happens to be harmless: 4 / 5 * 100 gives exactly 80 in JavaScript. Change the pass mark and it stops being harmless:"),
        code("typescript", `
(29 / 50) * 100;          // 57.99999999999999  - exactly 58%, but below 58
(57 / 100) * 100;         // 56.99999999999999
(7 / 100) * 100;          // 7.000000000000001
0.1 + 0.2;                // 0.30000000000000004`, "Node.js REPL"),
        p("Numbers in JavaScript are binary floating point, so most decimal fractions are stored as the nearest value the format can hold, and the error shows up after multiplying. A rule that works at 80% would fail at 58% for learners who are exactly on the line. The robust way is to avoid the division entirely. \"completed / required is at least 80 / 100\" is the same statement as \"completed * 100 is at least required * 80\", and with whole numbers both sides are exact integers (up to `Number.MAX_SAFE_INTEGER`, far beyond any course)."),
        callout("info", "When not to bother",
            "If a value is only shown to people (\"about 80% done\"), rounding and floating point are fine. Comparing in whole numbers matters when the value **decides** something: a certificate, a price, a grade, an access check. That is also where an AI assistant is most likely to produce code that looks right, because \"compute the percent, compare it\" is the common pattern in the code it learned from."),

        challenge("chal_quiz_ttd_321"),

        h2("4. Worked example: the quiz pass mark"),
        p("The same review on a different rule from the platform: a quiz is passed with **at least 70%** of its points. Points are whole numbers. First the edges, then the code, then a table-driven test that names every edge:"),
        code("typescript", `
// src/quizzes/passing.ts
export function passesQuiz(score: number, maxScore: number): boolean {
  if (!Number.isInteger(score) || !Number.isInteger(maxScore)) return false;
  if (maxScore <= 0 || score < 0 || score > maxScore) return false;   // empty quiz or bad data: not passed
  return score * 10 >= maxScore * 7;                                  // score / maxScore >= 70 / 100, exactly
}

// src/quizzes/passing.test.ts
test.each([
  { score: 7, maxScore: 10, passed: true,  why: "exactly 70%" },
  { score: 6, maxScore: 10, passed: false, why: "just below" },
  { score: 21, maxScore: 30, passed: true, why: "exactly 70% of 30" },
  { score: 39, maxScore: 56, passed: false, why: "69.64%, would round up to 70" },
  { score: 31, maxScore: 44, passed: true,  why: "70.45%, would round down to 70" },
  { score: 0, maxScore: 0, passed: false, why: "empty quiz" },
  { score: 11, maxScore: 10, passed: false, why: "more points than possible" },
  { score: 2.5, maxScore: 10, passed: false, why: "not a whole number" },
])("$score of $maxScore -> $passed ($why)", ({ score, maxScore, passed }) => {
  expect(passesQuiz(score, maxScore)).toBe(passed);
});`, "passing.ts and passing.test.ts (Vitest)"),
        p("Each row exists because of one edge in the rule, and the `why` column says which. A reviewer can check the table against the request without reading the implementation at all, and when someone later changes `>=` to `>` the \"exactly 70%\" rows fail."),

        h2("5. Reviewing AI-written code for edge cases"),
        p("AI assistants are good at the shape of a solution and weak at the edges the request only implies. Review their output in a fixed order:"),
        numbered([
            "**Write the edges from the request first**, before you read the code, so the code cannot steer your list.",
            "**Read the AI's tests before its code.** For each edge, is there a test that sits on it? Write the answer for each test next to your edge list: a test that would give the same result whether the code is right or wrong at the edge cannot protect that edge.",
            "**Look for decisions the request did not make**, such as `required === 0`. The assistant had to choose something; it chose silently, and the comment made the choice look deliberate.",
            "**Run the edge table** against the code, as in section 2, and turn every row into a test.",
            "**Do not accept \"100% coverage\" as an answer.** Coverage says every line ran, not that any test would notice if a line were wrong. Lesson 3.4 measures exactly that.",
        ]),
        p("You can ask the assistant to list edge cases too, and it often finds good ones, but treat its list like its code: as a draft that you check against the request."),

        h2("6. The challenge"),
        p("The challenge contains the AI's function exactly as merged. The public tests are the kind of tests the AI wrote, and they pass on its code. The hidden tests check the edges from section 3: exactly 80%, values that rounding pushes across the line, an empty course, invalid input, very large counts, and every combination up to 100 required items. Fix the function so that it does what the request says, not what the comments say."),
        challenge("chal_coding_ttd_322"),

        h2("7. How to verify the fix"),
        bullets([
            "**Turn the support tickets into tests.** 4 of 5, 33 of 41 and an empty course become three named test cases that fail before the fix and pass after it.",
            "**Test both sides of the line.** For a few sizes of course, test the smallest eligible count and the count one below it. If both pass, the boundary is where the rule says.",
            "**Flip the operator on purpose.** Change `>=` to `>` locally and run the tests: at least one must fail. If none does, your tests cannot see the boundary. This is mutation testing done by hand, and lesson 3.4 automates it.",
            "**Check production data.** Count learners whose stored progress is exactly 80% and who have no certificate, so support can issue the missing ones after the deploy.",
        ]),

        h2("8. Common mistakes at a boundary"),
        bullets([
            "**Reading \"at least\" as \"more than\".** Spot it: a `>` in a rule whose words say \"at least\", \"minimum\" or \"from\".",
            "**Rounding before deciding.** Spot it: `Math.round`, `toFixed` or `Math.floor` on a value that is then compared.",
            "**Dividing when you can multiply.** Spot it: a percentage computed only to be compared with a constant. Compare the cross products of whole numbers instead.",
            "**Letting an empty input pass.** Spot it: `if (required === 0) return true` or a division guarded with an early `true`. Ask what the business wants for \"nothing\".",
            "**Tests that never touch the edge.** Spot it: every expected value would stay the same if `>=` became `>`.",
        ]),

        h2("9. Summary"),
        numbered([
            "Write the edges of a rule from its words - the boundary, both neighbours, empty input, invalid input - before you read the code, and check that a test sits on each one.",
            "Decide on exact values: no rounding before a comparison, and whole-number cross products instead of floating-point percentages.",
            "AI-written code and tests share the same blind spots; green tests and 100% coverage say nothing about the edges until a test is placed on them.",
        ]),

        h2("Sources"),
        bullets([
            "MDN: Number.isInteger, Number.MAX_SAFE_INTEGER and Math.round - developer.mozilla.org",
            "Vitest documentation: test.each - vitest.dev/api",
            "Martin Fowler: The Practical Test Pyramid - martinfowler.com/articles/practical-test-pyramid.html",
        ]),
        callout("tip", "Self-practice (not graded): review an AI-written rule",
            "Pick a rule from a project of your own that contains a number: a minimum order amount, a password length, a rate limit. Ask an AI assistant to implement it and to write tests. Before you read its answer, write the edge list from section 3. Then count how many of your edges its tests cover, and add the missing ones as test.each rows with a why column."),
    ],
});
