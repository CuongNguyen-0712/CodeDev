// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-lle-2-1",
    title: "A regression gate for prompt changes",
    slug: { _type: "slug", current: "regression-gate-prompt-changes" },
    description:
        "Prompt v7 of the CodeDev grading assistant beat v6 on five hand-picked submissions and lost on the 500-case eval set, but only the five were in the pull request. Learn why prompt changes must be compared on the same cases (paired), why a pass rate without its n means little, how to check every slice as well as the total, how a drop limit and a simple sign test answer two different questions, and how to turn all of it into a CI gate that can say pass, review or fail.",
    estimatedTime: 25,

    scenario: {
        role: "ML engineer responsible for the AI grading assistant, CodeDev learning platform",
        problem:
            "On Friday the grading prompt v7 was merged: clearer rubric wording, shorter feedback. The pull request showed five submissions that v6 graded wrongly and v7 graded correctly. By Monday, appeals against AI grades on https://app.codedev.test rose from 2.1% to 5.8% of graded submissions, almost all on SQL and JavaScript async challenges. Running the 500-case eval set on recorded outputs shows v7 at 78.2% against 82.4% for v6. Nothing in CI compared the two versions, so the five examples were the only evidence anyone saw.",
    },

    content: [
        h2("1. The incident: five examples against five hundred"),
        p("The assistant grades a learner's submission against the challenge's rubric and returns a verdict (`pass` or `fail`) with feedback. The eval set from lesson 1.1 holds 500 real submissions with a verdict agreed by two human graders, and the eval runner from lesson 1.2 checks each recorded model output against it. This is how v7 reached production:"),
        code("text", `
PR #1842  grading-prompt: v7 (clearer rubric wording, shorter feedback)

Tried on 5 submissions that v6 got wrong or nearly wrong:
  sub_88121  py-loops   v6: fail (wrong)   v7: pass (correct)
  sub_88140  py-loops   v6: fail (wrong)   v7: pass (correct)
  sub_88177  py-loops   v6: pass           v7: pass
  sub_88203  py-loops   v6: pass           v7: pass
  sub_88219  py-loops   v6: fail           v7: fail -> pass after rubric fix

v6: 3/5   v7: 5/5   Looks like a clear win.
Approved by 1 reviewer. Merged Fri 17:40.`, "pull request description"),
        p("Every claim in that description is true. The five submissions were chosen by the author while writing the prompt, all five come from the same slice (Python loops), and two of them were the very cases the rewording was designed to fix. The evidence measures how well v7 fits the examples it was tuned on, not how it grades the next thousand submissions."),
        p("Monday's appeals dashboard told a different story:"),
        code("text", `
AI grading appeals, share of graded submissions
                 Thu (v6)   Mon (v7)
all challenges     2.1%       5.8%
SQL joins          1.9%      11.4%
JS async           2.4%       9.7%
Python loops       2.6%       1.8%`, "appeals dashboard"),

        h2("2. Reproduce it: the same 500 cases, both prompts"),
        p("The eval runner had already recorded the outputs of both prompts on the full eval set. Comparing them case by case, grouped by slice, gives this table (rates are pass rates against the human verdicts; a flip is a case whose result changed between the versions):"),
        code("text", `
slice            n     v6      v7     delta   pass->fail  fail->pass
js-async        32   84.4%   68.8%   -15.6        6           1
py-loops       160   85.0%   87.5%    +2.5        3           7
py-recursion    90   82.2%   77.8%    -4.4        7           3
rust-ownership  18   72.2%   61.1%   -11.1        3           1
sql-joins      120   81.7%   70.8%   -10.8       16           3
ts-types        80   80.0%   78.8%    -1.2        4           3
overall        500   82.4%   78.2%    -4.2       39          18`, "eval report v6 -> v7 (recorded outputs)"),
        p("Python loops is the one slice that improved, and it is where all five examples came from. SQL joins and JS async, the two slices with the most appeals, dropped by more than ten points. The shorter feedback instruction had made the model stop reading past the first `JOIN` and the first `await`. No single example would have shown that; a slice table shows it at once."),
        callout("info", "Recorded outputs make the comparison repeatable",
            "No model is called when the gate runs. The eval runner sends each case to the model once per prompt version, stores the output, and grades the stored output. Running the gate twice on the same recordings gives the same report, which is what you want in CI. Re-record only when the prompt, the model or the case changes."),

        h2("3. Core idea: compare the same cases, slice by slice, with enough of them"),
        h3("Paired, not side by side"),
        p("A pass rate depends on which cases you measured as much as on the prompt. If v6 was measured last month on 480 cases and v7 today on 500 (20 new and harder ones), the difference mixes two changes. A **paired** comparison runs both versions on exactly the same cases and compares each case with itself. Two useful consequences:"),
        bullets([
            "Cases that pass (or fail) with both versions cancel out. Only the **flips** - pass to fail, or fail to pass - carry information about the change.",
            "A case that one run has and the other does not (a crashed request, a filtered case) must be left out and counted, not quietly treated as a pass or a fail. A gate that reports `unpaired: 0` tells you both runs saw the same set.",
        ]),
        h3("A rate without its n means little"),
        p("With n cases, a single case moves the pass rate by `100 / n` points. With the five examples, one case is 20 points. In a slice of 12 it is 8.3 points, so one unlucky flip already crosses a 5-point limit. In the whole set of 500 it is 0.2 points. A rough guide to the noise is the standard error of a proportion, `sqrt(p * (1 - p) / n)`: at an 80% pass rate it is about 18 points for n = 5 and about 1.8 points for n = 500."),
        p("So a gate needs a **minimum sample size** per group. Below it, the gate does not pretend to know: it reports **insufficient data**. Insufficient data is not a pass - it is a reason for a person to look, and a reason to add cases to that slice. The value (this course uses 30) is a policy, not a law of statistics: choose it from the smallest drop you need to notice and the size of your slices, write it down, and keep it the same between runs."),
        h3("Total and slices: two limits"),
        p("An overall average can hide a slice that collapsed, especially when another slice improved (Python loops +2.5 while SQL joins -10.8). The gate therefore checks the overall drop against one limit (2 points here) and every slice that has enough data against a looser one (5 points, because slices are smaller and noisier). To avoid rounding surprises, compare in integers: the drop is more than the limit when `100 * (v6Passes - v7Passes) > limit * n`."),
        h3("Is the drop real? A sign test on the flips"),
        p("A limit answers \"is the change big enough to matter?\". It does not answer \"is it real, or could the flips be chance?\". The simplest paired test looks only at the flipped cases. If v6 and v7 were equally good, each flip would be equally likely to go either way, like a fair coin. With `m` flips, of which `b` went from pass to fail, the question is how unlikely `b` or more heads out of `m` tosses would be. That is the **sign test** (for pass/fail pairs it is also known as the exact McNemar test). For the 500-case run, `m = 57` and `b = 39`; under the fair-coin assumption, 36 or more out of 57 happens less than 5% of the time, so the drop is called significant."),
        p("Instead of computing probabilities in the gate, precompute a table: for each `m`, the smallest `b` that counts as significant at your chosen level (null when no `b` is unlikely enough, which is the case for `m` up to 4 at 5%). The table is data the gate reads, so the rule is explicit and reviewable:"),
        code("typescript", `
// scripts/criticalTable.ts - smallest b with P(X >= b) <= alpha for X ~ Binomial(m, 1/2)
export function criticalPassToFail(maxM: number, alphaPercent = 5): (number | null)[] {
    const table: (number | null)[] = [null];
    for (let m = 1; m <= maxM; m++) {
        let coeff = 1n;                       // C(m, m), then C(m, m-1), ... exact with BigInt
        let tail = 0n;
        let critical: number | null = null;
        for (let b = m; b >= 0; b--) {
            tail += coeff;                    // number of outcomes with b or more pass->fail flips
            if (100n * tail <= BigInt(alphaPercent) * (1n << BigInt(m))) critical = b;
            else break;
            coeff = (coeff * BigInt(b)) / BigInt(m - b + 1);
        }
        table.push(critical);
    }
    return table;
}

console.log(criticalPassToFail(60).slice(40, 46));   // [ 26, 27, 27, 28, 28, 29 ] for m = 40..45`, "criticalTable.ts"),
        p("The two questions are independent, and the gate asks both. A 4-point drop on 8 flips can be pure luck; a 0.8-point drop with 31 flips against 12 on a large set is a real, small regression that you may still decide to accept - but you decide it, the gate does not hide it."),
        callout("warning", "When a gate is the wrong tool",
            "A gate is only as good as its eval set. Do not gate on a set with a few dozen cases and expect it to catch slice regressions; do not change the eval set and the prompt in the same pull request (the comparison is no longer paired against the old baseline); and do not re-run the gate until it passes - with recorded outputs it gives the same answer, and with a live model, retrying until green is just picking the lucky sample. For changes where one wrong grade is unacceptable (for example a certificate exam), a gate is not enough on its own: add human review of the flips."),

        challenge("chal_quiz_lle_211"),

        h2("4. Worked example: the numbers behind the report"),
        p("The eval runner stores one row per case and run. Pairing is a join on the case id, and every column of the report is a count over the joined rows. Running it as SQL against the results table is a good cross-check for whatever code the gate uses:"),
        code("sql", `
-- eval_result(run_id, case_id, slice, pass) - one row per case per recorded run
SELECT b.slice,
       count(*)                                        AS n,
       count(*) FILTER (WHERE b.pass)                  AS v6_passes,
       count(*) FILTER (WHERE c.pass)                  AS v7_passes,
       count(*) FILTER (WHERE b.pass AND NOT c.pass)   AS pass_to_fail,
       count(*) FILTER (WHERE NOT b.pass AND c.pass)   AS fail_to_pass
FROM eval_result b
JOIN eval_result c ON c.case_id = b.case_id AND c.run_id = 'grading-v7-2026-10-24'
WHERE b.run_id = 'grading-v6-2026-10-17'
GROUP BY b.slice
ORDER BY b.slice;`, "paired counts per slice"),
        p("Read the decision for each group in a fixed order, the same order the gate uses:"),
        numbered([
            "**Enough data?** If `n` is below the minimum sample, the status is insufficient data and nothing else is checked. Rust ownership (18 cases) stops here.",
            "**Dropped more than the limit?** JS async: `100 * (27 - 22) = 500 > 5 * 32 = 160`, regressed. Python recursion: `100 * 4 = 400 > 5 * 90 = 450` is false, so a 4.4-point drop is within the slice limit.",
            "**Overall only: significant?** `m = 39 + 18 = 57`, the table entry for 57 is 36, and 39 >= 36, so the overall drop is also significant.",
            "**Decision.** Any regressed group fails the change. Otherwise any group with insufficient data sends it to review. Only when every group has enough data and none regressed does the gate pass.",
        ]),
        p("For v7 the decision is fail, with these reasons: the overall drop of 4.2 points (limit 2), the significant flips (39 against 18), JS async and SQL joins over the slice limit, and Rust ownership with insufficient data. Each reason names a group and a number someone can check in the table."),
        h3("Wiring it into CI"),
        code("yaml", `
# .github/workflows/grading-prompt.yml (excerpt)
- name: Record outputs for the candidate prompt (once per prompt version)
  run: npm run eval:record -- --prompt prompts/grading/v7.md --set evals/grading-500.jsonl
- name: Regression gate v6 -> v7
  run: npm run eval:gate -- --baseline grading-v6 --candidate grading-v7 --config evals/gate.json
  # exits 1 on "fail", 2 on "review" (a required reviewer must approve), 0 on "pass"
- name: Keep the report
  uses: actions/upload-artifact@v4
  with: { name: gate-report, path: eval-reports/gate-v6-v7.json }`, "CI step"),

        h2("5. Write the gate"),
        p("Write the gate the CI step calls. It receives both runs and the configuration, validates the input (duplicate case ids, a case whose slice changed between runs), pairs the cases, computes the overall and per-slice statistics, applies the minimum sample, both drop limits and the sign rule, and returns the decision with every reason in a fixed order."),
        challenge("chal_coding_lle_212"),

        h2("6. How to verify the gate itself"),
        bullets([
            "**A/A run.** Compare v6 with itself (the same recordings under two run ids). The report must say `pass` with every delta at 0 and no flips. Anything else is a bug in pairing or counting.",
            "**A planted regression.** Copy the v6 results, flip 8 passing cases of one slice of 120 to fail, and run the gate: that slice must be regressed (`100 * 8 = 800 > 5 * 120 = 600`). Flip 6 and it must not be (`600 > 600` is false). This pins the boundary.",
            "**unpaired must be 0 in CI.** A non-zero count means a case crashed or was skipped in one run. Fail the job on it, or at least print it in the PR comment.",
            "**Cross-check with the SQL above.** The per-slice counts from the database and from the gate's report must match exactly.",
            "**Keep the report as an artifact.** When someone asks in three months why v8 was blocked, the reasons and the numbers are in the build, not in a chat thread.",
        ]),

        h2("7. Common mistakes and how to spot them"),
        bullets([
            "**Hand-picked examples as evidence.** Spot it: the PR shows a handful of cases, all from one area, often the ones the change was written for. Ask for the gate report instead.",
            "**Comparing with an old number.** \"v6 scored 82% last month\" was measured on a different set. Spot it: the two runs have different case counts, or `unpaired` is not 0.",
            "**Only the overall average.** A slice can fall 10 points while the total moves 1. Spot it: the report has no per-slice rows, or nobody reads them.",
            "**Small slices counted as passed.** A slice of 12 cases with no failure check is reported as `ok`. Spot it: the gate has no minimum sample, or the decision is `pass` while some group has too few cases.",
            "**Re-running until green, or moving the limit after the fact.** Spot it: several gate runs on one PR with different configs, or a config change in the same PR as the prompt change. Limits change in their own reviewed PR.",
        ]),

        h2("8. Summary"),
        bullets([
            "Compare prompt versions on the same cases: pair them by case id, count unpaired cases, and let the flips carry the signal.",
            "Check the total and every slice, each with its own drop limit, and report groups below the minimum sample as insufficient data - never as a pass.",
            "Ask two questions: is the drop bigger than the limit, and is it real (a sign test on the flips with a precomputed table)? Turn the answers into pass, review or fail with reasons in CI.",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Take the eval results of your own LLM feature (or the recorded runs from lessons 1.1 and 1.2), store them in a table like eval_result, and run the paired SQL query for two prompt versions. Then do the A/A run and the planted regression from section 6 against your gate, and write down in one paragraph which minimum sample and which limits you chose and why."),
    ],
});
