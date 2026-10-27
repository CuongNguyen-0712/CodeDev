// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-aam-3-3",
    title: "Spot the AI mistake: an agent loop that never stops",
    slug: { _type: "slug", current: "spot-the-ai-mistake-agent-loop-never-stops" },
    description:
        "Asked to make the support agent \"retry tools until it gets an answer\", an AI assistant wrote a loop that, during a payments outage, asked the model the same question for 40 minutes. Learn to read that failure in a trace, to sort tool errors into temporary and permanent, to retry only the first kind with backoff and a maximum, to give the model the errors it can act on, and to end a loop that cannot finish with an escalation to a human that carries a useful summary.",
    estimatedTime: 25,

    scenario: {
        role: "Backend engineer and reviewer of AI-generated code, CodeDev support agent",
        problem:
            "On Thursday the payments API answered 503 for about an hour. Most support conversations about refunds simply waited. One of them, a learner asking about the refund for order o-1003 in the help widget of https://app.codedev.test, kept the agent busy for 40 minutes: the trace shows more than 700 model calls with the same transcript and the same get_refund_status call after each one, all billed. The learner closed the tab after two minutes and opened a support ticket by email. The loop had been rewritten the week before by an AI assistant, from the request \"make the support agent retry tools until it gets an answer\", and its tests passed.",
    },

    content: [
        h2("1. The incident: \"until it gets an answer\""),
        p("The support agent sometimes failed when a tool timed out, so a developer asked the coding assistant: **\"Make the support agent retry tools until it gets an answer.\"** This is what came back, and what was merged:"),
        code("typescript", `
function runSupportAgent(transcript: Message[], model: Model, tools: Tools, clock: Clock, policy: Policy): Outcome {
    // Keep going until the model has an answer for the learner.
    for (;;) {
        const turn = model.next(transcript);
        if ("final" in turn) return { status: "answered", answer: turn.final };

        const call = turn.toolCall;
        try {
            const content = tools.call(call);
            transcript.push({ role: "assistant", content: \`call \${call.name} \${JSON.stringify(call.args)}\` });
            transcript.push({ role: "tool", content });
        } catch (error) {
            // The tool failed: wait a moment, then try again until we get an answer.
            clock.sleep(policy.baseBackoffMs);
        }
    }
}`, "support/agent.ts (as merged)"),
        p("It does exactly what the request said. It also reads well: a comment on every branch, a configurable delay, no crash on a tool error. The tests covered the cases the developer had in mind - every tool answers - and they passed. The request never said what should happen when a tool will **not** answer, and the code has no answer for that either."),

        h2("2. Read the evidence"),
        p("The audit log from lesson 2.3 records every tool attempt. For the conversation in the incident, grouped by minute:"),
        code("sql", `
SELECT date_trunc('minute', started_at) AS minute, tool, error_code, count(*) AS attempts
FROM agent_tool_calls
WHERE run_id = 'support-9230'
GROUP BY 1, 2, 3
ORDER BY 1
LIMIT 4;

        minute        |       tool        | error_code  | attempts
----------------------+-------------------+-------------+---------
 2026-10-22 14:12:00  | get_refund_status | UNAVAILABLE |       18
 2026-10-22 14:13:00  | get_refund_status | UNAVAILABLE |       18
 2026-10-22 14:14:00  | get_refund_status | UNAVAILABLE |       18
 2026-10-22 14:15:00  | get_refund_status | UNAVAILABLE |       18`, "psql"),
        p("Eighteen attempts a minute, every minute, for forty minutes: a steady machine, not a struggling one. The model-call log explains the rhythm. Every call carries the size of the transcript it was sent, and that size never changes:"),
        code("text", `
run support-9230  model calls: 730  distinct transcript sizes: 1 (3 messages)
                  input tokens: 730 x 1 850 = 1 350 500   output tokens: 730 x 40
                  distinct proposals: 1  get_refund_status {"orderId":"o-1003"}`, "trace summary"),
        p("Put the two together. The tool throws, the `catch` sleeps, and the loop goes back to `model.next(transcript)` with the transcript it already sent. The model - deterministic enough at temperature 0 - sees the same conversation and makes the same decision: call `get_refund_status`. Nothing in the loop counts, nothing changes, and the only way out is a tool that starts answering again."),

        h2("3. What the request should have said"),
        p("\"Retry until it gets an answer\" mixes up three different things. Untangle them before writing any code:"),
        numbered([
            "**Retrying a tool call** is the tool layer's job. It needs no model: the same call, the same arguments, after a delay. It only makes sense for errors that can clear up on their own, and it needs a maximum.",
            "**Asking the model again** makes sense only after something changed: a new tool result, including an error result. With the same transcript it is not a retry; it is paying again for the same decision.",
            "**Stopping** is a decision the loop must be able to make without the model and without the tool: limits from lesson 3.1, budgets from 3.2, and a defined outcome - an escalation - when they fire.",
        ]),
        h3("Temporary or permanent: classify the error"),
        p("The tools of the support agent throw errors with a code. Sorting the codes is the same exercise as sorting HTTP statuses for retries:"),
        bullets([
            "**Temporary - retry with backoff and a maximum:** `TIMEOUT`, `UNAVAILABLE` (a 502, 503 or 504 behind the tool), `RATE_LIMITED` (429; honour a retry delay if the tool gives one). The same call may succeed in a moment.",
            "**Permanent - do not retry:** `NOT_FOUND`, `INVALID_ARGS`, `FORBIDDEN`, `UNKNOWN_TOOL`. The same call gets the same answer. These are information for the model: the order number is wrong, the arguments do not match the schema, this agent may not refund.",
        ]),
        p("Retry delays grow - for example 500, 1,000, 2,000 ms - so a struggling service gets fewer requests the longer it struggles, and in production you add jitter so that hundreds of conversations that failed at the same instant do not retry at the same instant. The exercise leaves jitter out so that the fake clock gives exact times."),
        h3("Feed the failure back to the model"),
        p("When a call fails for good - a permanent error, or a temporary one after the last retry - the model needs to know, in the transcript, as the result of the call it made:"),
        code("json", `
[
  { "role": "user", "content": "Where is my refund for o-1003? I am lan@example.com" },
  { "role": "assistant", "content": "call get_refund_status {\\"orderId\\":\\"o-1003\\"}" },
  { "role": "tool", "content": "error UNAVAILABLE: payments-api returned 503" }
]`, "transcript after a call that failed for good"),
        p("Now the transcript has changed, and the model can do something different: answer \"the payments system is not responding, a person will follow up\", ask the learner a question, or try another tool. A permanent error works the same way: `error NOT_FOUND: order o-9999 not found` is exactly what a model needs to ask for the right order number instead of guessing. Keep the message short and factual; it is data for the model, not instructions (lesson 4.2 is about tool output that tries to be instructions)."),
        callout("info", "When not to retry at all",
            "Write tools are different. A refund call that timed out may have been applied: retrying it without an idempotency key can refund twice. Read-only tools, like the ones in this lesson, can be retried safely; a write tool needs an idempotency key or no automatic retry (and, per lesson 4.1, an approval before it runs at all)."),

        challenge("chal_quiz_aam_331"),

        h2("4. Limits, and an escalation instead of a timeout"),
        p("Classification and feedback fix the common cases, but a model can still insist. With the payments API down for an hour, a model that only knows one way to answer a refund question will propose `get_refund_status` again after every error. That is the repeated-call check from lesson 3.1, and behind it the step limit and the budgets from lesson 3.2. Every one of them would have ended the incident within a minute."),
        p("What happens when they fire matters as much as when. A run that cannot finish should not end as an error in the widget. It should end as an **escalation**: a handoff to a person, with enough context that the person does not have to read the trace."),
        bullets([
            "**Why it stopped**: the limit that fired (`repeated_call`, `max_steps`, a budget) and after how many steps.",
            "**The last error**: `UNAVAILABLE: payments-api returned 503` tells the support person, in one line, that this is the outage and not a confused model.",
            "**What was tried and found**: the partial results (lesson 3.1), the conversation id and a link to the trace.",
            "**What the learner was told**: the honest version - \"I could not reach the payments system; a person from billing will reply by email\" - so the human follow-up matches it.",
        ]),
        code("typescript", `
// what the help widget does with an escalation
if (outcome.status === "escalated") {
  await supportQueue.open({
    conversationId,
    summary: outcome.summary,      // e.g. "repeated_call after 4 steps; last error: UNAVAILABLE: ..."
    priority: outcome.summary.includes("UNAVAILABLE") ? "outage" : "normal",
  });
  return "I could not finish this one myself. A person from support has your question and will reply by email.";
}`, "support/widget.ts"),
        p("An escalation is a normal outcome, with its own metric. A spike in escalations with `UNAVAILABLE` as the last error is an outage signal, often faster than the dependency's own alerting. Across conversations, a **circuit breaker** in the tool layer goes one step further: after many failures it stops calling the payments API for everyone for a short while and fails fast, so a thousand conversations do not each spend their retries on a service that is down."),

        h2("5. Reviewing AI-generated agent loops"),
        p("The assistant did not write bad code; it wrote code for the request it got, and nobody tested the case the request left out. When you review a loop that an assistant wrote, read it for these:"),
        numbered([
            "**Every loop has a bound you can name.** `for (;;)` and `while (true)` need a step limit inside them that does not depend on the model or on a tool succeeding.",
            "**Every `catch` either retries with a maximum or surfaces the error.** A catch that only sleeps or logs and then continues is a loop waiting for an outage.",
            "**The transcript changes between two model calls.** If a path can reach `model.next(transcript)` twice with the same transcript, it pays twice for one decision.",
            "**Errors are classified.** Look for the list of retryable codes. \"Retry on any error\" retries NOT_FOUND and FORBIDDEN, and for writes it can repeat a side effect.",
            "**Ask for the failing-tool test.** A fake tool that always fails, one that fails every other call, and a model that repeats itself. If the change came without them, write them before approving.",
        ]),

        h2("6. The exercise: make the loop stop"),
        p("The challenge contains the assistant's `runSupportAgent`, three read-only support tools and a write tool the agent may not use, a fault plan per test (a tool can fail always, every other attempt, or for its first n attempts), a fake clock, and a fake model that behaves like the one in the incident: asked again with an unchanged transcript, it returns the same turn; it moves to its next turn only when the transcript changed. The team's agent policy - maximum steps, same call in a row, retries and base delay - is passed in. The public tests, in which every tool answers, pass on the assistant's code; the hidden tests bring the outage."),
        challenge("chal_coding_aam_332"),

        h2("7. How to verify the fix"),
        bullets([
            "**Fault injection in unit tests.** A fake tool layer with a per-tool fault plan makes every failure mode reproducible in milliseconds: always failing, flaky, permanently wrong input, plus a model that repeats itself.",
            "**Assert the cost, not only the outcome.** Model calls, tool attempts and elapsed time on the fake clock catch the subtle versions of this bug: a loop that does stop, but after re-asking the model once per failure or sleeping the same delay every time.",
            "**A staging outage drill.** Point the payments tool at an endpoint that answers 503 and run a refund conversation: it must escalate within the time budget, with the outage in the summary.",
            "**Dashboards.** Tool errors by code and by retry outcome, escalations by reason and by last error, and model calls per conversation. The incident would have shown as one conversation with hundreds of model calls and one distinct transcript size.",
        ]),

        h2("8. Common mistakes"),
        bullets([
            "**Retrying through the model.** The catch block goes back to `model.next` with an unchanged transcript. Spot it: a path from `catch` to the next model call that appends nothing.",
            "**Retrying permanent errors.** NOT_FOUND gets three retries and three delays. Spot it: a retry condition that looks at the attempt number but not at the error.",
            "**Swallowing the final error.** After the last retry the error is logged but not given to the model, so it proposes the same call. Spot it: the transcript has an assistant call with no tool result after it.",
            "**A fixed delay.** `sleep(500)` before every retry keeps the pressure constant on a service that is already down. Spot it: the delay does not depend on the retry number.",
            "**Stopping without escalating.** The loop now ends, but with an exception or an empty answer, and nobody follows up. Spot it: no outcome type for \"a person needs to take over\".",
        ]),

        h2("9. Summary"),
        numbered([
            "\"Retry until it works\" has no exit: retry temporary tool errors in the tool layer with backoff and a maximum, never permanent ones.",
            "Ask the model again only after the transcript changed; a call that failed for good goes back to the model as an error result so it can change course.",
            "Bound the loop with the limits and budgets of this module, and turn a run that cannot finish into an escalation with a summary: reason, steps and last error.",
        ]),

        h2("Sources"),
        bullets([
            "Anthropic: Building effective agents (ground truth from the environment at each step, stopping conditions, human checkpoints) - anthropic.com/engineering/building-effective-agents",
            "OWASP Top 10 for LLM Applications 2025: LLM10 Unbounded Consumption - owasp.org/www-project-top-10-for-large-language-model-applications",
            "RFC 9110, HTTP Semantics: 503 Service Unavailable and Retry-After; RFC 6585: 429 Too Many Requests",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Find every catch block in your agent's loop and tool layer and write next to it which error codes it retries, how often and after which delays, and what the model sees when it gives up. Then add a circuit breaker to one tool: after five failures within 30 seconds, fail fast for 30 seconds with UNAVAILABLE, and write the fake-clock test that proves it opens and closes."),
    ],
});
