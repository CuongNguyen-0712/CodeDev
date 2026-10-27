// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-lle-1-3",
    title: "LLM-as-judge: measuring agreement with people",
    slug: { _type: "slug", current: "llm-as-judge-measuring-agreement-with-people" },
    description:
        "An LLM judge agreed with mentors on 91% of submissions and replaced their spot-checks - and then let 17 of 20 failing submissions through. Learn why raw agreement misleads when one label dominates, how to compute Cohen's kappa with its confusion matrix, observed and expected agreement, why kappa must be read per slice, which ranges teams treat as good enough, and how to detect position, verbosity and self-preference bias with recorded swap experiments.",
    estimatedTime: 30,

    scenario: {
        role: "Backend engineer on the AI grading assistant, CodeDev learning platform",
        problem:
            "Mentors spot-checked 200 AI-graded submissions a week. To save their time, the team introduced an LLM judge that labels each AI-graded submission pass or fail, after a calibration run showed 91% agreement with the mentors. Three weeks later a mentor audit found that most submissions mentors would have failed had been labelled pass by the judge. In the same month, a pairwise judge declared the new feedback prompt the winner in 71% of comparisons - with the new prompt's answer always shown first.",
    },

    content: [
        h2("1. The incident: 91% agreement that missed most failures"),
        p("Lessons 1 and 2 gave the grading assistant an eval set and a runner for hard rules. Some questions cannot be answered by a rule, for example: **was the AI's verdict on this submission right?** Mentors answer that, but mentor time is the scarcest thing on the platform. So the team asked a second model, the **judge**, to read the submission, the tests, the AI grader's verdict and feedback, and to label the verdict `pass` (acceptable) or `fail` (a mentor would change it)."),
        p("Before trusting it, they ran a calibration: 200 AI-graded submissions labelled by both mentors and the judge."),
        code("text", `
calibration run judge-v1, 200 submissions
labels agree: 182 / 200 = 91.0%
decision: replace the weekly mentor spot-check with judge-v1, mentors review only judge "fail"`, "calibration summary"),
        p("Three weeks later a mentor re-checked a random sample of submissions the judge had labelled `pass`. Many verdicts were wrong: hard-coded outputs graded as correct, Go solutions failed for Python reasons. Laid out as a table, the calibration run had shown the problem all along:"),
        code("text", `
                       judge: pass   judge: fail   total (human)
human: pass                179             1            180
human: fail                 17             3             20
total (judge)              196             4            200`, "confusion matrix of the calibration run"),
        p("The judge said `pass` to 196 of 200 submissions. Because 90% of the AI grader's verdicts really are fine, a judge that says `pass` every time would have agreed 90% of the time. The 91% was almost entirely the easy majority. On the 20 submissions that mattered - the ones mentors would fail - the judge caught 3."),

        h2("2. Read the evidence: agreement that chance alone would give"),
        p("Raw agreement, also called observed agreement, is the share of items where both raters gave the same label. It is a fine number when labels are balanced and a misleading one when one label dominates. The fix is to ask how much agreement you would expect **by chance**, given how often each rater uses each label, and to measure the agreement above that."),
        p("From the table: humans say `pass` 180/200 = 0.90 of the time, the judge 196/200 = 0.98. If the two raters labelled independently at those rates, they would both say `pass` 0.90 x 0.98 = 0.882 of the time and both say `fail` 0.10 x 0.02 = 0.002 of the time. That is 88.4% agreement from label frequencies alone. The judge's 91% is 2.6 points above it."),

        h2("3. Core idea: Cohen's kappa"),
        p("Cohen's kappa (1960) turns that comparison into one number:"),
        code("text", `
observed  po = (items on the diagonal) / n
expected  pe = sum over categories c of  (row total of c / n) x (column total of c / n)
kappa      k = (po - pe) / (1 - pe)

calibration run:  po = (179 + 3) / 200 = 0.910
                  pe = 0.90 x 0.98 + 0.10 x 0.02 = 0.884
                  k  = (0.910 - 0.884) / (1 - 0.884) = 0.026 / 0.116 = about 0.22`, "kappa, by hand"),
        bullets([
            "**k = 1**: perfect agreement. **k = 0**: no better than chance given the label frequencies. **k < 0**: worse than chance - the raters systematically disagree.",
            "The denominator `1 - pe` is the room for agreement that chance leaves. Kappa is the share of that room the raters actually use.",
            "**Undefined case:** if every label from both raters is the same single category, `pe = 1` and the formula divides zero by zero. Report kappa as undefined (null) with that reason, not as 0 or 1: the data says nothing about whether the judge can tell categories apart.",
            "**Missing labels:** an item where the judge returned nothing (timeout, refusal, unparseable output) or a mentor skipped it is not a disagreement. Leave it out of kappa, count it separately, and watch that count: a judge that fails on exactly the hard items looks better than it is.",
            "**More than two categories:** the same formulas work for scores 1-5 with a 5 x 5 matrix. Plain kappa treats a 4-vs-5 disagreement the same as 1-vs-5. When near-misses should count as partial agreement, teams use a weighted kappa (linear or quadratic weights); the exercise below uses the plain one.",
        ]),
        h3("Which kappa is good enough?"),
        p("There is no universal threshold, and you should be suspicious of anyone who gives you one. The most quoted bands come from Landis and Koch (1977): 0.41-0.60 \"moderate\", 0.61-0.80 \"substantial\", above 0.80 \"almost perfect\". The authors themselves called the bands arbitrary, and later reviews (McHugh, 2012) argue they are too generous when decisions affect people. A practical way to decide for the grader:"),
        bullets([
            "**Measure mentors against mentors first.** If two mentors reach kappa 0.75 on verdicts, that is the ceiling; expecting the judge to reach 0.9 is unrealistic, and a judge at 0.7 is close to a mentor.",
            "**Match the threshold to the decision.** Many teams want roughly 0.6-0.7 or more, close to human-human agreement, before a judge gates anything on its own, and accept lower values for a dashboard trend that a person reads.",
            "**Look at the matrix, not only the number.** Two judges with the same kappa can fail differently. For the grader, the cell \"human fail, judge pass\" is the expensive one; report its count next to kappa.",
            "**Report the sample.** A kappa from 40 items moves a lot from run to run. Calibrate on a few hundred items and repeat when the judge prompt or model changes.",
        ]),
        h3("When not to use a judge"),
        bullets([
            "**When a rule can decide.** Score range, JSON shape, a forbidden phrase: use the assertions from lesson 2. They are free, exact and never drift.",
            "**When you have not measured it.** A judge without a calibration run against people is an unmeasured opinion with a confident tone.",
            "**As the only gate on a high-stakes decision.** For the grader, a judge can route submissions to mentors (\"review these first\"), but a learner's grade should not depend on an unreviewed judge label.",
        ]),

        h2("4. Read kappa per slice"),
        p("Overall kappa is an average over very different populations. The calibration set of the fixed judge (`judge-v2`, with a rubric and the test results in its prompt) gives:"),
        code("text", `
slice              n     observed   expected   kappa
python/easy       60       0.95       0.81      0.74
typescript/hard   40       0.83       0.52      0.64
go/medium         30       0.80       0.62      0.47
adversarial       30       0.70       0.50      0.40
overall          160       0.85       0.63      0.59`, "judge-v2, kappa per slice"),
        p("The overall 0.59 hides a judge that is useful on Python and close to useless on adversarial submissions, which is the slice where a wrong `pass` hurts most. Decide per slice: the judge may pre-screen Python and TypeScript, while Go and adversarial submissions keep going to mentors. Remember lesson 1: a slice of 30 items gives a wide uncertainty, so treat per-slice kappas as a reason to look closer, not as precise numbers."),

        challenge("chal_quiz_lle_131"),

        h2("5. Judge biases you can measure"),
        p("A judge is a model, and models have systematic preferences that have nothing to do with quality. Three are well documented for pairwise comparisons (Zheng et al., 2023) and all three appeared at CodeDev:"),
        bullets([
            "**Position bias.** In \"which of these two answers is better?\", many judges prefer the answer in a particular position, often the first. The team compared feedback from `grader-v8` and `grader-v9` with `v9` always shown first, and `v9` won 71% of the time.",
            "**Verbosity bias.** Judges tend to prefer the longer answer, even when the extra length adds nothing. For learner feedback that is backwards: mentors prefer short, specific feedback.",
            "**Self-preference.** A judge tends to rate outputs from its own model family higher. If the grader and the judge are the same model, the judge is partly grading itself.",
        ]),
        h3("The swap experiment"),
        p("Position bias is easy to measure: ask the judge every comparison twice, once as A-then-B and once as B-then-A. A consistent judge names the same answer both times. A **flip** - A wins when A is first and B wins when B is first - means the position decided, not the content."),
        code("typescript", `
// evals/judge/swap.ts - record both orders for every pair (fake judge in tests, real one nightly)
type Winner = "A" | "B" | "tie";
type SwapRecord = { id: string; original: Winner; swapped: Winner; longer: "A" | "B" };

async function recordSwap(pair: { id: string; a: string; b: string }, judge: Judge): Promise<SwapRecord> {
  const first = await judge.compare(pair.a, pair.b);          // returns "first" | "second" | "tie"
  const second = await judge.compare(pair.b, pair.a);
  return {
    id: pair.id,
    original: first === "tie" ? "tie" : first === "first" ? "A" : "B",
    swapped: second === "tie" ? "tie" : second === "first" ? "B" : "A",   // map back to content
    longer: [...pair.a].length >= [...pair.b].length ? "A" : "B",
  };
}`, "swap.ts"),
        p("The detail that matters is the last mapping: in the swapped call, \"first\" means answer B. Record winners by **content** (A or B), never by position, or every comparison looks consistent."),
        p("For verbosity, build pairs that differ only in length: take a feedback text and make a padded copy with the same points plus filler (\"Great effort! It is worth noting that...\"). A judge without verbosity bias should mostly call these pairs a tie or pick the shorter one. If it consistently picks the padded copy, length is buying score."),
        p("Decide the rules before you look at the numbers, and write them into the report, for example: **position bias** when more than 20% of pairs flip; **verbosity bias** when the padded answer wins more than half of the consistent verdicts on same-content pairs. These are screening rules for when to investigate, not statistical tests; with 20 pairs, one or two flips more or less changes the verdict."),
        h3("Mitigations"),
        bullets([
            "**Position:** always run both orders, and count a win only when both orders agree; treat flips as ties. Randomising the order alone hides the bias in the noise instead of removing it.",
            "**Verbosity:** say in the rubric that length is not quality, give a length budget, and keep the padded-pair check in the nightly run to see whether the rubric worked.",
            "**Self-preference:** use a judge from a different model family than the system under test where you can, and in any case keep calibrating against mentors; agreement with people is the only test that covers biases you have not thought of.",
            "**Pin the judge.** The judge prompt and model are versioned like the grader's. A judge upgrade means a new calibration run before its numbers are compared with the old ones.",
        ]),

        h2("6. Your turn: kappa, slices and bias flags"),
        p("Write the calibration report the team should have had: the confusion matrix, observed and expected agreement and kappa overall and per slice, with missing labels skipped and the single-category case reported as undefined; then the position and verbosity flags from a recorded swap experiment. The exact rules are in the challenge description and the starter."),
        challenge("chal_coding_lle_132"),

        h2("7. How to verify a judge before trusting it"),
        bullets([
            "**Calibration set with human labels.** A few hundred items from the eval set of lesson 1, labelled by mentors with the same guideline, never shown to the judge prompt as examples.",
            "**Human-human baseline.** Kappa between two mentors on the same items. It is the realistic target and tells you how much of the judge's disagreement is real ambiguity.",
            "**Report by slice with the matrix.** Kappa, n, skipped (missing labels) and the expensive cell, per slice, with the judge and prompt versions.",
            "**Swap and padded-pair runs.** Recorded nightly; the flags go red when the rules you wrote down trip.",
            "**Re-calibrate on change.** New judge model, new judge prompt or a big shift in traffic: new calibration run before the judge's numbers are used again.",
        ]),

        h2("8. Common mistakes"),
        bullets([
            "**Raw agreement on unbalanced labels.** Spot it: the report says \"91% agreement\" and the label distribution is 90/10; a constant judge would score almost the same.",
            "**Counting missing labels as disagreements (or dropping them silently).** Spot it: n in the report differs from the number of items and nobody can say why, or the judge's timeouts cluster in one slice.",
            "**One overall kappa.** Spot it: no per-slice table, and the slice the decision is about (adversarial, hard) has a fraction of the items.",
            "**One-order pairwise comparisons.** Spot it: the candidate is always shown in the same position, and its win rate drops when someone swaps the order.",
            "**Same model as judge and as system under test.** Spot it: the judge config and the grader config name the same model, and there is no human calibration to compare with.",
        ]),

        h2("9. Summary"),
        bullets([
            "Raw agreement includes the agreement chance gives you; Cohen's kappa = (po - pe) / (1 - pe) measures what is above it, with missing labels skipped and the single-category case reported as undefined.",
            "Read kappa per slice and next to the confusion matrix and the human-human baseline; ranges like 0.6-0.8 are conventions, so tie the threshold to the decision the judge will make.",
            "Judges have position, verbosity and self-preference bias: record both orders and padded pairs, write the flag rules down in advance, and keep people in the loop for high-stakes labels.",
        ]),

        h2("Sources"),
        bullets([
            "Cohen, J. (1960). A coefficient of agreement for nominal scales. Educational and Psychological Measurement, 20(1).",
            "Landis, J. R. and Koch, G. G. (1977). The measurement of observer agreement for categorical data. Biometrics, 33(1).",
            "McHugh, M. L. (2012). Interrater reliability: the kappa statistic. Biochemia Medica, 22(3).",
            "Zheng, L. et al. (2023). Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena (position, verbosity and self-enhancement bias).",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Take 50 outputs of any LLM feature you work on, label them yourself, ask a colleague to label them independently, and compute kappa between you two before you compute it for any judge. Then write down, in one sentence each, the threshold you would require and the decision the judge would be allowed to make."),
    ],
});
