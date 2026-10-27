// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-aam-1-3",
    title: "The agent loop, tested with a fake model",
    slug: { _type: "slug", current: "agent-loop-tested-with-fake-model" },
    description:
        "In one week 212 support-agent runs ended in the generic fallback reply: the loop ran only the first of two parallel tool calls, so the model API rejected the next request; a tool timeout escaped as an exception and failed the whole ticket; and an unknown tool name crashed the handler lookup. Learn the invariants of an agent loop (every turn recorded, every call answered once and in order, recoverable errors fed back as structured data, unrecoverable ones stop the run), how to handle parallel calls, and how to test all of it with a scripted fake model that checks the protocol like a real API.",
    estimatedTime: 30,

    scenario: {
        role: "Backend engineer, CodeDev support agent",
        problem:
            "Support lead, Friday: \"One ticket in ten gets 'We couldn't process your request' and lands back in the human queue.\" The agent_runs table shows 212 of 1,980 runs this week ended with run_failed. 131 of them stopped on a model API error, 400 invalid_request: tool call call_4 has no matching tool result; 74 on a tool exception such as TimeoutError: orders API timed out after 5000 ms; 7 on TypeError: handlers[call.name] is not a function. Nobody could reproduce the first group by hand: it only happens when the model proposes two tool calls in the same turn.",
    },

    content: [
        h2("1. The incident: a loop that only handled the happy path"),
        p("Lesson 1.1 put an agent inside the investigation step, and lesson 1.2 gave it a registry of narrow tools. What connects them is the loop: ask the model, run what it proposes, give it the results, ask again. This is the loop that shipped:"),
        code("typescript", `
// support/agent.ts - the version that shipped
async function runSupportAgent(ticket: Ticket): Promise<string> {
    const messages: Message[] = [{ role: "user", content: ticket.text }];
    for (;;) {
        const reply = await llm.chat({ messages, tools: registry.listTools() });
        if (reply.final !== undefined) return reply.final;
        const call = reply.toolCalls[0];                          // "the model only ever asks for one"
        const result = await handlers[call.name](call.args);      // a plain object of handler functions
        messages.push({ role: "assistant", toolCalls: reply.toolCalls });
        messages.push({ role: "tool", callId: call.id, content: JSON.stringify(result) });
    }
}`, "support/agent.ts"),
        p("It worked in every manual test, because manual tests are happy paths: one tool call per turn, every tool answering. Production is not. The model sometimes proposes two independent lookups at once, the orders API sometimes times out, and the model sometimes invents a tool name."),

        h2("2. Read the evidence"),
        p("The agent logs one line per step. Two failed tickets from Tuesday:"),
        code("text", `
11:02:41.118 agent tkt_9120 turn=3 model_tool_calls=2 [call_3 get_order {"order_id":"ord_88"}, call_4 get_order {"order_id":"ord_89"}]
11:02:41.403 agent tkt_9120 tool call_3 get_order ok 284ms
11:02:42.950 agent tkt_9120 model_request 400 invalid_request: tool call call_4 has no matching tool result
11:02:42.951 agent tkt_9120 run_failed -> fallback reply

11:17:00.655 agent tkt_9131 turn=1 model_tool_calls=1 [call_1 list_orders {}]
11:17:05.660 agent tkt_9131 tool call_1 list_orders threw TimeoutError: orders API timed out after 5000 ms
11:17:05.661 agent tkt_9131 run_failed (500) -> fallback reply`, "agent log"),
        p("Each failure maps to one line of the loop:"),
        bullets([
            "**tkt_9120:** the model proposed `call_3` and `call_4`. The loop ran `toolCalls[0]` only, then recorded both calls in the assistant message but a result for one. Model APIs require a result for every tool call of the previous turn before they accept the next request, so the provider rejected it. (Every provider has such a rule; the exact error text is the provider's, the one above is CodeDev's log wording.)",
            "**tkt_9131:** the handler threw. Nothing caught it, so a timeout the model could easily have worked around (try again, or look the order up another way) became a failed ticket.",
            "**The 7 TypeErrors:** the model proposed `lookup_order`, which is not a key of `handlers`. Worse, a proposal named `constructor` would not even fail: every plain object inherits `constructor`, so `handlers[\"constructor\"](args)` quietly runs the `Object` constructor. A `Map` has no inherited keys.",
        ]),
        p("And why nobody caught it before production: there were no tests. Every change was checked by chatting with the real model, which proposes parallel calls only sometimes and never times out on demand."),

        h2("3. Core idea: the loop is the agent, and it has invariants"),
        p("The model is a function from a transcript to the next turn: either a final answer, or one or more proposed tool calls. Everything else - running tools, recording results, deciding when to stop - is your code. That code is ordinary, testable, and must hold a few invariants no matter what the model proposes:"),
        numbered([
            "**Record every turn as proposed.** Append the assistant's tool calls to the transcript, all of them, before running any. The transcript is the agent's memory and your audit trail.",
            "**Answer every call exactly once, in call order.** One tool message per proposed call, with its id, even when the call was rejected or failed. This is what the provider's API checks, and it is what lets the model match results to requests.",
            "**Feed recoverable errors back as data.** An unknown tool, invalid arguments and a tool that threw are all things the model can react to: pick another tool, fix the arguments, retry, ask the learner, or give up gracefully. Give each a structured entry: a code the model and your dashboards can rely on, and a message that says what to do.",
            "**Stop on errors the model cannot fix.** The model API rejecting the request, a bug in your own code, and (from lesson 3.1) a step or budget limit. Catching those and asking the model again only repeats the failure at full price.",
            "**Use ids you control.** Number calls over the whole run (`call_1`, `call_2`, ...) so a result can never be confused with a call from an earlier turn, and so two runs of the same script produce identical transcripts.",
        ]),
        h3("Three kinds of tool error"),
        code("json", `
{ "role": "tool", "callId": "call_3", "name": "lookup_order", "ok": false,
  "error": { "code": "unknown_tool", "message": "unknown tool \\"lookup_order\\"; available tools: list_orders, get_order, get_progress" } }

{ "role": "tool", "callId": "call_4", "name": "get_progress", "ok": false,
  "error": { "code": "invalid_arguments", "message": "\\"course_slug\\" must be string" } }

{ "role": "tool", "callId": "call_1", "name": "list_orders", "ok": false,
  "error": { "code": "tool_failed", "message": "orders API timed out after 5000 ms" } }`, "tool error entries"),
        p("The unknown-tool message lists the real names, because the most common cause is a near miss (`lookup_order` for `get_order`). Invalid arguments use the registry's messages from lesson 1.2, every violation at once. A tool failure carries the error's message and nothing more: no stack trace, no SQL, no internal hostnames. Whatever you put in a tool result reaches the model and can reach the learner (module 4 treats tool output as untrusted in the other direction too)."),
        h3("Parallel tool calls"),
        p("A model may propose several independent calls in one turn: look up two orders, or an order and the course progress. Two rules keep this simple:"),
        bullets([
            "**One assistant message, then one result per call in the same order.** Even when the second call fails validation, the third still runs, and every call gets its entry.",
            "**Concurrency is an optimisation, not a requirement.** Read-only tools can run with `Promise.all` to save latency, as long as the results are appended in call order, not in completion order. Tools that write should run one at a time (module 4 adds approvals). The exercise runs calls sequentially, which is always correct.",
        ]),
        h3("Test the loop with a fake model"),
        p("The model is the only nondeterministic part, so replace it with a script: turn 1 proposes this call, turn 2 proposes these two, turn 3 answers. The Node.js AI course used a fake model for single requests; for a loop the fake should also **check the protocol** the way the provider does, and throw when a call has no result. Then the tkt_9120 bug fails a unit test in milliseconds instead of one production ticket in ten."),
        callout("info", "No step limit yet",
            "A model that keeps calling a failing tool will keep this loop running forever. Lesson 3.1 adds step limits and stop conditions; in this lesson's exercise the fake model itself refuses to answer more than 50 turns, so a stuck run ends with an error instead of hanging the test."),

        challenge("chal_quiz_aam_131"),

        h2("4. Worked example: the fake model and a test"),
        p("The types are small. The exercise keeps everything synchronous so the tests are deterministic; in production `next` and `run` return promises and the loop awaits them, nothing else changes:"),
        code("typescript", `
type ToolCall = { name: string; args: unknown };
type ModelTurn = { toolCall: ToolCall } | { toolCalls: ToolCall[] } | { final: string };

type ToolError = { code: "unknown_tool" | "invalid_arguments" | "tool_failed"; message: string };
type Message =
    | { role: "user"; content: string }
    | { role: "assistant"; toolCalls: { id: string; name: string; args: unknown }[] }
    | { role: "assistant"; final: string }
    | { role: "tool"; callId: string; name: string; ok: true; result: unknown }
    | { role: "tool"; callId: string; name: string; ok: false; error: ToolError };

type Model = { next(transcript: readonly Message[]): ModelTurn };
type Tool = { validate(args: unknown): string[]; run(args: unknown): unknown };`, "agent/types.ts"),
        p("The scripted model returns its turns in order and, before each one, checks that the previous turn's calls were all answered, in order:"),
        code("typescript", `
export function scriptedModel(script: ModelTurn[]): Model {
    let index = 0;
    return {
        next(transcript) {
            const last = transcript.findLastIndex((m) => m.role === "assistant");
            const previous = transcript[last];
            if (previous !== undefined && "toolCalls" in previous) {
                const answered = transcript.slice(last + 1).map((m) => (m.role === "tool" ? m.callId : "?"));
                const expected = previous.toolCalls.map((c) => c.id);
                if (answered.join() !== expected.join()) {
                    throw new Error(\`tool results [\${answered}] do not answer tool calls [\${expected}]\`);
                }
            }
            return script[Math.min(index++, script.length - 1)];
        },
    };
}

export function scriptedTool(outcomes: ({ ok: unknown } | { throw: string })[], validate = (_: unknown): string[] => []) {
    let runs = 0;
    return {
        runs: () => runs,
        validate,
        run(): unknown {
            const outcome = outcomes[Math.min(runs++, outcomes.length - 1)];
            if ("throw" in outcome) throw new Error(outcome.throw);
            return outcome.ok;
        },
    };
}`, "agent/fakes.ts"),
        p("The regression test for tkt_9120 and tkt_9131 replays both failures in one script: a timeout first, then two parallel lookups. It asserts on the transcript and on what the tools actually did, not on the wording of the final answer:"),
        code("typescript", `
import { test } from "node:test";
import assert from "node:assert/strict";

test("a timeout is fed back, and both parallel calls get a result in order", () => {
    const listOrders = scriptedTool([{ throw: "orders API timed out after 5000 ms" }, { ok: [{ id: "ord_88" }, { id: "ord_89" }] }]);
    const getOrder = scriptedTool([{ ok: { id: "ord_88", status: "paid" } }, { ok: { id: "ord_89", status: "authorization_pending" } }]);
    const model = scriptedModel([
        { toolCall: { name: "list_orders", args: {} } },
        { toolCall: { name: "list_orders", args: {} } },
        { toolCalls: [{ name: "get_order", args: { order_id: "ord_88" } }, { name: "get_order", args: { order_id: "ord_89" } }] },
        { final: "You were charged once; ord_89 is a pending authorization." },
    ]);

    const run = runAgent(model, new Map([["list_orders", listOrders], ["get_order", getOrder]]), "Ticket #9120 ...");

    assert.deepEqual(run.transcript[2], {
        role: "tool", callId: "call_1", name: "list_orders", ok: false,
        error: { code: "tool_failed", message: "orders API timed out after 5000 ms" },
    });
    assert.deepEqual(run.transcript.filter((m) => m.role === "tool").map((m) => m.callId), ["call_1", "call_2", "call_3", "call_4"]);
    assert.equal(getOrder.runs(), 2);
    assert.equal(run.answer, "You were charged once; ord_89 is a pending authorization.");
});`, "agent/loop.test.ts"),
        bullets([
            "The script is the recorded production trace, turned into data. Any incident trace can become a test the same way.",
            "If the loop drops `call_4`, the fake model throws exactly as the provider did, with a message that names the missing id.",
            "`getOrder.runs()` proves what happened in the world: two lookups, not one and not three. A wrong answer text is a model problem; a wrong number of runs is a loop bug.",
        ]),

        h2("5. How to verify"),
        bullets([
            "**One scripted scenario per failure mode.** Happy path; invalid arguments then fixed; unknown tool; a tool that throws an `Error`, a string and an object; parallel calls with a bad one in the middle; a final answer on the first turn. Each is a few lines of script.",
            "**Assert the invariants, not just the answer.** Every call id appears exactly once as a result, in order; the tool ran only for valid calls; the counters match the transcript.",
            "**Replay production traces.** When a run fails in production, copy its model turns into a script and add it to the suite before fixing the bug. The test fails first, then passes.",
            "**Watch the counters in production.** Per run: model turns, tool calls, invalid arguments, unknown tools, tool failures. A rising invalid-argument rate for one tool points at its description (lesson 1.2); a rising failure rate points at a dependency; a run_failed on a model API error points at the loop itself.",
        ]),

        h2("6. Common mistakes"),
        bullets([
            "**Running only the first call.** `reply.toolCalls[0]` works until the model proposes two. Spot any index into the list of calls, and any loop over calls that can `break` or `continue` without appending a result.",
            "**Letting tool exceptions escape.** One timeout turns into a failed ticket. Spot a handler call with no `try`/`catch` around it, or fallback replies in the logs right after a tool error.",
            "**Sending internals to the model.** `String(err.stack)` or a raw error object puts file paths, SQL and hostnames into the transcript. Spot error messages built from anything but a deliberate, short text.",
            "**Looking up handlers on a plain object.** `handlers[call.name]` finds `constructor`, `toString` and friends. Use a `Map` (or `Object.hasOwn`) and check the name before anything else.",
            "**Catching everything, including model API errors.** A `try`/`catch` around the model call that logs and continues asks the model the same rejected question forever, at full price. Spot `continue` in a `catch` around `next` or `chat`.",
        ]),

        h2("7. Write the agent loop"),
        p("Write `runAgent` for the support agent: ask the scripted model for a turn, record it, validate and run each proposed call, append one result or structured error per call in order, and repeat until the model gives a final answer. The tests replay the incident, parallel calls with failures in the middle, every kind of thrown value, unknown names such as `constructor` and `__proto__`, a model stuck on a failing tool, and a 49-turn nightly review with 343 calls."),
        challenge("chal_coding_aam_132"),

        h2("8. Summary"),
        numbered([
            "The loop is ordinary code around one nondeterministic function. Its invariants: record every turn, answer every call exactly once and in call order, use ids you control.",
            "Errors the model can act on (unknown tool, invalid arguments, a tool that failed) go back as structured entries with a short, useful message; errors it cannot fix stop the run.",
            "Test the loop with a scripted fake model that checks the protocol like the real API, and turn every production failure into a script before you fix it.",
        ]),

        h2("Sources"),
        bullets([
            "Anthropic, \"Building effective agents\" - anthropic.com/engineering/building-effective-agents (the agent loop, tool results as environment feedback, testing in sandboxed environments)",
            "Your model provider's tool-use documentation, for its exact rules on tool call ids, parallel calls and matching tool results",
            "Node.js documentation, node:test and node:assert - nodejs.org/api/test.html",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Take one real or invented support ticket and write its trace as a script: the turns a model would propose, including one invalid call and one tool failure. Run it through your loop from the exercise, then change one tool to throw on its second run and predict the transcript before you look. Finally, make the read-only calls of a turn run with Promise.all and check that the transcript is identical."),
    ],
});
