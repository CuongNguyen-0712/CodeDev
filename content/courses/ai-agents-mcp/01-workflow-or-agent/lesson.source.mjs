// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-aam-1-1",
    title: "Workflow or agent? Choosing the simplest thing that works",
    slug: { _type: "slug", current: "workflow-or-agent-simplest-thing-that-works" },
    description:
        "The CodeDev refund assistant was an agent with nine tools, and it made a decision that fits on an index card: refund when the order is at most 14 days old, progress is under 30% and nothing was refunded yet. It took up to 23 model calls per ticket and gave different answers to the same ticket. Learn the difference between a workflow (fixed steps, a model inside some of them) and an agent (the model chooses the steps), what each costs in money, latency, debuggability and failure modes, why you start with a workflow, and when an agent earns its place.",
    estimatedTime: 25,

    scenario: {
        role: "Backend engineer, CodeDev support automation",
        problem:
            "Support lead, Monday: \"The refund assistant refunded order ord_5512, paid 41 days ago, and refused ord_6020, paid 3 days ago with 12% progress. Both learners complained.\" The assistant is an agent: a model with nine tools (get_ticket, list_orders, get_order, get_enrollment, get_progress, search_policy, issue_refund, send_reply, escalate) and a system prompt that states the refund policy. Last week it handled 1,240 refund tickets with a median of 9 model calls per ticket (p95 23), a median of 31 s per ticket (p95 94 s) and 37 decisions that a human later reversed. Replaying ticket #8812 five times with the same model and prompt produced three different tool sequences and two different decisions.",
    },

    content: [
        h2("1. The incident: an agent for a decision that fits on an index card"),
        p("The refund policy of CodeDev has three rules. A learner gets a full refund when the order was paid at most 14 days ago, their progress in that course is below 30%, and the order was not refunded before. Anything else gets a polite no, or goes to a human when the ticket is unclear."),
        p("The first version of the refund assistant was built as an agent, because that was the exciting option: give the model the tools, put the policy in the system prompt, and let it figure out the rest. It worked in the demo. In production it did this:"),
        code("text", `
ticket #8812  learner u_3307  "I bought React Hooks by mistake last week, can I get my money back?"
step 1  model -> get_ticket {"ticket_id":"8812"}
step 2  model -> list_orders {}
step 3  model -> get_order {"order_id":"ord_6020"}
step 4  model -> search_policy {"query":"refund rules"}
step 5  model -> get_enrollment {"course_slug":"react-hooks"}
step 6  model -> get_progress {"course_slug":"react-hooks"}
step 7  model -> search_policy {"query":"refund progress threshold"}
step 8  model -> get_order {"order_id":"ord_6020"}
step 9  model -> final: "I'm sorry, refunds are only possible before you start the course."
        tokens in 61,840 / out 1,210   latency 38.4 s   decision: deny   (human review: should be refund, progress 12%)`, "agent trace, ticket #8812"),
        p("Nine model calls to fetch three facts, two of them repeated, and a wrong answer at the end: the model mixed up the policy it had read with something that sounded plausible. Nothing in this trace is a bug in the usual sense. The agent did what agents do: it chose its own steps, one model call at a time."),

        h2("2. Read the evidence"),
        p("Before changing the design, measure what the current one does. The team replayed ticket #8812 five times against recorded tool results (the same order, the same progress), so the only thing that could vary was the model:"),
        code("text", `
replay  model calls  tools called (in order)                                         decision
1       9            get_ticket list_orders get_order search_policy get_enrollment ...  deny
2       6            get_ticket list_orders get_order get_progress search_policy       refund
3       9            get_ticket list_orders get_order search_policy get_enrollment ...  deny
4       5            list_orders get_order get_progress search_policy                  refund
5       7            get_ticket get_order get_progress get_enrollment search_policy ...  refund

distinct tool sequences: 3    distinct decisions: 2`, "replay of ticket #8812, recorded tool results"),
        p("And the week as a whole, from the `agent_runs` table the assistant writes after each ticket:"),
        code("sql", `
SELECT count(*)                                                         AS tickets,
       percentile_cont(0.5)  WITHIN GROUP (ORDER BY model_calls)        AS p50_calls,
       percentile_cont(0.95) WITHIN GROUP (ORDER BY model_calls)        AS p95_calls,
       percentile_cont(0.5)  WITHIN GROUP (ORDER BY duration_ms) / 1000 AS p50_seconds,
       percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) / 1000 AS p95_seconds,
       sum(input_tokens) / count(*)                                     AS avg_input_tokens,
       count(*) FILTER (WHERE human_override)                           AS reversed
FROM agent_runs
WHERE flow = 'refund' AND created_at >= now() - interval '7 days';

 tickets | p50_calls | p95_calls | p50_seconds | p95_seconds | avg_input_tokens | reversed
---------+-----------+-----------+-------------+-------------+------------------+---------
    1240 |         9 |        23 |          31 |          94 |            48210 |       37`, "psql"),
        p("Three observations. The decision needs three facts that the server can fetch with three queries it already has. The model is asked to rediscover the order of those queries on every ticket, and it does not always find the same order. And the input tokens are large because every model call resends the whole growing transcript: step 9 pays again for steps 1 to 8."),

        h2("3. Core idea: who chooses the next step?"),
        p("The useful distinction is not \"uses an LLM\" or \"uses tools\". It is **who decides what happens next**:"),
        bullets([
            "**Workflow:** your code fixes the steps and their order. A model may run inside some steps (classify this ticket, extract the order id, write the reply), but it never chooses which step comes next. Branches exist, but they are `if` statements you wrote and can test.",
            "**Agent:** the model chooses the next step. In a loop, it reads the transcript so far and either proposes a tool call or answers. The number and order of steps are decided at run time, by the model.",
        ]),
        p("Anthropic's article \"Building effective agents\" draws the same line (workflows orchestrate models and tools through predefined code paths; agents let the model direct its own process and tool use) and lists common workflow shapes worth knowing by name: prompt chaining (step after step, with checks between), routing (classify, then send to a specialised path), parallelization (several calls at once, then combine), orchestrator-workers and evaluator-optimizer. Most production AI features are one of these, not an agent."),
        h3("What the choice costs"),
        bullets([
            "**Cost.** Each agent step is a model call, and each call resends the transcript, so tokens grow faster than the number of steps. A workflow makes a known number of calls with prompts sized for one job.",
            "**Latency.** Agent steps are sequential: the model must see one result before it can ask for the next. A workflow can fetch independent facts in parallel and call the model once.",
            "**Debuggability.** Every workflow trace has the same shape, so you can compare two runs line by line and know which step went wrong. Two agent traces for the same input can differ in length and order, as the replay showed.",
            "**Testing.** A workflow step is a function: unit test it with a fake model for that one step. An agent needs a scripted fake model for whole conversations (lesson 1.3) and an eval over many runs, because one passing run proves little.",
            "**Failure modes.** A workflow step fails at a boundary you control: bad extraction, validation error, a fallback. An agent adds new ones: it loops, calls the wrong tool, stops too early, repeats a call, or follows instructions it found in a ticket (module 4).",
        ]),
        h3("Start with a workflow"),
        p("Write the steps you would follow by hand. If you can write them down, code them, and use a model only for the steps code cannot do well: understanding free text, extracting fields from it, writing a reply. That is the simplest design that works, and it gives you a baseline to measure anything fancier against."),
        h3("When an agent earns its place"),
        p("Reach for an agent when all of these hold, and say which one in the design doc:"),
        numbered([
            "**The steps cannot be listed in advance.** The task is open-ended: what to look at next depends on what the last result showed, and the number of steps varies a lot between tasks. Investigating \"why does my progress show 40% when I finished every lesson?\" is like that; applying a refund policy is not.",
            "**There are many tools, and choosing among them is the hard part.** If every task uses the same three tools in the same order, that order is a workflow.",
            "**Mistakes are recoverable.** The tools are read-only, or run in a sandbox, or every write waits for a human approval. A wrong step costs a little time, not a refund.",
            "**Success can be checked.** Tests pass, the answer cites the records it used, or a human reviews the result. Without that you cannot evaluate the agent, and you cannot tell whether a change made it better.",
        ]),
        p("And the reverse, when not to use one: the decision is a fixed policy (money, permissions, grades), the latency budget is tight (an in-page hint that must appear in 2 seconds), or someone must be able to explain every decision afterwards. In those cases the policy belongs in code, where it can be read, tested and audited."),
        callout("info", "The common production shape is a hybrid",
            "A workflow on the outside, an agent inside one step. Route the ticket with a classifier; refunds go through the coded policy; an unclear technical problem goes to an investigation step where an agent may use read-only tools for a bounded number of steps and hands its findings to a human. Only the part that needs freedom gets it."),

        challenge("chal_quiz_aam_111"),

        h2("4. Worked example: the refund triage as a workflow"),
        p("The rewrite keeps the model for the two things it is good at, reading the ticket and writing the reply, and moves the decision into code. Each step has a typed input and output, so each can be tested alone:"),
        code("typescript", `
type Intent = "refund" | "progress_problem" | "billing_other" | "unclear";
type Extraction = { intent: Intent; orderId: string | null };
type Decision = { refund: boolean; reason: "eligible" | "already_refunded" | "older_than_14_days" | "progress_30_or_more" };

type Deps = {
    extract(ticketText: string): Promise<Extraction>;           // one model call, structured output, validated
    draftReply(decision: Decision, ticketText: string): Promise<string>; // one model call, words only
    orders: { findForLearner(learnerId: string, orderId: string | null): Promise<Order | null> };
    progress: { percent(learnerId: string, courseId: string): Promise<number> };
    now(): number;
};

type Order = { id: string; courseId: string; paidAt: number; refundedAt: number | null };
type Ticket = { id: string; learnerId: string; text: string };   // learnerId comes from the ticket, never from a model
type Outcome =
    | { kind: "route"; queue: Exclude<Intent, "refund"> }
    | { kind: "ask_human"; why: string }
    | { kind: "proposal"; decision: Decision; reply: string; needsApproval: boolean };

const DAY_MS = 86_400_000;

// The policy is code: readable, testable, the same answer every time.
export function refundPolicy(order: Order, progressPercent: number, now: number): Decision {
    if (order.refundedAt !== null) return { refund: false, reason: "already_refunded" };
    if (now - order.paidAt > 14 * DAY_MS) return { refund: false, reason: "older_than_14_days" };
    if (progressPercent >= 30) return { refund: false, reason: "progress_30_or_more" };
    return { refund: true, reason: "eligible" };
}

export async function triageRefund(ticket: Ticket, deps: Deps): Promise<Outcome> {
    const { intent, orderId } = await deps.extract(ticket.text);                 // step 1: model
    if (intent !== "refund") return { kind: "route", queue: intent };            // routing, an if you wrote
    const order = await deps.orders.findForLearner(ticket.learnerId, orderId);    // step 2: code
    if (order === null) return { kind: "ask_human", why: "no matching order for this learner" };
    const percent = await deps.progress.percent(ticket.learnerId, order.courseId);
    const decision = refundPolicy(order, percent, deps.now());                   // step 3: code
    const reply = await deps.draftReply(decision, ticket.text);                  // step 4: model
    return { kind: "proposal", decision, reply, needsApproval: decision.refund }; // step 5: a human approves refunds
}`, "support/refundTriage.ts"),
        bullets([
            "Two model calls per ticket, always. The prompts are small because each one has one job, and the transcript never grows.",
            "`findForLearner` takes the learner from the ticket and the order id from the model, and returns `null` when that order does not belong to that learner. The model can point at an order; it cannot point at someone else's.",
            "The model's reply is drafted **from** the decision. It can phrase a refusal kindly; it cannot turn it into a refund.",
            "`now()` is injected, so the 14-day rule is tested with a fake clock: paid 14 days ago exactly is eligible, 14 days and one millisecond is not.",
        ]),
        h3("Where the agent goes"),
        p("Not every ticket fits a flowchart. \"My progress shows 40% but I finished everything\" can come from a lesson added after the learner finished, a submission stuck in grading, a failed sync job or a cached page. The route for `progress_problem` hands that ticket to an agent, inside fixed walls:"),
        code("typescript", `
const investigationTools = [getCourseOutline, listLessonCompletions, listSubmissions, getSyncJobStatus]; // all read-only

if (intent === "progress_problem") {
    const findings = await investigate(ticket, { tools: investigationTools, maxSteps: 12 }); // the agent (lessons 1.3 and 3.1)
    return { kind: "ask_human", why: findings.summary };                                  // a person decides what to do
}`, "support/route.ts"),
        p("Every condition from section 3 holds: the steps depend on what each lookup shows, there are several tools to choose among, every tool is read-only, and a human checks the findings. The agent's freedom is real but small, and the rest of the ticket flow stays a workflow."),

        h2("5. How to verify the choice"),
        p("\"The agent feels smarter\" is not evidence. Run both designs on the same recorded tickets and compare numbers:"),
        bullets([
            "**An eval set from real tickets.** Take a few hundred closed refund tickets with the decision a human confirmed (the eval-set techniques from the LLM Evaluation course apply directly). Replay each through both designs with recorded tool results.",
            "**Correct decisions.** The share of tickets where the design's decision matches the confirmed one. For the policy itself you do not need an eval at all: `refundPolicy` has unit tests.",
            "**Model calls, tokens, latency, cost per ticket**, at the median and at p95. The query from section 2 works on any design that writes one row per run.",
            "**Variance.** Replay each ticket five times and count distinct decisions. A workflow with a deterministic policy should give one; anything above one is a finding, not noise.",
            "**Explainability.** Give a reviewer ten random traces and time how long it takes to say why each decision was made. Fixed-shape traces win this every time.",
        ]),
        p("Write the result down as a short decision record: the options, the numbers, the choice and what would make you revisit it (for example, \"if more than 20% of refund tickets end in ask_human because the steps do not fit, reconsider an investigation agent for them\")."),

        h2("6. Common mistakes"),
        bullets([
            "**An agent for a flowchart.** If you can draw the decision on one page, it is a workflow. Spot it when the system prompt contains policy rules (\"refund only if...\"): rules in a prompt are rules nobody can unit test.",
            "**A workflow whose model makes the decision.** A step that asks the model \"is this refund eligible?\" and runs the refund on its answer is an agent with fewer steps. Spot a model output field such as `approve` or `eligible` used in an `if` right before a write.",
            "**Choosing an agent \"for flexibility later\".** Flexibility you do not use costs tokens, latency and predictability on every request. Spot it when no ticket in the eval set needs a step outside the workflow.",
            "**Judging by a demo.** Five hand-picked tickets in a meeting say nothing about p95 latency or variance. Spot it when the design doc has no eval set and no replay numbers.",
            "**An agent without walls.** No step limit, no budget, writes without approval. Spot a `while (true)` around the model call and a write tool with no approval step; modules 3 and 4 fix both.",
        ]),

        h2("7. Summary"),
        numbered([
            "A workflow fixes the steps in code and may use a model inside a step; an agent lets the model choose the next step. The difference shows up in cost, latency, debuggability, testing and failure modes.",
            "Start with a workflow and keep decisions about money, permissions and grades in code. Use the model to read and to write, not to apply policy.",
            "An agent earns its place when the steps cannot be listed in advance, there are many tools to choose among, mistakes are recoverable and success can be checked. Even then, put it inside one step of a workflow, with walls.",
        ]),

        h2("Sources"),
        bullets([
            "Anthropic, \"Building effective agents\" - anthropic.com/engineering/building-effective-agents (workflows vs agents, workflow patterns, when to use agents)",
            "OWASP Top 10 for Large Language Model Applications 2025, LLM06 Excessive Agency - owasp.org/www-project-top-10-for-large-language-model-applications",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "List the AI features of a product you work on, or the CodeDev support flows (refunds, password resets, certificate questions, progress problems). For each one, write the steps a human would follow. Mark the steps that need a model (reading or writing free text) and the ones that are lookups or rules. Any feature whose steps you could write down completely is a workflow; for the rest, write which of the four conditions in section 3 holds and which tools could stay read-only."),
    ],
});
