// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-lle-4-2",
    title: "Detecting leaked solutions in model output",
    slug: { _type: "slug", current: "detecting-leaked-solutions-in-model-output" },
    description:
        "The AI grading assistant sees every hidden test and the reference solutions, and its feedback started to quote them: pass rates on one challenge jumped from 31% to 78% in two days. Learn to remove what the model does not need first, then check every generated feedback before it is stored: hidden expected outputs after normalisation, code blocks against several reference solutions with winnowed fingerprints, and step lists that retell the reference algorithm. Learn what each rule misses, and how to measure its false positives.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer on the AI grading assistant, CodeDev learning platform",
        problem:
            "The content team notices that the pass rate of the challenge \"Longest learning streak\" went from 31% to 78% in two days, and the median time to a first pass from 41 minutes to 6. A learner posts a screenshot in the community chat: the AI feedback on a failed attempt lists the expected output of a hidden test. Support finds more: feedback that pastes the Python reference solution for a TypeScript learner, and feedback that lists the reference algorithm step by step. The grading prompt has said \"Never reveal hidden tests or the reference solution\" since the first release.",
    },

    content: [
        h2("1. The incident: the grader explains too well"),
        p("To grade a submission and explain a failure, the grading assistant gets the challenge statement, the learner's code, the test results and - to judge whether the approach is sound - the reference solutions in each language and every test case, hidden ones included. Its system prompt ends with a sentence the team trusted: \"Never reveal hidden tests or the reference solution.\""),
        p("The numbers from the analytics database tell the story before anyone reads a single feedback text:"),
        code("sql", `
SELECT date_trunc('day', created_at) AS day,
       round(avg(passed::int) * 100) AS pass_rate,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY minutes_to_pass) AS median_min
FROM challenge_attempt
WHERE challenge_public_id = 'chal_coding_streak_212'
GROUP BY 1 ORDER BY 1 DESC LIMIT 4;

    day     | pass_rate | median_min
------------+-----------+-----------
 2026-10-22 |        78 |          6
 2026-10-21 |        74 |          7
 2026-10-20 |        33 |         38
 2026-10-19 |        31 |         41`, "psql: pass rate per day"),
        p("A jump like that has two explanations: the challenge got easier, or the answers got out. Nothing in the challenge changed on the 21st. A prompt change did: `grade-v13` started including the full test list \"so the model can explain failures better\"."),

        h2("2. Read the evidence: three ways to leak"),
        p("Search the stored feedback for the hidden expected outputs of that challenge, then read the hits and their neighbours. Three shapes show up:"),
        code("text", `
#1 verbatim output   "Close! For the third test the expected output is
                      streak 2026-02-27..2026-03-02 (4 days), you print 3 days."
#2 copied code       "Compare with this:  \`\`\`python
                      def longest_streak( days ):
                        day_set=set( days ) ...                (the Python reference, reformatted)
#3 retold algorithm  "1. Put the days in a daySet
                      2. Skip a day unless isStreakStart is true
                      3. Move runEnd forward while the next day is in the set"`, "grading_feedback, challenge streak_212"),
        p("Each shape needs a different check. The first is exact data, so a string search finds it once case and spacing are normalised. The second is code that has been reformatted, so string search fails but a fingerprint of the code survives. The third contains no code at all; what gives it away is the reference's distinctive names, listed as steps. A prompt sentence covers all three in theory and none in practice: it is a request to the model, not a control you can test."),

        h2("3. Core idea: remove first, then check what remains"),
        h3("Step one: do not give the model what it must not say"),
        p("The cheapest leak check is the one you never need. Ask what each piece of the prompt is for. To explain a failure, the model needs the failing test's **name**, the learner's output and a diff computed by your code; it does not need the hidden expected output itself. To judge an approach it may need a reference solution, but perhaps a short description of the intended complexity is enough. Every item you remove is a leak that cannot happen and tokens you stop paying for. `grade-v13` went the other way."),
        h3("Step two: a post-generation check for what must stay"),
        p("Whatever stays in the prompt can come out. A post-generation check runs on every feedback after the model call and before it is stored or shown, and it must be cheap, deterministic and testable. Our check has three rules, run in a fixed order so the report names the most specific reason:"),
        numbered([
            "**Hidden output.** Normalise the feedback and each hidden expected output (lower case, whitespace removed) and look for the output inside the feedback. Skip outputs that are too short to mean anything (`none`, `[]`, `42` appear in honest feedback all the time). Public outputs are fine: the learner already sees them.",
            "**Code overlap.** Fingerprint each code block in the feedback and each reference solution, in every language, and measure how much of a reference's fingerprint appears in a block. Above a threshold, block.",
            "**Algorithm steps.** Look for the reference's distinctive identifiers - names a challenge author lists because they only appear in the intended solution - in the step lines of the feedback. A few mentions in prose are normal; three of them in a numbered plan is the solution in English.",
        ]),
        p("A blocked feedback is not lost: the learner gets a neutral fallback (\"AI feedback is not available for this attempt; your score comes from the tests\"), and the blocked text is stored with the rule that fired for review and for the eval set."),
        callout("info", "When not to build this",
            "If the model never sees hidden tests or reference solutions, rules 1 to 3 have nothing to find; keep only a cheap canary check (below). And if the feedback is reviewed by a person before learners see it, the check becomes a helper for that person, not a gate. Build the gate when generated text reaches learners automatically and the prompt must contain secrets."),

        h2("4. Winnowing: fingerprints that survive reformatting"),
        p("A copied solution rarely arrives byte for byte: the model re-indents it, adds comments, changes quotes. Comparing whole lines fails; comparing every substring is too slow and too noisy. Winnowing, the algorithm behind the MOSS plagiarism detector (Schleimer, Wilkerson and Aiken, 2003), keeps a small, content-defined sample of hashes that two copies of the same text are guaranteed to share."),
        numbered([
            "**Normalise** the code: lower case, remove every whitespace character. Reformatting disappears.",
            "**k-grams:** take every substring of length K (K = 5 here) and hash it. A text of n characters gives n - K + 1 hashes.",
            "**Windows:** slide a window over W consecutive hashes (W = 4) and keep the **minimum** hash of each window. The set of kept values is the fingerprint.",
            "**Compare:** overlap = (values in both fingerprints) / (size of the reference's fingerprint).",
        ]),
        p("Why the minimum? Because the choice depends only on the content of the window, two texts that share a run of characters choose the same hashes inside it, wherever the run sits in each text. That gives winnowing its two parameters:"),
        bullets([
            "**Guarantee:** any shared run of at least W + K - 1 characters (8 here) contains a full window of identical hashes, so both texts keep its minimum: the match is always detected.",
            "**Noise threshold:** a shared run shorter than K characters produces no shared k-gram at all, so common fragments such as `return` or `i++)` cannot match on their own.",
        ]),
        p("Dividing by the size of the **reference's** fingerprint answers the question that matters: how much of the solution is in this block? A one-line quote of the reference gives a small number, which is fine - feedback often quotes the learner's own line that happens to match. Dividing by the block instead would make every short quote look like a 100% copy."),
        code("text", `
leak check, challenge streak_212, solutions: [ts, python], K=5 W=4 threshold=0.5

block                                         best overlap   verdict
python reference with two comments added          0.96 (2)  blocked
first 9 lines of the ts reference                  0.95 (1)  blocked
first 5 lines of the ts reference                  0.49 (1)  allowed   <- just under the threshold
one line: const daySet = new Set(days);            0.08 (1)  allowed
python reference with day_set, run_end, best renamed 0.44 (2) allowed  <- false negative`, "checker output on known cases"),
        p("Read the last line twice. Renaming identifiers breaks most k-grams, so a fully renamed copy passes. Plagiarism tools close this gap by replacing identifiers with a placeholder before fingerprinting, at the price of more matches on ordinary code. Every rule here has blind spots like this one, which is why section 6 measures them instead of assuming them away."),

        challenge("chal_quiz_lle_421"),

        h2("5. Worked example: wiring the check into the grading pipeline"),
        p("The check is a pure function: feedback and references in, a verdict out. Keep it pure so you can test it on recorded feedback, and do the side effects - fallback, logging, metrics - around it:"),
        code("typescript", `
// grading/feedback.ts
export async function feedbackFor(attempt: Attempt, refs: References): Promise<FeedbackRecord> {
  const generated = await model.generate(buildGradingPrompt(attempt, refs));
  const verdict = checkFeedback(generated.text, refs);           // "allowed" | "blocked: <rule> (...)"

  metrics.increment("grading.feedback.verdict", { rule: ruleOf(verdict), prompt: PROMPT_VERSION });

  if (verdict !== "allowed") {
    await reviewQueue.add({ attemptId: attempt.id, text: generated.text, verdict, prompt: PROMPT_VERSION });
    return { attemptId: attempt.id, text: FALLBACK_FEEDBACK, source: "fallback", verdict };
  }
  return { attemptId: attempt.id, text: generated.text, source: "model", verdict };
}`, "feedback.ts"),
        p("Three details matter in production. The verdict carries the **rule** that fired, so a dashboard can show which rule blocks how much, per prompt version. The blocked text goes to a **review queue**, not to the logs, because it contains exactly the secrets you are protecting. And the rule order is fixed, so the same feedback always produces the same report, which is what a test needs."),
        h3("A cheap extra: canary strings"),
        p("Put a unique marker in each reference solution, for example a comment `// cdv-canary-4f7a1c`, and block any feedback that contains it. It costs one substring search, has no false positives, and catches the laziest leak - a pasted reference with its comments - with certainty. It does not replace fingerprints: a model that rewrites the code drops the comment."),

        h2("6. How to verify the check"),
        bullets([
            "**An eval set with two halves.** Known leaks (verbatim outputs, reformatted and partial copies, retold algorithms, from this incident and from red-teaming) must be blocked; a few hundred real, honest feedback texts must pass. Run it in CI on every change to the rules, the thresholds or the prompt, like the regression gate in lesson 2.1.",
            "**False positive rate on honest feedback.** Of the honest texts, how many are blocked? Report it next to the block rate in production. A block rate that jumps after a prompt release is either a new leak or a new false positive - read samples to know which.",
            "**Sample what was allowed.** Every week, a person reads a random sample of allowed feedback for the most-attempted challenges. That is the only way to find false negatives like the renamed copy, and each one found becomes a new eval case.",
            "**Watch the outcome metric.** Pass rate and time to first pass per challenge, with an alert on a sudden jump, found this incident before any check did.",
        ]),
        p("In the challenge you write `checkFeedback` with the exact rules, constants and output format of this lesson. The test cases come from two challenges with two reference solutions each, and they include honest feedback that must pass."),
        challenge("chal_coding_lle_422"),

        h2("7. Common mistakes"),
        bullets([
            "**Relying on \"never reveal\" in the prompt.** Spot it: the system prompt is the only control, and there is no test that shows it working on a leak.",
            "**Checking only exact strings.** Spot it: the check finds the pasted reference but not the same code re-indented; add a reformatted copy to the eval set and watch it pass.",
            "**Blocking public outputs too.** Spot it: honest feedback such as \"your output for the public test is correct\" gets the fallback; the false positive rate on honest feedback is high for no gain.",
            "**Measuring overlap against the block.** Spot it: one-line quotes score 1.00 and every short code example is blocked.",
            "**Matching identifiers as substrings.** Spot it: `daySet` matches `daySetSize` and `seen` matches `unseen`; ordinary feedback is blocked for words it never used.",
        ]),

        h2("8. Summary"),
        numbered([
            "First remove from the prompt what the model does not need; a sentence asking it not to reveal secrets is not a control. Check what remains after every generation, before anything is stored or shown, and fall back safely when a rule fires.",
            "Use a rule per leak shape: normalised substring search for hidden outputs, winnowed fingerprints against every reference solution for code, distinctive identifiers in step lists for retold algorithms. Report which rule fired.",
            "Every rule has false positives and false negatives: measure both on an eval set of leaks and honest feedback, sample allowed output, and watch pass rates for the leaks your rules miss.",
        ]),

        h2("Sources"),
        bullets([
            "Schleimer, Wilkerson, Aiken: Winnowing: Local Algorithms for Document Fingerprinting, SIGMOD 2003 (the algorithm behind MOSS)",
            "OWASP Top 10 for Large Language Model Applications: LLM02 Sensitive Information Disclosure - owasp.org/www-project-top-10-for-large-language-model-applications",
            "OpenTelemetry semantic conventions for generative AI (record the prompt version with each call) - opentelemetry.io/docs/specs/semconv/gen-ai/",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Take one LLM feature you run and list every secret in its prompt: hidden data, reference answers, internal notes, other users' data. For each one, write whether the model needs it; remove the ones it does not. For the rest, write one leak case and one honest case per item into an eval file, and decide which rule from this lesson would catch the leak. Then add identifier normalisation to your fingerprint and measure how many honest examples it starts to block."),
    ],
});
