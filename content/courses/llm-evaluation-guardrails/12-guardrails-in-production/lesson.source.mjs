// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-lle-4-3",
    title: "Guardrails in production: budgets, fallbacks & human review",
    slug: { _type: "slug", current: "guardrails-in-production-budgets-fallbacks-human-review" },
    description:
        "A reworded grading prompt broke the output format on a Friday evening: the retry loop quadrupled model calls, learners waited minutes for a score, and results near the pass mark went out without anyone looking. Put the course together as layers that each assume the one before can fail: input checks, output validation, budgets and rate limits against unbounded consumption, fallbacks, human review bands for scores, labels that tell learners what the AI did, an incident response for a bad prompt release, and the measurement of every guardrail's false positives.",
    estimatedTime: 25,

    scenario: {
        role: "Tech lead of the AI grading assistant, CodeDev learning platform",
        problem:
            "At 18:05 on Friday the team releases grade-v14, a reworded grading rubric that scored better on the eval set. By 19:30 the model bill for the grading feature is at four times a normal day, the grading queue is 40 minutes behind, and the support inbox has learners asking why a 'Passed' badge appeared on code that fails two tests. Nobody can say how many results are affected, and the prompt lives in the code, so rolling back means a deploy.",
    },

    content: [
        h2("1. The incident: every guardrail worked, alone"),
        p("Each piece of the grading assistant had a guardrail. Output validation from lesson 3.3 rejected malformed JSON. The renderer from lesson 4.1 was safe. The leak check from lesson 4.2 ran. And yet one prompt change produced a cost spike, a slow queue and wrong published results in 85 minutes. The dashboards at 19:30:"),
        code("text", `
grading, prompt_version = grade-v14, 18:05-19:30
  submissions graded        4,180
  model calls              17,904    (4.3 per submission, normally 1.02)
  schema validation fails      38%   (normally 1.2%)
  p95 time to score          4m 10s  (normally 9s)
  spend                     4.1x a normal day, still rising
  published 'passed'           612   (AI score >= 70, tests passed: 2 of 5 on 97 of them)`, "Grafana, grading overview"),
        p("The parts did what they were built for; what was missing was the system around them. Validation rejected bad outputs, and the worker's answer was to call the model again, up to five more times. Nothing limited the total spend. Nothing held back a score that disagreed with the tests. Learners could not tell which parts of their result came from a model. And the only way back was a deploy."),

        h2("2. Read the evidence"),
        p("Traces that carry the prompt version (lesson 2.2) turn \"something is wrong\" into numbers you can query. Two queries frame the whole incident:"),
        code("sql", `
-- how many calls did each submission cost, per prompt version?
SELECT prompt_version, count(DISTINCT submission_id) AS submissions,
       count(*) AS calls, round(count(*)::numeric / count(DISTINCT submission_id), 2) AS calls_per_submission,
       round(avg((validation_status = 'failed')::int) * 100, 1) AS failed_pct
FROM llm_call WHERE feature = 'grading' AND started_at > now() - interval '3 hours'
GROUP BY 1;

 prompt_version | submissions | calls  | calls_per_submission | failed_pct
----------------+-------------+--------+----------------------+-----------
 grade-v13      |         310 |    316 |                 1.02 |        1.2
 grade-v14      |        4180 |  17904 |                 4.28 |       38.0

-- which published results disagree with the tests?
SELECT count(*) FROM grading_result
WHERE prompt_version = 'grade-v14' AND published_status = 'passed' AND tests_passed < tests_total / 2;
 count
-------
    97`, "psql: traces and results"),
        p("The first query says the cost came from retries, not from more learners. The second says the damage is not only money: some stored, published decisions are wrong. Keep both numbers in mind; they need different fixes."),

        h2("3. Core idea: layers that assume the previous one failed"),
        p("A guardrail is a check with a decision attached: allow, block, fall back, or send to a person. One layer is never enough, because each layer has blind spots (you measured some in lesson 4.2). Arrange them along the path of a request, and design each one as if the one before it had let something through:"),
        numbered([
            "**Input checks** - before the model: size and token limits on the submission, allowed file types, per-user rate limits. Heuristics such as injection phrase lists are a **signal** (log it, route to review), rarely a good gate: they block honest learners whose code quotes the phrase.",
            "**Output validation** - after the model: the schema and ranges from lesson 3.3, the leak check from lesson 4.2, and safe rendering from lesson 4.1. Invalid output never reaches storage.",
            "**Budgets and rate limits** - around every call: a token cap per call, an attempt budget per submission, a quota per learner, a spend cap per feature per day. OWASP calls their absence Unbounded Consumption (LLM10): cost and availability you do not control.",
            "**Fallbacks** - when a layer says no: a degraded but correct answer. For grading that is the tests-only score and a neutral message; the learner is never blocked by the model being down or wrong.",
            "**Human review bands** - for decisions that matter: publish automatically only where the model and the deterministic evidence agree and the score is far from the pass mark; send the rest to a person.",
            "**Labels for users** - at the end: tell learners which parts came from AI, what it is based on, and how to ask a person.",
        ]),
        callout("info", "When not to add a layer",
            "Every layer costs latency, money, reviewer time or false positives. A low-stakes feature (a suggested lesson title an author edits anyway) may need only budgets and output validation. Add a layer when you can say which failure it stops and how you will measure it; a guardrail without a metric is a guess that slows everything down."),
        h3("Budgets: bound the worst case, not the average"),
        p("The retry loop was written for transient errors - a timeout, a 429. A prompt that breaks the format is not transient: the same prompt fails the same way on most retries, so each extra attempt mostly adds cost and queue time. Budgets turn the worst case into a number you chose:"),
        bullets([
            "**Per call:** `max_tokens` sized for the expected output (a grading JSON needs a few hundred tokens, not 4,000), and a timeout.",
            "**Per submission:** an attempt budget (for example 2), counting every reason for a retry; after it, the fallback.",
            "**Per learner:** a rate limit on gradings per hour, so one script cannot spend the feature's budget.",
            "**Per feature:** a daily spend cap with a circuit breaker: above it, the feature switches to the fallback and pages someone, instead of silently spending.",
        ]),
        h3("Human review bands"),
        p("A model score next to a deterministic signal - the tests - tells you when to trust it. Publish automatically when the two agree and the score is far from the pass mark; review the rest. The band is a product decision with a cost: every reviewed submission takes a person's time, so size it with the review queue's capacity, and sample a few results outside the band too, or you will never learn whether the band is right."),
        h3("Labels: say what the AI did"),
        p("Learners deserve to know which part of their result was written by a model, as the AI & LLM Foundations course discussed for the CodeDev tutor: the EU AI Act's transparency duties (Article 50) and its treatment of AI that evaluates learning outcomes as high-risk point the same way, and the details belong to a lawyer, not to this lesson. In product terms: label the feedback as AI-generated, say what the score is based on (\"Score from 5 tests; feedback written by AI and may be wrong\"), mark results that a person reviewed, and give a visible way to ask for a human review."),

        h2("4. Worked example: one grading call with all the layers"),
        p("The code below is the grading worker after the incident. The layers are explicit and each one records its decision, so a dashboard can count them:"),
        code("typescript", `
// grading/worker.ts
const POLICY = {
  maxAttempts: 2,                 // per submission, every retry reason counts
  maxTokens: 600,
  passMark: 70,
  reviewBand: [60, 80] as const,  // scores near the pass mark go to a person
  maxDisagreement: 20,            // |model score - tests score| above this goes to a person
};

export async function grade(sub: Submission): Promise<GradingResult> {
  const testsScore = Math.round((sub.testsPassed / sub.testsTotal) * 100);
  const fallback = (reason: string): GradingResult =>
    ({ score: testsScore, feedback: NEUTRAL_FEEDBACK, source: "tests-only", reason, review: false });

  if (!inputOk(sub)) return fallback("input-rejected");            // size, type, rate limit
  if (await spend.isOverDailyCap("grading")) return fallback("budget");

  for (let attempt = 1; attempt <= POLICY.maxAttempts; attempt++) {
    const out = await model.generate(buildGradingPrompt(sub), { maxTokens: POLICY.maxTokens, timeoutMs: 20_000 });
    await spend.record("grading", out.usage);
    const parsed = parseGrading(out.text);                         // schema + ranges, lesson 3.3
    if (!parsed.ok) continue;
    if (checkFeedback(parsed.value.feedback, refsFor(sub)) !== "allowed") return fallback("leak");

    const { score, feedback } = parsed.value;
    const review = (score >= POLICY.reviewBand[0] && score < POLICY.reviewBand[1])
      || Math.abs(score - testsScore) > POLICY.maxDisagreement;
    return { score, feedback, source: "model", reason: "ok", review };
  }
  return fallback("invalid-output");
}`, "worker.ts"),
        p("Results with `review: true` are stored but not published until a person confirms them; the learner sees \"Your result is being reviewed\" and the tests-only score in the meantime. Run grade-v14's numbers through this code: at most 2 calls per submission, and the 97 \"passed\" results with fewer than half the tests passing all land in review, because the model and the tests disagree by far more than 20 points."),
        h3("Prompt versions are configuration, not code"),
        code("yaml", `
# config/grading.yaml - read at runtime, changed without a deploy
prompt:
  active: grade-v13
  canary:
    version: grade-v14
    percent: 5                      # 5% of gradings, chosen per submission id
    abort_if:
      validation_failed_pct: "> 5"  # compared with the active version over the last 200 calls
      calls_per_submission: "> 1.3"
      review_rate: "> 2x active"`, "grading.yaml"),
        p("A prompt that passed the regression gate (lesson 2.1) still meets real traffic for the first time in production. A canary on a small share of gradings, with automatic abort conditions on the same numbers as the dashboard, would have stopped grade-v14 after a few hundred calls instead of 17,904."),

        h2("5. Incident response for a bad prompt release"),
        p("When a release goes wrong anyway, work in this order. The first steps stop the damage, the later ones repair it:"),
        numbered([
            "**Stop:** switch the active prompt back (a config change, minutes), or trip the feature to its fallback if the old version is also suspect.",
            "**Confirm:** watch the same numbers that alerted you - validation failures, calls per submission, review rate - return to normal for the new gradings.",
            "**Find the affected results:** every result carries the prompt version that produced it. Query them; this is the reason traces and results record it.",
            "**Repair:** re-grade the affected submissions with the good version or send them to review; correct published results that change, and tell the learners whose result changed, in plain words.",
            "**Learn:** write the postmortem, add the inputs that broke grade-v14 to the eval set, and add the missing check to the regression gate, so the same release fails in CI next time.",
        ]),
        code("sql", `
-- step 3: results to repair, oldest first
SELECT r.submission_id, r.score, r.published_status, s.learner_id
FROM grading_result r JOIN submission s ON s.id = r.submission_id
WHERE r.prompt_version = 'grade-v14'
ORDER BY r.created_at;`, "psql: affected results"),
        callout("warning", "A rollback is not a repair",
            "Switching the prompt back changes what happens next. Results already stored, published or emailed stay exactly as wrong as they were. An incident is closed when the affected results are repaired and the people affected are told, not when the graph looks normal again."),

        h2("6. Measuring guardrails, false positives included"),
        p("A guardrail that blocks too much is also an incident, just a quieter one: honest learners get the fallback, reviewers drown, and the team learns to switch the guardrail off. Measure each guardrail, per rule, with three numbers:"),
        bullets([
            "**Block rate:** how often it fires, per rule and per prompt version. Alert on sudden changes in either direction. It says nothing about correctness on its own.",
            "**Precision of blocks:** label a random sample of blocked items every week. The share that really needed blocking is the precision; the rest are false positives, and each one is a learner treated as an attacker.",
            "**Misses:** label a random sample of allowed items too. That is where false negatives hide, like the renamed copy in lesson 4.2.",
        ]),
        code("text", `
guardrail              fired (30 d)   labelled   real   false pos.   precision   action
output schema               1.3%          200     200        0         1.00      keep as gate
leak check                  0.4%          120      97       23         0.81      keep, tune identifiers list
injection phrase list       2.1%          200      52      148         0.26      demote to signal + review`, "monthly guardrail review"),
        p("The table turns opinions into decisions. A gate with low precision becomes a signal; a signal that never finds anything gets deleted. Put the labelled samples into the eval set, so the next change to a rule is measured on them before it ships."),

        challenge("chal_quiz_lle_431"),

        h2("7. How to verify the whole system"),
        bullets([
            "**Game day with a fake model.** In staging, replace the model with a fake that returns invalid JSON 40% of the time, then one that leaks a hidden output, then one that times out. Check that calls per submission stay within the budget, the fallback is used, the review queue fills, and the alerts fire.",
            "**Budget alarms.** Spend per feature per hour and calls per submission are on the dashboard with alert thresholds, and the daily cap has been tested by lowering it in staging.",
            "**Rollback drill.** Time how long it takes to switch the active prompt and confirm the new gradings use it. If the answer is \"a deploy\", that is the first thing to fix.",
            "**Label check.** Open a result page as a learner: is the AI-written part labelled, is it clear what the score is based on, and does the review request reach a person?",
        ]),

        h2("8. Common mistakes"),
        bullets([
            "**Unlimited retries on invalid output.** Spot it: calls per submission rise with the validation failure rate; any number above about 1.1 deserves a look.",
            "**A spend alert without a cap.** Spot it: the alert fires at night and the spending continues until someone wakes up; the circuit breaker should switch to the fallback on its own.",
            "**Publishing every model score automatically.** Spot it: no review state in the results table, and model scores that contradict the tests are visible to learners.",
            "**Judging a guardrail by its block rate.** Spot it: nobody has labelled what it blocked; ask for its precision and the answer is a guess.",
            "**Treating a rollback as the end of the incident.** Spot it: no query of affected results in the incident log, no re-grading, no message to the learners.",
        ]),

        h2("9. Summary"),
        numbered([
            "Guardrails are layers along the request - input checks, output validation, budgets, fallbacks, human review bands and labels - each designed as if the previous one failed, and each recording its decision.",
            "Bound the worst case with budgets per call, per submission, per learner and per feature, and make the fallback a correct, degraded answer. Release prompts as configuration with a canary and abort conditions.",
            "Respond to a bad release by stopping, confirming, finding and repairing affected results, then learning through the eval set; and measure every guardrail's precision and misses on labelled samples, not by its block rate.",
        ]),

        h2("Sources"),
        bullets([
            "OWASP Top 10 for Large Language Model Applications: LLM10 Unbounded Consumption, LLM05 Improper Output Handling - owasp.org/www-project-top-10-for-large-language-model-applications",
            "OpenTelemetry semantic conventions for generative AI (model, token usage and attributes on every call) - opentelemetry.io/docs/specs/semconv/gen-ai/",
            "EU AI Act (Regulation (EU) 2024/1689), Article 50 transparency obligations and Annex III point 3 (education) - eur-lex.europa.eu",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "For one LLM feature you run, draw its request path and write the guardrail at each step, with the metric that shows it working. Find the worst case of calls and spend per request and per day today, and write the budget that bounds it. Then write the incident runbook for a bad prompt release: how to switch the prompt back, the query that finds the affected results, and who tells the users. Run it once as a drill and time it."),
    ],
});
