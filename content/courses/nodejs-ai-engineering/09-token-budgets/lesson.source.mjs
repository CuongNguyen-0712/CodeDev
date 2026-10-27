// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-nae-3-3",
    title: "Token budgets & cost per user",
    slug: { _type: "slug", current: "token-budgets-cost-per-user" },
    description:
        "The AI tutor had a daily token budget per learner, and it still let one free account spend ten times its limit, blocked a premium learner at noon and reset at 7 in the morning for learners in Vietnam. Learn how to estimate a request before it runs, record what the provider says it actually used, make recording idempotent, reset budgets at the learner's local midnight, and report a remaining budget that never goes below zero.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer, CodeDev AI tutor",
        problem:
            "The monthly cost review shows that 2% of free learners account for more than half of the tutor's token usage. One free account, u_5512, has a daily limit of 20,000 tokens, but the provider's usage export shows 214,000 tokens for it on a single day, while CodeDev's own budget table says it used 19,500. The same week, a premium learner reports being told \"daily limit reached\" at 12:10 after a few questions, and learners in Vietnam report that their budget comes back at 7:00 in the morning, not at midnight.",
    },

    content: [
        h2("1. The incident: a budget that measured the wrong thing"),
        p("The budget was added in the same sprint as the tutor. Before each request, the gateway estimates the cost from the learner's question and subtracts it:"),
        code("typescript", `
// gateway/budget.ts - the version that shipped
const DAILY_TOKENS = { free: 20_000, premium: 200_000 };

export async function consume(userId: string, question: string) {
    const estimate = Math.ceil(question.length / 4);                 // "about 4 characters per token"
    const day = new Date().toISOString().slice(0, 10);               // e.g. "2026-10-26"
    const used = await db.sumUsage(userId, day);
    if (used >= DAILY_TOKENS[await db.planOf(userId)]) throw new BudgetExceeded();
    await db.insertUsage({ userId, day, tokens: estimate });
}`, "budget.ts"),
        p("Each line has a reasonable story behind it, and together they are wrong in three ways. The estimate counts the learner's question, but the request the model receives also contains the system prompt, the learner's code, earlier turns and tool results (lessons 2.3 and 3.1), and the answer has its own tokens. The day is the UTC date. And `insertUsage` is called through the gateway's retrying HTTP client, which repeats it after a timeout."),

        h2("2. Read the evidence"),
        p("Put CodeDev's budget table next to the provider's usage export for the same account and day. The export is the number the bill is based on:"),
        code("sql", `
SELECT b.user_id, b.day, b.tokens AS budget_tokens, p.input_tokens + p.output_tokens AS provider_tokens
FROM (SELECT user_id, day, sum(tokens) AS tokens FROM tutor_usage GROUP BY 1, 2) b
JOIN provider_usage_daily p USING (user_id, day)
WHERE b.user_id = 'u_5512' AND b.day = '2026-10-21';

 user_id | day        | budget_tokens | provider_tokens
---------+------------+---------------+-----------------
 u_5512  | 2026-10-21 |         19500 |          214380`, "psql"),
        p("The budget saw a tenth of the real usage, because it never looked at the real usage. The provider's response tells you what each request used (most APIs report input and output tokens per response; check where your provider puts them), and the gateway threw that number away."),
        p("The premium learner's ticket has a different shape. The usage table holds the same request twice, five seconds apart:"),
        code("text", `
 request_id | user_id | tokens | recorded_at
------------+---------+--------+---------------------
 req_88f1   | u_3307  |  95000 | 2026-10-21 08:00:20
 req_88f1   | u_3307  |  95000 | 2026-10-21 08:00:25

gateway: POST /internal/usage timeout after 5000ms, retrying (1/2) request=req_88f1`, "tutor_usage + gateway log"),
        p("The first insert succeeded but its response was slow; the client timed out and retried, and a second row was written. One large request counted as 190,000 of the learner's 200,000 tokens. The 7:00 reset is the simplest of the three: `toISOString()` gives the UTC date, and midnight UTC is 07:00 in Vietnam (UTC+7)."),

        h2("3. The core idea: estimate before, record after"),
        p("A token budget answers two questions at two different moments, with two different numbers:"),
        numbered([
            "**Before the call: may this request run?** You do not know the real usage yet, so use an **estimate** of the most it can cost: the tokens of the full prompt you are about to send, plus the maximum number of output tokens you allow for this feature. Reject the request when the remaining budget cannot cover the estimate, and tell the learner when the budget resets.",
            "**After the call: what did it cost?** **Record** the usage the provider reported for this response, not the estimate. If the call failed before the model produced anything, record 0. Record it once per request: use the request id as an idempotency key, so a retried record is a no-op.",
        ]),
        p("Remaining budget is then simply the plan's daily limit minus what was recorded on the learner's current day, shown as 0 when actual usage went above the limit. Recording the real number can push usage past the limit: that is fine and expected, and the next check stops the learner. What must never happen is a negative number shown in the UI, or arithmetic that treats \"-6,500 tokens left\" as a reason to allow something."),
        h3("Counting tokens before the call"),
        bullets([
            "Token counts depend on the model's tokenizer. Code, Vietnamese and other non-English text usually take more tokens per character than English prose, so a \"characters divided by 4\" rule underestimates exactly the requests this platform sends most.",
            "Prefer the provider's token-counting endpoint or the tokenizer it publishes for the model, if there is one; otherwise use a deliberately pessimistic ratio and compare it with the recorded usage every week.",
            "The output cap you send with the request (often called max tokens or max output tokens; the name differs by provider) is what makes the estimate an upper bound. Without a cap, the answer has no known maximum, and neither does the request's cost.",
        ]),
        h3("Whose midnight?"),
        p("\"Daily\" means the learner's day. Store the learner's time zone (or, as in the exercise, a fixed UTC offset) and compute the budget day from the request time in that zone. A fixed offset is exact for countries without daylight saving time, such as Vietnam; for zones with daylight saving, compute with the IANA zone name (`Intl.DateTimeFormat` with `timeZone`) instead of a stored offset."),
        h3("When not to build per-user budgets"),
        bullets([
            "**When a global limit is enough.** If total tutor cost is small next to what the feature earns, a per-minute rate limit (lesson 2.2) plus a monthly spending alert at the provider may be all you need. Budgets add a table, a check on every request and a support question (\"why am I blocked?\").",
            "**As your only abuse control.** A budget limits how much one account can spend; it does not stop someone from creating many accounts. Pair it with sign-up limits and the cost dashboard.",
            "**When the unit is not the user.** A school that buys seats for a class may want one budget for the class. Decide the unit with the product owner before writing the table.",
        ]),

        challenge("chal_quiz_nae_331"),

        h2("4. Worked example: the budget in Postgres"),
        p("One row per request makes recording idempotent, keeps an audit trail and lets you compare with the provider's export line by line:"),
        code("sql", `
CREATE TABLE tutor_usage (
    user_id     text        NOT NULL,
    request_id  text        NOT NULL,
    local_day   date        NOT NULL,          -- the learner's date when the usage was recorded
    tokens      integer     NOT NULL CHECK (tokens >= 0),
    recorded_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, request_id)          -- one row per request: a retried record is a no-op
);
CREATE INDEX tutor_usage_day ON tutor_usage (user_id, local_day);

-- record: a second call with the same request id inserts nothing
INSERT INTO tutor_usage (user_id, request_id, local_day, tokens)
VALUES ($1, $2, $3, $4)
ON CONFLICT (user_id, request_id) DO NOTHING;

-- remaining: never below zero
SELECT greatest(0, $limit - coalesce(sum(tokens), 0)) AS remaining
FROM tutor_usage WHERE user_id = $1 AND local_day = $2;`, "migration + queries"),
        p("The gateway wraps the model call with the two steps. The clock is injected, so tests can stand one second before a learner's midnight:"),
        code("typescript", `
export async function withBudget<T>(ctx: { user: User; requestId: string; now: () => Date }, prompt: Prompt,
                                    call: () => Promise<{ value: T; usage: { inputTokens: number; outputTokens: number } }>) {
    const day = localDay(ctx.now(), ctx.user.utcOffsetMinutes);
    const estimate = countTokens(prompt) + prompt.maxOutputTokens;           // the most this request can cost
    const remaining = await budget.remaining(ctx.user, day);
    if (estimate > remaining) throw new BudgetExceeded({ remaining, resetsAt: nextLocalMidnight(ctx.now(), ctx.user) });

    let used = 0;
    try {
        const result = await call();
        used = result.usage.inputTokens + result.usage.outputTokens;          // what the provider reported
        return result.value;
    } finally {
        // runs on success and on failure; the request id makes a retry of this write harmless
        await budget.record(ctx.user, ctx.requestId, localDay(ctx.now(), ctx.user.utcOffsetMinutes), used);
    }
}

function localDay(instant: Date, utcOffsetMinutes: number): string {
    return new Date(instant.getTime() + utcOffsetMinutes * 60_000).toISOString().slice(0, 10);
}`, "gateway/withBudget.ts"),
        bullets([
            "`localDay` shifts the instant by the offset and then reads the UTC date: 18:30 UTC with +420 minutes is 01:30 on the next day, which is the learner's date. `Date.prototype.getTimezoneOffset()` returns the offset of the **server's** zone with the opposite sign; it has no place here.",
            "A request that fails after the model produced tokens may still be billed by the provider; check how yours handles it. Recording 0 for every failure would hide that cost; when the provider reports usage for a failed or cancelled stream (lesson 3.2), record it.",
            "Two requests checked at the same moment can both pass and together go over the limit. The overshoot is bounded by the number of requests a learner can have in flight times the largest estimate. If that matters, allow one tutor request per learner at a time, or reserve the estimate at check time and replace it with the actual usage when you record.",
            "Cost in money is tokens multiplied by the provider's current prices, which usually differ for input and output tokens and change over time. Keep prices in configuration with a date, never in code, and report cost per user per day from the recorded tokens.",
        ]),

        h2("5. Your turn: a token budget per learner"),
        p("The exercise replays a day (or three) of tutor traffic against a budget with a fake clock: checks with estimates, records of actual usage including retried ones, and questions about the remaining budget, for learners on free and premium plans in several time zones. Return one outcome per event."),
        challenge("chal_coding_nae_332"),

        h2("6. How to verify"),
        bullets([
            "**Reconcile with the provider every day.** The query from section 2, run for every user: CodeDev's recorded tokens and the provider's export should agree within a small margin. A gap means a code path that calls the model without recording.",
            "**Fake clock at the edges.** Tests that stand at 23:59:59 and 00:00:00 local time for offsets such as +420, -300 and +330, plus a test at 16:59:59 UTC for a learner in Vietnam. A budget that resets at the wrong moment fails one of them.",
            "**Retry the record on purpose.** In a test, call `record` twice with the same request id and assert one row and an unchanged remaining budget. In staging, add a delay to the usage endpoint so the client times out, and check the table.",
            "**Watch the estimate's accuracy.** Log estimate and actual usage per request. If actual is often above the estimate, the estimate is not an upper bound: check the output cap and the token counting for code and Vietnamese text.",
        ]),

        h2("7. Common mistakes"),
        bullets([
            "**Budgeting the estimate, never the actual usage.** The incident's 19,500 vs 214,380. Spot it when no code path reads the usage numbers from the provider's response.",
            "**`used < limit` as the check.** A learner with 1 token left can start a request that costs 15,000. Spot it in the logs as single requests that take a learner from almost nothing to far over the limit.",
            "**The server's day or the UTC day.** `new Date().toISOString().slice(0, 10)` or `getDate()` on the server. Spot it in support tickets about budgets that reset at odd local hours, and in a test with a fake clock at 17:00 UTC.",
            "**Non-idempotent recording.** An `INSERT` without a unique key on the request id, behind a client that retries. Spot it with `SELECT request_id, count(*) FROM tutor_usage GROUP BY 1 HAVING count(*) > 1`.",
            "**Negative remaining in the UI.** \"-6,500 tokens left\" confuses learners and breaks comparisons. Spot it in the API response for an account whose actual usage passed the limit.",
        ]),

        h2("8. Summary"),
        numbered([
            "Check before the call with an estimate that is an upper bound (full prompt plus the output cap), and reject when the remaining budget cannot cover it.",
            "Record after the call with the usage the provider reported, once per request id, so retries cannot count a request twice; remaining is the limit minus recorded usage, never below zero.",
            "A daily budget resets at the learner's local midnight: compute the day from the request time in the learner's zone, and test it with a fake clock on both sides of midnight.",
        ]),

        h2("Sources"),
        bullets([
            "Your provider's current documentation on token counting, usage reported per response, output limits and prices (check them before you set limits; they change)",
            "PostgreSQL documentation: INSERT ... ON CONFLICT DO NOTHING",
            "MDN Web Docs: Date.prototype.toISOString(), Date.prototype.getTimezoneOffset() and Intl.DateTimeFormat timeZone",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "For an AI feature you know, take one week of requests and compute, per user and per day, the recorded tokens and the cost at today's prices from your provider's price list. Pick daily limits for a free and a paid plan from that distribution (for example a percentile you can defend), and write down what the learner sees when the limit is reached and when it resets."),
    ],
});
