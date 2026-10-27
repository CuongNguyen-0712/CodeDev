// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-aam-3-2",
    title: "Token & time budgets",
    slug: { _type: "slug", current: "agent-token-time-budgets" },
    description:
        "One support conversation cost more than a hundred ordinary ones, and the budget check that should have stopped it ran after each call, so it noticed only once the money was spent. Learn where an agent's cost comes from, how to budget tokens, cost, wall time and tool calls per session and per user per day, how to check before each call with an estimate that cannot be exceeded, and how to report what is left and which limit stopped the run.",
    estimatedTime: 25,

    scenario: {
        role: "Backend engineer owning the CodeDev support agent",
        problem:
            "The finance dashboard for the AI features of https://app.codedev.test shows one support conversation that cost more than a hundred ordinary ones. A learner pasted a long CI log into the help widget and asked why their submission failed. Every step of the agent re-sent the whole transcript, log included, and the session budget check - \"if (used > budget) stop\" after each call - only fired once the session was far over its limit. The same learner then opened eleven more conversations that afternoon, each with a fresh session budget. Nothing limited the day, the per-session time limit was not enforced at all, and the search tool, which has its own paid quota, was called 40 times in one session.",
    },

    content: [
        h2("1. The incident: a budget that is checked too late"),
        p("The support agent had a budget. It looked like this:"),
        code("typescript", `
// support/agent.ts - the budget as shipped
let used = 0;
for (;;) {
  const res = await model.call({ model: "large", messages: transcript, maxOutputTokens: 1000 });
  used += res.usage.inputTokens + res.usage.outputTokens;
  if (used > SESSION_TOKEN_BUDGET) return stop("budget");     // checked after the call
  // ...run the tool, append the result, loop...
}`, "agent.ts (as shipped)"),
        p("The check is honest about what happened, but it decides nothing. It runs after the tokens are spent, so the only thing it can do is stop the **next** call. How far the session overshoots depends on the size of the last call, and in this conversation the last calls were the biggest of all."),
        p("It also measures one thing out of four. Tokens are not money (input and output have different prices, and models have different prices), the session had no time limit, a paid tool had no call limit, and a session budget says nothing about a learner who opens twelve sessions."),

        h2("2. Read the evidence"),
        p("The agent logs the usage that the model API returns with every response. Ordered by step, the session shows where the money went:"),
        code("sql", `
SELECT step, model, input_tokens, output_tokens, cost_micros, elapsed_ms
FROM agent_model_calls
WHERE session_id = 'support-9107'
ORDER BY step;

 step | model | input_tokens | output_tokens | cost_micros | elapsed_ms
------+-------+--------------+---------------+-------------+-----------
    1 | large |       31 240 |           310 |      98 370 |      4 100
    2 | large |       31 820 |           420 |     101 760 |      8 900
    3 | large |       32 610 |           380 |     103 530 |     13 400
  ...
   17 | large |       44 950 |           610 |     144 000 |     81 200`, "psql (example prices: input 3, output 15 micro-USD per token)"),
        p("Two things stand out. The **input** grows every step, because each call sends the whole transcript again: the question, the pasted log, every tool call and every result. And the input dominates: 31,240 input tokens against a few hundred output tokens per step. The cost of an agent run is not \"tokens per step times steps\"; it is the sum of a growing input, which is why long runs get expensive faster than they get long."),
        p("Grouped by learner and day, the second gap appears:"),
        code("sql", `
SELECT user_id, date_trunc('day', started_at) AS day,
       count(DISTINCT session_id) AS sessions, sum(cost_micros) AS cost_micros
FROM agent_model_calls
GROUP BY 1, 2
ORDER BY cost_micros DESC
LIMIT 3;`, "psql"),

        h2("3. Four budgets, and why each one exists"),
        bullets([
            "**Tokens** bound the size of the work, and they are what context windows and rate limits are measured in. Count input and output separately: they are priced differently and they grow differently.",
            "**Cost** is what finance cares about, and it is not proportional to tokens: output usually costs several times more than input, and a large model several times more than a small one. Keep a price table per model in config, with the date you copied it from the provider's pricing page.",
            "**Wall time** is what the learner experiences. A run that is cheap but takes four minutes is still a failure in a help widget. Measure it on a clock (a fake one in tests), not by adding up reported latencies.",
            "**Tool calls per tool** protect what is behind the tools: a search service with a paid quota, an internal API with a rate limit, a write tool that should run at most once. One global \"tool calls\" number cannot express \"search at most 3 times, look up orders as often as needed\".",
        ]),
        p("Each budget exists **per session** (one conversation) and some also **per user per day**. The session budget bounds one run; the daily budget bounds a person, who can open as many sessions as the UI allows. The prerequisite course, Node.js AI Engineering, built a daily budget per learner for single model calls, including the choice of the day boundary; here the same idea has to hold across the many calls of many agent sessions."),
        callout("info", "When a budget tracker is too much",
            "A feature that makes exactly one model call per request needs a maxOutputTokens cap on that call, a timeout, and possibly a daily quota per user: no tracker. A fixed workflow with three known steps can be costed in advance. The tracker earns its code when a model decides how many calls happen."),

        h2("4. Check before the call, with an estimate that cannot be exceeded"),
        p("To stop **before** exceeding a budget, you need to know the cost of the next call before you make it. You know half of it exactly and you can bound the other half:"),
        bullets([
            "**Input tokens are known before sending.** You are about to send them. Count them with the provider's token-counting endpoint or a tokenizer for the model; if your count is approximate, add a safety margin.",
            "**Output tokens are bounded by the cap you send.** Every model API lets you set a maximum number of output tokens; the model stops there. The cap is your upper bound.",
            "**Cost follows from both and the price table.** An unknown model has no price, so the only safe answer is to refuse the call (fail closed), not to guess.",
        ]),
        code("typescript", `
// prices: USD per million tokens, which is the same number as micro-USD per token
const PRICES = { small: { input: 1, output: 4 }, large: { input: 3, output: 15 } };   // example numbers
const MAX_OUTPUT_TOKENS = 1000;

const price = PRICES.large;
const inputTokens = countTokens(transcript);                 // 4 500, known before the call
const estimatedCost = inputTokens * price.input + MAX_OUTPUT_TOKENS * price.output;
//                    4 500 * 3 + 1 000 * 15 = 28 500 micro-USD, the most this call can cost

if (session.costMicros + estimatedCost > limits.maxCostMicros) {
  return stop("max_cost");        // decided before anything is spent
}`, "estimate before the call"),
        p("Because the estimate is an upper bound, the budget holds by construction: if the check passes, even the worst case fits. The price is that the check sometimes refuses a call that would have fit, because the model would have written less than the cap. That is the trade you want. To refuse less often, lower the output cap for steps that only need short answers (choosing the next tool rarely needs 1,000 tokens), or switch to a smaller model near the end of a budget. Do not estimate the output from an average: an average is exceeded about half the time."),
        h3("Time is different"),
        p("You cannot cap how long a model takes the way you cap its output. The tracker checks elapsed time plus an estimate of one call (for example, the p95 latency from your metrics), which keeps a session from starting a call it probably cannot finish. To make the time limit hard, also give the call itself a deadline: pass the remaining session time as its timeout (`AbortSignal.timeout(remainingMs)` with fetch-based SDKs), so a slow call is cut off at the limit instead of running past it."),
        h3("Check order and the stop reason"),
        p("When several limits would be exceeded at once, report one, always the same one: fix an order (for example tokens, cost, daily cost, time) and return the first limit that fails. The stop reason feeds the reply to the learner and your metrics, and a reason that changes with evaluation order is noise in both."),

        challenge("chal_quiz_aam_321"),

        h2("5. Per-user daily budgets across sessions"),
        p("A daily budget belongs to the pair (user, day), not to a session. The tracker keeps it in a map keyed by both, adds the actual cost of every call to it, and checks it before every call together with the session budgets. A new session resets the session counters and leaves the daily spend alone; a new day starts from zero."),
        bullets([
            "**Which day?** Decide once and write it down: the UTC day, or the learner's local day. Billing and support should be able to answer \"why was I blocked at 7 a.m.?\" from the same rule.",
            "**Where does it live?** In one process for one instance, a `Map` is enough. With several API instances the spend must live in a shared store (a database row or a Redis counter per user and day), or each instance enforces its own copy of the budget.",
            "**Concurrent sessions.** Two sessions of the same user can both pass a check at the same moment and both spend. The usual fix is to **reserve** the estimate when the check passes and **settle** it to the actual cost after the call. The exercise runs sessions one after another and leaves this out.",
        ]),

        h2("6. Report what is left and which limit stopped the run"),
        p("A budget that stops a run silently is only half done. The tracker reports, for the session, what was used and what remains of each budget, and the loop records which limit stopped it. That report drives three things:"),
        numbered([
            "**The reply.** \"I have reached the limit for one conversation; this is what I found so far\" for a session limit, \"You have used today's AI help; it resets at midnight UTC\" for the daily one. Combine it with the partial result from lesson 3.1.",
            "**Degrading before stopping.** With the remaining numbers the agent can switch to the small model, lower the output cap, or summarise the transcript when, say, less than 20% of a budget is left.",
            "**Metrics.** Runs by stop reason, and the distribution of cost per session and per user-day. A sudden rise of `max_tokens` stops after a prompt change tells you the new prompt is longer than you thought.",
        ]),
        code("json", `
{
  "session": "support-9107", "user": "u-17", "answered": false, "stoppedBy": "max_cost",
  "modelCalls": 4, "inputTokens": 12400, "outputTokens": 940, "costMicros": 51300, "wallMs": 9800,
  "toolCalls": { "get_order": 2, "search_lessons": 1 },
  "remaining": { "tokens": 16660, "costMicros": 8700, "wallMs": 110200, "dailyCostMicros": 88700,
                 "toolCalls": { "get_order": 2, "search_lessons": 2 } }
}`, "one session report"),

        h2("7. The exercise: a budget tracker for the support agent"),
        p("In the challenge, the agent loop is in the test runner and asks a `BudgetTracker` before every model call and every tool call, then tells it what the call used. You write the tracker: the estimate, the five checks in a fixed order, the tool limits, the daily spend per user and day that survives across sessions, and the report. The fake model gives the token counts of each turn and stops writing at the output cap; all time is on a fake clock, so the tests can check elapsed time to the millisecond."),
        challenge("chal_coding_aam_322"),

        h2("8. How to verify a budget"),
        bullets([
            "**A test where the next call does not fit.** Put a session just below a limit and script a call whose estimate crosses it: the call must not happen. Then the same session with the limit raised by exactly the estimate: the call must happen (reaching a limit is allowed).",
            "**A test across sessions.** Two sessions of the same user on the same day share the daily budget; a session of another user does not; a session the next day starts fresh.",
            "**Reconcile with the bill.** Sum the recorded cost per day and compare it with the provider's usage export. A gap means a call path that does not go through the tracker, or a price table that is out of date.",
            "**Alert on the overshoot that should never happen.** Log `used > limit` after recording a call as an error. With an upper-bound estimate it never fires for tokens and cost; if it does, something bypassed the check.",
        ]),

        h2("9. Common mistakes"),
        bullets([
            "**Checking after the call.** The budget is exceeded by the size of the last call. Spot it: the only comparison with the limit comes after `usage` is added.",
            "**Estimating only the input.** The output is forgotten in the estimate, so a call that fits by input alone can still exceed the budget. Spot it: no reference to the output cap in the check.",
            "**Tokens as a proxy for money.** A switch to a larger model or a long answer changes the cost while the token budget looks fine. Spot it: no price table, or one price for input and output.",
            "**A daily budget that lives in the session.** It resets every time the learner opens a new conversation. Spot it: the daily counter is created in `startSession`, or keyed by session id.",
            "**A remaining budget below zero.** Learners see \"-1,200 tokens left\". Spot it: `limit - used` without `Math.max(0, ...)`, usually next to a check that runs after the call.",
        ]),

        h2("10. Summary"),
        numbered([
            "An agent's cost is the sum of many calls whose input grows every step; budget tokens, cost, wall time and calls per tool, per session and per user per day.",
            "Decide before each call with an upper-bound estimate (known input plus the output cap, priced per model), refuse unknown models, and give the call a deadline from the remaining time.",
            "Report what is used, what remains and which limit stopped the run, so the reply, the fallback and the metrics all know why the agent stopped.",
        ]),

        h2("Sources"),
        bullets([
            "OWASP Top 10 for LLM Applications 2025: LLM10 Unbounded Consumption - owasp.org/www-project-top-10-for-large-language-model-applications",
            "Anthropic: Building effective agents (higher costs and compounding errors of autonomous agents) - anthropic.com/engineering/building-effective-agents",
            "Your model provider's pricing page and token-counting documentation (prices in this lesson are example numbers)",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Take one week of usage logs from an agent you run (or generate them with the fake model from the exercise). Compute the cost per session and per user-day, pick session and daily limits from the high percentiles, and replay the week through your tracker: count how many sessions each limit would have stopped and read three of them to check the limit stopped a run that deserved it."),
    ],
});
