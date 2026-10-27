// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-lle-3-3",
    title: "Fix it: a model score written straight to the database",
    slug: { _type: "slug", current: "fix-model-score-written-straight-to-database" },
    description:
        "A new grading prompt went live and the CodeDev gradebook filled with scores of 11, -1 and 9.5, submissions with no score at all, and grading jobs dead-lettered on \"10/10\". The grading service wrote the model's reply straight into the database. Treat model output as untrusted input: parse it, validate type, range and length, reject instead of repairing, route rejections to human review, cap the AI score against the automated tests, and record every decision.",
    estimatedTime: 25,

    scenario: {
        role: "Backend engineer on the grading service, CodeDev learning platform",
        problem:
            "Tuesday 2026-11-10, the day after grading prompt v15 went live. An instructor reports that the course \"TypeScript Foundations\" shows an average AI score of 104% for one lesson. Support has tickets from learners whose submission page says \"Score: -1/10\", and the jobs dashboard shows 312 grading jobs in the dead-letter queue.",
    },

    content: [
        h2("1. The incident"),
        p("Prompt v15 asked the model for \"a score out of 10\" instead of \"an integer score from 0 to 10\", to make the feedback sound friendlier. The model took the new wording at face value. The grading service, unchanged since lesson 3.1's incident, did this with every reply:"),
        code("typescript", `
// services/grading/aiGrade.ts (unchanged since 2026-09)
const reply = await llm.complete({ model: "grader-large-2026-06", prompt, temperature: 0 });
const out = JSON.parse(reply.text);
await db.query(
  "UPDATE submissions SET ai_score = $1, ai_feedback = $2, status = 'graded' WHERE id = $3",
  [out.score, out.feedback, submission.id],
);`, "aiGrade.ts"),
        h3("The evidence"),
        code("sql", `
SELECT ai_score, count(*) FROM submissions
WHERE graded_at >= '2026-11-09 14:00' AND ai_score IS NOT NULL AND (ai_score NOT BETWEEN 0 AND 10 OR ai_score <> trunc(ai_score))
GROUP BY ai_score ORDER BY ai_score;

 ai_score | count
----------+-------
     -1.0 |    41
      7.5 |    96
      9.5 |   188
     11.0 |    23`, "psql, production read replica"),
        code("text", `
2026-11-09T14:22:31Z grading.job sub_4c1e attempt=5 error: invalid input syntax for type numeric: "10/10" -> dead-letter
2026-11-09T14:22:40Z grading.job sub_4c2a attempt=5 error: invalid input syntax for type numeric: "8/10" -> dead-letter
2026-11-09T14:23:02Z grading.job sub_4c31 status=graded ai_score=NULL (reply: {"feedback":"Clean solution, but ..."})`, "grading worker log"),
        p("Four symptoms, one cause. Numbers outside the range and decimals went straight in, because `ai_score` is `numeric(4,1)` and accepts them. Strings like `\"10/10\"` failed the statement, so the job was retried five times and dead-lettered, leaving the submission ungraded. A reply without `score` wrote `NULL` and marked the submission graded. And the -1s are the model's way of saying \"I could not grade this\" (the code did not compile), turned into a grade."),
        p("Notice what the evidence does **not** show: a single failure the code reported. Every bad reply either went in silently or crashed the job after it had been retried for nothing - a malformed reply does not get better on attempt five. The service had no state between \"graded\" and \"failed\", so there was nowhere to put a reply that was well-formed JSON but not a believable grade."),
        h3("What each reply should have become"),
        code("text", `
reply                                                tests   decision
{"score": 8, "feedback": "Clear names, ..."}         7/10    accepted, ai_score = 8
{"score": "10/10", "feedback": "Great work"}         10/10   review: score_not_integer
{"score": 11, "feedback": "Exceeds ..."}             10/10   review: score_out_of_range
{"score": 9.5, "feedback": "Almost ..."}             9/10    review: score_not_integer
{"score": -1, "feedback": "Could not grade: ..."}    0/10    review: score_out_of_range
{"feedback": "Clean solution, but ..."}              6/10    review: score_missing
{"score": 9, "feedback": "Perfect solution."}        3/10    review: above_test_cap`, "the target behaviour, one decision per reply"),
        p("The last row is not a format problem at all: it is a well-formed reply that the rest of the evidence contradicts. Validation of model output covers both: is this a valid value, and is it a value we are willing to let the model decide?"),

        h2("2. Core idea: model output is untrusted input"),
        p("Lessons 3.1 and 3.2 protected the model from its input. This lesson protects the rest of the system from the model's output. OWASP lists this separately as LLM05, Improper Output Handling: output passed to a database, a shell, a browser or another service without validation. The reply comes from a system that is non-deterministic across versions, sensitive to wording, and - as lesson 3.1 showed - steerable by whoever writes part of the prompt. Treat it exactly like a request body from the internet."),
        p("That means four rules, and each one answers part of the incident:"),
        numbered([
            "**Parse, then validate the shape.** The reply must be JSON, the JSON must be an object, `score` must be a JSON number that is an integer from 0 to 10, `feedback` a string with sensible length limits (here 10 to 1000 characters after trimming). Validate the type before the range: `\"10/10\" > 10` is false in JavaScript, so a range check alone lets the string through.",
            "**Reject, do not repair.** No `Number()`, no `parseInt`, no rounding, no clamping. A repaired value looks valid and erases the evidence that something went wrong: `parseInt(\"10/10\")` is 10, clamping 11 gives 10, clamping -1 gives a failing grade the learner did not earn. A rejected reply keeps the AI score empty and goes to human review with a reason.",
            "**Cap the influence of the AI score.** Decide what the model is allowed to change. Here the automated tests are the evidence and the AI judges what tests cannot (naming, structure, explanation): an AI score above `testScore + 2` is not accepted but sent to review as `above_test_cap`. State the rule in the code and in the docs, so learners and instructors can reason about it. This is also what makes the injection from lesson 3.1 cheap: a fooled model can lift a grade by at most two points before a human looks at it.",
            "**Record every decision.** One row per job: accepted, or review with the reason. It answers \"why does this learner have no AI score?\" in seconds, it shows when a prompt change starts producing a new kind of bad reply, and it is the audit trail an instructor needs before changing a grade.",
        ]),
        callout("info", "Structured outputs help, but do not replace validation",
            "Many model APIs can constrain a reply to a JSON schema. Use it: it removes most format errors such as \"10/10\" or text around the JSON. But a schema-valid reply can still be 9 for a submission that fails most tests, or carry a prompt-injected 10, and providers differ in which schema keywords they enforce. Keep the validation in your code, where tests can see it."),
        h3("When not to"),
        bullets([
            "**Do not send everything to review.** If 30% of replies are rejected, the queue is a second grading team you did not hire. Fix the prompt and the schema first and use the review queue for the exceptions; watch its size as a metric with an owner and a time limit for each item.",
            "**Do not validate what you can compute.** If a criterion can be tested, test it; then the model's number does not need a cap for that part at all.",
        ]),

        h2("3. Worked example"),
        p("In the production service the shape check is a schema, and each schema issue is mapped to one stable reason code. Here with zod; any schema library with type, integer, range and length checks works the same way:"),
        code("typescript", `
// services/grading/aiReply.ts
import { z } from "zod";

const AiReply = z.object({
  score: z.number().int().min(0).max(10),
  feedback: z.string().trim().min(10).max(1000),
});

export type ReplyDecision =
  | { outcome: "accepted"; score: number; feedback: string }
  | { outcome: "review"; reason: string };

export function decideReply(text: string, testScore: number, maxAboveTests = 2): ReplyDecision {
  let json: unknown;
  try { json = JSON.parse(text); } catch { return { outcome: "review", reason: "invalid_json" }; }
  const parsed = AiReply.safeParse(json);
  // reasonFrom maps the first issue (path + code) to score_missing, score_not_integer, score_out_of_range, ...
  if (!parsed.success) return { outcome: "review", reason: reasonFrom(parsed.error.issues[0]) };
  if (parsed.data.score > testScore + maxAboveTests) return { outcome: "review", reason: "above_test_cap" };
  return { outcome: "accepted", ...parsed.data };
}`, "aiReply.ts"),
        p("The function decides; it does not touch the database. The caller writes the score only for `accepted`, sends the submission to review otherwise, and records the decision in both cases - in one transaction, so a crash cannot leave a score without a decision. Keeping the decision pure also makes it trivial to test against recorded replies."),
        p("Add a constraint in the database as the last line of defence, so a future code path that forgets the validator fails loudly instead of corrupting the gradebook:"),
        code("sql", `
ALTER TABLE submissions
  ADD CONSTRAINT submissions_ai_score_valid
  CHECK (ai_score IS NULL OR (ai_score BETWEEN 0 AND 10 AND ai_score = trunc(ai_score)))
  NOT VALID;  -- existing bad rows are repaired first, then: VALIDATE CONSTRAINT`, "migration 20261110_001"),

        challenge("chal_quiz_lle_331"),

        h2("4. The challenge"),
        p("The challenge file contains the grading handler as it shipped and a fake of the gradebook table that behaves like PostgreSQL's `numeric`: numbers are stored as given, `null` and a missing value become NULL, numeric-looking strings are converted and anything else fails the statement. Run the starter on the incident test first and read the output: the gradebook, the review queue, the decisions and the jobs that threw. Then fix the handler."),
        challenge("chal_coding_lle_332"),

        h2("5. How to verify"),
        bullets([
            "**A table of recorded bad replies.** Every reply shape from the incident and from your logs - strings, decimals, out of range, missing fields, text around the JSON, fenced JSON, empty replies, overlong feedback - with the expected decision. It runs in CI and grows with every new shape production shows you.",
            "**The database constraint.** Try to write `11` through any code path in a test database and expect the statement to fail.",
            "**Repair the damage, through review.** Find the rows the incident wrote (the query in section 1, plus `status = 'graded' AND ai_score IS NULL`) and requeue them for grading with the new handler; replies that are still rejected land in review. Do not fix the rows with an `UPDATE ... SET ai_score = LEAST(ai_score, 10)`: that is clamping, after the fact.",
            "**Metrics after the deploy.** Decisions per reason per hour, review queue size and age, and the share of accepted scores at the cap. A prompt change that breaks the reply format shows up as a jump in one reason within minutes, not as an instructor's email a day later.",
        ]),

        h2("6. Common mistakes"),
        bullets([
            "**Coercing instead of validating.** `Number(out.score)`, `parseInt`, `Math.round`, `Math.min(10, ...)`. Spot it: any arithmetic on the model's value before it has been checked.",
            "**Checking the range but not the type.** `if (score > 10)` is false for `\"10/10\"` and for `undefined`. Spot it: a validator without `typeof` or `Number.isInteger`.",
            "**Validating, then writing the raw value.** The check passes on a parsed copy while the original object goes to the database. Spot it: the value written is not the value that was validated.",
            "**Trusting JSON mode or a schema as the whole validation.** Format is guaranteed, meaning is not. Spot it: no range, length or cap check in your own code.",
            "**A review queue nobody drains, and no decision record.** Spot it: the queue has no owner and no age metric, and \"why is this score empty?\" needs a log search.",
        ]),

        h2("7. Summary"),
        numbered([
            "Model output is untrusted input (OWASP LLM05): parse it, check type before range, and enforce limits on every field before anything reaches the database.",
            "Reject instead of repairing: an invalid reply leaves the score empty, goes to human review with a reason, and a decision is recorded for every job.",
            "Cap what the model can decide - here never above the automated test score + 2 - so a wrong or injected reply is worth little and shows up in review.",
        ]),

        h2("Sources"),
        bullets([
            "OWASP Top 10 for LLM Applications 2025: LLM05 Improper Output Handling, LLM01 Prompt Injection - owasp.org/www-project-top-10-for-large-language-model-applications",
            "PostgreSQL documentation: Numeric Types (numeric precision and scale, NaN) and CHECK constraints - postgresql.org/docs/current/datatype-numeric.html",
        ]),
    ],
});
