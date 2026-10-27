// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-nae-2-1",
    title: "Retry, repair & fallback when the output breaks the schema",
    slug: { _type: "slug", current: "retry-repair-fallback-llm-output" },
    description:
        "Since the hint schema check went live, about 1 hint request in 20 ends with \"Could not generate a hint\". Learn to sort LLM failures into three kinds - transient errors you retry with backoff, permanent errors you never retry, and output that breaks the schema, which you repair with one small request that carries only the bad answer and the validator's errors - and to end every path with a fallback the lesson page can render, while counting the calls and tokens each hint costs.",
    estimatedTime: 20,

    scenario: {
        role: "Backend developer on the CodeDev AI hint feature",
        problem:
            "Lesson 1.3 put a schema check in front of the AI hint, and the lesson page no longer crashes on a missing field. Instead, about 5% of Hint clicks now end with \"Could not generate a hint, please try again\". Support ticket #3127 asks for a fix before the next cohort starts. A pull request is already open: it wraps the model call in a loop that retries any failure up to five times. Before it is merged, you are asked to look at what the failures actually are and what each retry would cost.",
    },

    content: [
        h2("1. The incident: one error message for four different failures"),
        p("Here is the hint route as it runs today. It calls the model once through the gateway from lesson 1.1, checks the answer with the validator from lesson 1.3, and turns anything that goes wrong into the same error:"),
        code("typescript", `
// hints/hintRoute.ts (current)
export async function postHint(req: HintRequest): Promise<HintResponse> {
  try {
    const reply = await llm.complete(hintMessages(req));
    const errors = validateHint(reply.text);
    if (errors.length > 0) throw new Error(\`invalid hint: \${errors.join("; ")}\`);
    return { ok: true, hint: JSON.parse(reply.text) };
  } catch (err) {
    log.warn("hint failed", { req: req.id, err: String(err) });
    return { ok: false, message: "Could not generate a hint, please try again" };
  }
}`, "hintRoute.ts"),
        p("And here is the pull request that wants to fix the ticket:"),
        code("typescript", `
// PR #598 "hints: retry on failure"
for (let attempt = 1; attempt <= 5; attempt++) {
  try {
    return await tryOnce(req);
  } catch (err) {
    if (attempt === 5) throw err;
  }
}`, "PR #598"),
        p("The loop looks reasonable and it will make the error rarer. Before you approve it, ask the two questions from any retry review: **can this failure go away on its own**, and **what does trying again cost**? The log already holds the answer."),

        h2("2. Read the evidence"),
        p("One day of the hint service log, grouped by what went wrong (12,040 hint requests, 591 failed):"),
        code("text", `
count  share  what the log says
  347  2.9%   status=200 validation=invalid errors=["not valid JSON"]
                 text starts with "Sure! Here is a hint:" or with \`\`\`json
  132  1.1%   status=200 validation=invalid errors=["level: must be 1, 2 or 3"]
                 level was "2" (a string) or "two"
   41  0.3%   status=200 validation=invalid errors=["not valid JSON"] finish=length
                 lab lessons only; the answer stops in the middle of the hint text
   38  0.3%   status=503 error=overloaded
   33  0.3%   status=429 error=rate_limit_exceeded
    0  0.0%   status=401 (but 214 on Friday 18:00-18:40, after the key rotation)`, "hint service log, Wednesday, grouped"),
        p("Read each group for what it says about the **next** attempt:"),
        bullets([
            "**503 and 429** are the provider saying \"not now\". The same request a little later has a good chance to succeed. These are worth a retry, with a wait in between.",
            "**401** on Friday came from a rotated key. The same request with the same key will get the same answer a second later, five times in a row. A retry only adds calls and waiting before the same error.",
            "**Invalid JSON and a wrong `level`** came back with status 200: the model answered, the answer has the wrong shape. Sending the identical request again might give a better answer, or the same mistake again, and it pays for the whole prompt, learner's code included, every time.",
            "**`finish=length`** means generation stopped because it hit the output token limit, not because the model finished. Asking again with the same limit and the same prompt will very likely stop in the same place.",
        ]),
        p("Four groups, three different right answers. A single \"retry anything five times\" loop treats them all like the 503."),

        h2("3. Three tools: retry, repair, fallback"),
        h3("Retry: the same request, later, for transient failures"),
        p("A retry sends the identical request again. It only makes sense when the failure is about **when** you asked, not **what** you asked: rate limits (429), an overloaded or briefly unavailable provider (502, 503, 504) and timeouts (lesson 2.2). Keep a small limit (2 or 3), wait longer before each retry (exponential backoff: 500 ms, 1 s, 2 s...) and add jitter in production so a thousand hint requests that failed together do not come back together."),
        p("Never retry a failure that is about the request itself: 400 (malformed request, or a prompt longer than the model's context window), 401 and 403 (credentials or permissions), 404 (a model name that does not exist). Return the fallback at once and alert: a human has to fix these."),
        callout("info", "Status codes differ between providers",
            "Most LLM HTTP APIs use 429 for rate limits and 5xx for provider-side trouble, and many add their own error codes in the body (\"overloaded\", \"context_length_exceeded\" and so on). The names and the exact codes are not standardised. Check your provider's error reference, map its errors to transient or permanent in one function, and test that function."),
        h3("Repair: a new, small request that carries the errors"),
        p("When the model answered but the answer breaks the schema, you know exactly what is wrong: the validator told you. A **repair request** gives the model that information and nothing else it does not need:"),
        code("typescript", `
const REPAIR_PROMPT =
  'Your previous answer did not match the schema {"level": 1 | 2 | 3, "hint": "<at most 300 characters>"}. ' +
  "Return only the corrected JSON object.";

function repairMessages(previous: string, errors: string[]): Message[] {
  return [
    { role: "system", content: REPAIR_PROMPT },
    { role: "user", content: \`Previous answer:\\n\${previous}\\nErrors:\\n\${errors.map((e) => \`- \${e}\`).join("\\n")}\` },
  ];
}

// repairMessages('{"level": "two", "hint": "Check which branch of your ternary runs."}', ["level: must be 1, 2 or 3"])`, "repair.ts"),
        p("Why not append the repair to the original conversation? Because the original conversation contains the learner's code, the challenge and the failing test, and you pay for every token of it again. The model does not need them to change `\"two\"` into `2`: the hint text is already written. For a single-file challenge the first request is a few thousand input tokens; a repair is one or two hundred."),
        p("When **not** to repair:"),
        bullets([
            "**The output was cut off (`finish=length` or your provider's equivalent).** The answer is not malformed, it is unfinished. A repair asks the model to fix half a hint. Fix the cause: a smaller prompt (lesson 2.3) or a larger output limit, and treat it as invalid output until then.",
            "**The model refused or a safety filter blocked the answer.** A repair that pushes the model to answer anyway is the wrong move. Use the fallback.",
            "**More than once or twice.** If two repairs did not produce valid JSON, the third rarely will. Cap repairs (1 is a good default, 2 at most) and fall back.",
        ]),
        callout("info", "JSON and schema modes help, validation still decides",
            "Many providers offer a JSON mode or schema-constrained output, and some SDKs can parse the answer into a typed object for you. They reduce invalid output a lot, but what each mode guarantees differs between providers, models and versions, and none of them checks your business rules (a hint of at most 300 characters, a level the learner has unlocked). Keep validateHint() as the gate, and keep repair and fallback for the cases that still get through."),
        h3("Fallback: an answer the page can always render"),
        p("Every path that does not end in a valid hint must end in the **fallback**, never in an exception that reaches the lesson page. CodeDev already has a good one: every challenge has three static hints written by the author (`challenge.challenge_hints`). The AI hint service falls back to a fixed generic hint, and the route can swap in the static hint of the learner's current level."),
        bullets([
            "**Mark it.** Return `source: \"model\" | \"repair\" | \"fallback\"` so the page can label it and so your metrics can count it.",
            "**Do not charge for it.** A fallback should not use up one of the learner's AI hints for the day.",
            "**Do not loop on it.** The fallback is the end of the request. The learner can click Hint again later; your service does not keep trying in the background.",
        ]),

        h2("4. Count what every hint costs"),
        p("Retries and repairs are extra calls, and extra calls are extra tokens. The only way to know what a hint costs is to count it where it happens: every call, including the ones that failed, and the token usage of every answer that came back (most APIs return input and output token counts with each response; the field names differ)."),
        code("typescript", `
// one line per hint request, written when the request ends
log.info("hint done", {
  req: req.id,
  source: result.source,            // model | repair | fallback
  reason: result.reason,            // null | "error 401" | "invalid output" ...
  calls: result.calls,              // 1 for a clean answer
  inputTokens: result.inputTokens,  // sum over the answers that came back
  outputTokens: result.outputTokens,
});`, "hintRoute.ts"),
        p("With this line you can answer the questions that matter in review: how many calls does an average hint take, what share ends in the fallback, and how much the repairs add. Without it, the next lesson's incident is invisible until the invoice arrives."),

        challenge("chal_quiz_nae_211"),

        h2("5. Put it together"),
        p("The shape of the hint function is one loop with two separate counters - retries for transient errors, repairs for invalid output - and the fallback on every other exit:"),
        code("typescript", `
async function getHint(req, llm, clock, opts): Promise<HintResult> {
  // messages = hintMessages(req); counters for retries, repairs, calls and tokens
  // loop:
  //   call the model (count the call)
  //   threw a transient error and a retry is left?  -> sleep(backoff) and send the same messages
  //   threw anything else?                          -> fallback "error <status>"
  //   add the answer's usage; validate it
  //   valid?                                        -> return it (source model or repair)
  //   a repair left?                                -> messages = repairMessages(answer, errors)
  //   otherwise                                     -> fallback "invalid output"
}`),
        p("The fake model in the challenge replays a script - `503`, then a truncated answer, then valid JSON - and the fake clock records every wait. Nothing calls a real LLM, so every test is fast, free and gives the same result every run."),
        challenge("chal_coding_nae_212"),

        h2("6. How to verify it"),
        bullets([
            "**Scripted fake-model tests, one per path.** Valid at once; invalid then repaired; invalid after the last repair; 503 then valid; 401; transient errors until the retries run out; an error on the repair request. Assert the result, the number of calls, the messages of each call and the waits on the fake clock.",
            "**Assert what the repair sends.** The repair request must not contain the learner's code. A test that checks the message count and the token count of call 2 catches a repair that resends the whole conversation.",
            "**Watch the source mix in production.** After the deploy, the `hint done` log should show most requests as `model`, a few percent as `repair`, a small share as `fallback`. If `fallback` grows, look at its reasons before anyone raises the retry limit.",
            "**Replay the log groups from section 2 in staging.** The 41 `finish=length` requests should now end in the fallback after their repairs and show up as a separate reason, which is your input for lesson 2.3.",
        ]),

        h2("7. Common mistakes"),
        bullets([
            "**Retrying every error the same way.** A 401 retried five times is five calls and a few seconds of spinner before the same failure. Spot it: the retry condition is `catch (err)` with no check of the status.",
            "**Repairing by resending the whole conversation.** It works and costs the full prompt again on every repair. Spot it: the repair call's input tokens are close to the first call's in the log.",
            "**No limit on repairs.** `while (!valid)` turns one bad answer into an unbounded number of paid calls. Spot it: any loop whose exit depends only on the model's output.",
            "**Repairing a truncated answer.** The model is asked to fix half a hint and gets cut off again. Spot it: repairs that fail with the same `finish=length` reason.",
            "**A fallback that throws, or counts against the learner's quota.** Spot it: the fallback path has no test, or the hint counter is increased before the result is known.",
        ]),

        h2("8. Summary"),
        numbered([
            "Sort each failure before you act: transient errors (429, 502, 503, 504, timeouts) get a bounded retry with backoff; permanent errors (400, 401, 403, 404) get the fallback at once and an alert; output that breaks the schema gets a repair.",
            "A repair is a new, small request with the invalid answer and the validator's errors, not the whole conversation again, and you allow one or two of them at most.",
            "Every path ends in a valid hint or a marked fallback, and every hint request records its calls and tokens, so the cost of retries and repairs is a number you can watch.",
        ]),

        h2("Sources"),
        bullets([
            "JSON Schema: Understanding JSON Schema - json-schema.org/understanding-json-schema",
            "RFC 9110, HTTP Semantics: section 10.2.3 (Retry-After) and section 15.6 (Server Error 5xx) - rfc-editor.org/rfc/rfc9110",
            "OWASP Top 10 for Large Language Model Applications: improper output handling and unbounded consumption - owasp.org/www-project-top-10-for-large-language-model-applications",
            "Your provider's API reference: error codes, rate-limit errors, structured-output modes and the usage fields of a response (check the current version)",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Add jitter to the backoff of your getHint (a random wait between 0 and the backoff value, with an injected random() so the tests stay deterministic). Then take one day of your own LLM feature's logs, or invent twenty lines, and sort every failure into transient, permanent, invalid output and truncated output, with the action each one gets."),
    ],
});
