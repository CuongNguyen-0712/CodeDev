// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-aam-3-1",
    title: "Step limits & stop conditions",
    slug: { _type: "slug", current: "agent-step-limits-stop-conditions" },
    description:
        "A refund question kept the CodeDev support agent busy for 212 steps, because its loop had exactly one exit: a final answer from the model. Learn the four stop conditions every agent loop needs - a step limit, a repeated-call check on canonical arguments, a no-progress check with a precise definition of progress, and a real final answer - how to pick the numbers from your own traces, and how to stop with a reason and a partial result instead of a timeout.",
    estimatedTime: 25,

    scenario: {
        role: "Backend engineer owning the CodeDev support agent",
        problem:
            "On Monday the support agent behind the help widget of https://app.codedev.test showed a spinner for almost four minutes to a learner who asked \"Which of my orders can I still refund?\". The audit log for that conversation has 212 tool calls. After the first three steps the model kept alternating between get_order for o-1001 and get_order for o-1003, getting the same two answers every time. The run only ended when the HTTP request from the widget timed out, so the learner got \"Something went wrong\", the two answers the agent had already found were thrown away, and nobody was told why the run stopped.",
    },

    content: [
        h2("1. The incident: a loop with one exit"),
        p("The agent loop from lesson 1.3 is short, and that is its strength. It asks the model for the next turn, runs the tool the model asked for, appends the result to the transcript and asks again:"),
        code("typescript", `
// support/agent.ts - the loop that shipped
export async function runAgent(question: string, model: Model, tools: ToolRegistry) {
  const transcript: Message[] = [{ role: "user", content: question }];
  for (;;) {
    const turn = await model.next(transcript, tools.describe());
    if ("final" in turn) return { answer: turn.final };          // the only way out
    const result = await tools.call(turn.toolCall);
    transcript.push({ role: "assistant", toolCall: turn.toolCall }, { role: "tool", content: result });
  }
}`, "agent.ts (as shipped)"),
        p("The only exit is the model deciding it is done. Most of the time it does. When it does not - because a tool answer confuses it, because it is unsure what \"refundable\" means, because the tools cannot answer the question at all - nothing in the code ends the run. Something outside it does: an HTTP timeout, a process restart, a budget alarm. Those stop the run without a reason and throw away what the agent found."),
        p("A loop that calls a model is still a loop. It needs the same thing every `while` needs in production code: a bound you can state, and a defined outcome for each way it can end."),

        h2("2. Read the evidence"),
        p("Lesson 2.3 gave every tool call an audit record with the run id, the step, the tool, the arguments and a hash of the result. That is enough to see what the agent was doing without reading 212 lines by hand:"),
        code("sql", `
SELECT step, tool, args::text, result_hash
FROM agent_tool_calls
WHERE run_id = 'support-8812'
ORDER BY step
LIMIT 8;

 step | tool        | args                            | result_hash
------+-------------+---------------------------------+------------
    1 | find_orders | {"email": "lan@example.com"}    | 9c1e...
    2 | get_order   | {"orderId": "o-1001"}           | 41aa...
    3 | get_order   | {"orderId": "o-1003"}           | d07b...
    4 | get_order   | {"orderId": "o-1001"}           | 41aa...
    5 | get_order   | {"orderId": "o-1003"}           | d07b...
    6 | get_order   | {"orderId": "o-1001"}           | 41aa...
    7 | get_order   | {"orderId": "o-1003"}           | d07b...
    8 | get_order   | {"orderId": "o-1001"}           | 41aa...`, "psql"),
        p("Two numbers summarise a run better than its length: how many **distinct** calls it made and how many **distinct** results it got back. A healthy run has roughly as many distinct results as steps. This one has 212 steps and 3 distinct results:"),
        code("sql", `
SELECT run_id,
       count(*)                                AS steps,
       count(DISTINCT tool || args::text)      AS distinct_calls,
       count(DISTINCT result_hash)             AS distinct_results
FROM agent_tool_calls
WHERE started_at > now() - interval '7 days'
GROUP BY run_id
HAVING count(*) > 20
ORDER BY steps DESC;

    run_id     | steps | distinct_calls | distinct_results
---------------+-------+----------------+-----------------
 support-8812  |   212 |              3 |                3
 support-8790  |    41 |             38 |               35
 support-8655  |    23 |              4 |                2`, "psql"),
        p("The second row is a long but productive run: almost every step learned something. The first and third are stuck. The query is also the start of your limits: it tells you how many steps real, successful runs need."),

        h2("3. Four stop conditions, and what each one catches"),
        p("Each condition below catches a different failure. None of them replaces the others."),
        h3("Max steps: the backstop"),
        p("Before each model call, check how many steps the run has used. This is the one condition that bounds the loop no matter what the model does, so it must always be there. Pick it from data, not from taste: take the step count of successful runs over a week, look at the high percentiles, and set the limit comfortably above them. If 99% of answered runs need at most 9 steps, a limit of 15 or 20 costs nothing on normal traffic and still stops a stuck run in seconds instead of minutes."),
        h3("Repeated call: the same question, again"),
        p("If the model proposes exactly the same call it just made, it will get exactly the same answer (for read-only tools). Two in a row can be legitimate - the model may not trust a result, or a tool may return newer data - so count identical proposals in a row and stop at a small number, before running the tool again."),
        p("\"Identical\" needs care. The model writes the arguments as JSON, and nothing promises a stable key order: `{\"userId\":\"u-42\",\"courseId\":\"sql-basics\"}` and `{\"courseId\":\"sql-basics\",\"userId\":\"u-42\"}` are the same question. Compare a **canonical** form of the arguments: object keys sorted at every level, arrays kept in order, then stringified together with the tool name. Comparing raw `JSON.stringify` output silently misses the case it was written for."),
        h3("No progress: moving, but learning nothing"),
        p("The incident run never repeated a call twice in a row: it alternated. A repeated-call check misses cycles like A, B, A, B or A, B, C, A, B, C. What all of them have in common is that the results stop being new. So define progress explicitly and count the steps without it:"),
        bullets([
            "**A new result**: the tool returned a text (or a result hash) not seen before in this run. Simple, cheap, and it catches cycles of any length. This is the definition used in the exercise.",
            "**A new call**: the name and canonical arguments were not used before. Weaker - a model can ask for o-2001, o-2002, o-2003... forever, each call new, each result \"not found\".",
            "**A domain signal**: a new order id, a new fact added to a working memory. More precise, more code, and it has to be maintained with the tools.",
        ]),
        p("Write the definition down next to the limit. \"No progress for 3 steps\" means nothing until you say what progress is, and two engineers will otherwise implement two different checks."),
        h3("A real final answer"),
        p("The shipped loop treated any `final` as success, including an empty string or a turn the parser could not read. Model output is parsed data, not a type you can trust: check that a final answer is a non-empty string and that a tool call has a name. Anything else is not an answer and ends the run with its own reason, so it shows up in the metrics instead of as a blank message in the widget."),
        callout("info", "When you do not need these",
            "A fixed workflow (lesson 1.1) - classify the ticket, look up the order, draft a reply - has a known number of steps and needs none of this: its bound is the code. Stop conditions are the price of letting a model choose the next step. If you find yourself tuning limits for a flow that always runs the same three tools, that is a sign it should be a workflow."),

        challenge("chal_quiz_aam_311"),

        h2("4. Stop with a reason and a partial result"),
        p("Hitting a limit is not a crash. It is one of the outcomes the product has to handle, and the loop should return it like any other: a **reason** (which condition fired), the **step count**, and a **partial result** - what the agent did find. In the incident, the agent had found both orders and their status in the first three steps; a stop a few steps later, with those results, would have let the widget say something useful."),
        code("typescript", `
type StopReason = "final" | "max_steps" | "repeated_call" | "no_progress" | "no_final_answer";
type RunResult = { reason: StopReason; steps: number; answer: string | null; partial: string[] };

// What the help widget does with each outcome
function toReply(result: RunResult): string {
  if (result.reason === "final" && result.answer) return result.answer;
  if (result.partial.length === 0) return "I could not find an answer. A support person will reply by email.";
  return [
    "I could not finish, but this is what I found:",
    ...result.partial.map((fact) => "- " + fact),
    "A support person will check the rest and reply by email.",
  ].join("\\n");
}`, "support/reply.ts"),
        p("The reason also goes to your metrics. A counter of runs by stop reason is the single most useful agent dashboard: a rising share of `max_steps` or `no_progress` after a prompt or tool change is a regression you can see the same day, long before a learner complains."),
        code("text", `
agent_runs_total{agent="support", reason="final"}            9 412
agent_runs_total{agent="support", reason="no_progress"}         61
agent_runs_total{agent="support", reason="repeated_call"}       38
agent_runs_total{agent="support", reason="max_steps"}            7
agent_runs_total{agent="support", reason="no_final_answer"}      3`, "metrics, last 7 days"),

        h2("5. The exercise: four exits for runAgent"),
        p("In the challenge you get the support agent's loop with its one exit, three read-only tools that never throw (a problem comes back as a result starting with `error:`), and a fake model that replays a script and repeats its last turn when the script runs out - a stuck model, on demand. Order matters, so decide it before writing code:"),
        numbered([
            "**Before the model call**: is the step budget used up?",
            "**When the turn arrives**: is it a usable final answer, a usable tool call, or neither? Is it the same call as the previous step, for the K-th time?",
            "**After the tool ran**: was the result new? If not, how many results in a row have not been?",
        ]),
        p("The test runner prints the reason, the step count, the answer and the partial result of every scripted run, so each condition is visible on its own. The hidden tests include argument objects whose keys come in a different order, cycles that never repeat a call twice in a row, and malformed turns."),
        challenge("chal_coding_aam_312"),

        h2("6. How to verify stop conditions"),
        bullets([
            "**One scripted run per condition.** A fake model that replays a script makes every stop reproducible: a model that never stops, one that alternates two calls, one that sends `{ \"final\": \"\" }`. Assert the reason and the step count, not only that the run ended.",
            "**A test at each boundary.** A final answer on exactly the last allowed step must be accepted; a tool call there must not run another step. Off-by-one errors in limits are the most common bug and the cheapest to test.",
            "**Replay real traces.** Turn a stuck run from the audit log (like support-8812) into a script and keep it as a regression test.",
            "**Watch the stop-reason metric.** After deploying new limits, the share of `final` should not drop. If it does, the limits are cutting off runs that would have succeeded: compare the step counts of those runs with the percentile you chose.",
        ]),

        h2("7. Common mistakes"),
        bullets([
            "**Only a max-step limit.** It bounds the loop but lets a stuck run burn every allowed step. Spot it: runs that stop at exactly the limit with very few distinct results.",
            "**Comparing raw JSON of the arguments.** Key order differs between turns and the repeated-call check never fires. Spot it: a trace with the same arguments in a different order, three times in a row, and no stop.",
            "**\"No progress\" without a definition.** The check ends up comparing tool names, or never resets. Spot it: ask the author what counts as progress; if the answer is not in the code next to the limit, it is not defined.",
            "**Treating any final as success.** An empty or unparseable final reaches the learner as a blank message. Spot it: `if (\"final\" in turn) return` with no check of the value.",
            "**Throwing on a limit.** The run ends as an error, the partial result is lost and the stop reason is missing from the metrics. Spot it: `throw new Error(\"too many steps\")` inside the loop.",
        ]),

        h2("8. Summary"),
        numbered([
            "An agent loop needs a bound that does not depend on the model: a step limit chosen from the step counts of real successful runs.",
            "Stuck runs come in two shapes: the same call again (compare canonical arguments, in a row) and cycles that bring nothing new (count steps without progress, with progress defined in code).",
            "Every stop returns a reason, a step count and a partial result, so the product can answer honestly and the metrics show which condition fires.",
        ]),

        h2("Sources"),
        bullets([
            "Anthropic: Building effective agents (agents need stopping conditions such as a maximum number of iterations) - anthropic.com/engineering/building-effective-agents",
            "OWASP Top 10 for LLM Applications 2025: LLM10 Unbounded Consumption - owasp.org/www-project-top-10-for-large-language-model-applications",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Run the distinct-results query from section 2 on your own agent's audit log (or on a week of traces). Pick a step limit from the step counts of runs that ended with a final answer, write down your definition of progress, and turn the three longest stuck runs into scripted regression tests for your loop."),
    ],
});
