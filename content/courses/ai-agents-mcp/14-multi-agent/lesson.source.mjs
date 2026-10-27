// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-aam-5-2",
    title: "Multi-agent patterns: orchestrator & workers",
    slug: { _type: "slug", current: "multi-agent-orchestrator-workers" },
    description:
        "Version 2 of the CodeDev support assistant split one agent into an orchestrator, four specialist workers and a critic. It used about seven times the tokens, took four times as long, and told a learner who was charged twice that there was no duplicate: the orchestrator paraphrased the order id wrongly, the worker looked up another learner's order and the critic approved the answer. Learn to assess orchestrator-worker, handoff and critic patterns: what each is good for, why tokens multiply, why failures amplify and debugging gets harder, and when one agent with a better tool is enough.",
    estimatedTime: 20,

    scenario: {
        role: "Backend engineer reviewing the design of the CodeDev support assistant",
        problem:
            "Support assistant v2 went to 10% of conversations on 2026-10-19. Instead of one agent with six tools, it has an orchestrator that plans and delegates, four workers (enrollments, billing, course content, tickets) and a critic that approves every answer. A week later: median tokens per conversation rose from 7.8k to 52k, p95 latency from 9 s to 38 s, and conversation conv_5531 answered \"Order ord_8821 was charged once, there is no duplicate charge\" to a learner who had written about order ord_8812 and had been charged twice.",
    },

    content: [
        h2("1. The incident: a confident answer about the wrong order"),
        p("The learner's message in conversation `conv_5531` was short:"),
        code("text", `
I was charged twice for the Rust course, order ord_8812. Can you check and refund one of them?`, "user message, conv_5531"),
        p("The assistant answered within 31 seconds: \"I checked order ord_8821: it was charged once, so there is no duplicate charge. Is there anything else I can help with?\" The learner's bank statement shows two charges of 349,000 VND. A support agent found the second charge by hand the next morning."),
        p("Version 1 of the assistant, one agent with six narrow tools, had answered questions like this correctly for months. Version 2 was built because \"specialised agents should be more accurate\". This lesson does not teach you to build a multi-agent system. It teaches you to **assess** one: to recognise the patterns, to price them, and to decide whether the problem actually needs them."),

        h2("2. Read the trace"),
        p("Every model call and tool call in v2 is a span with the agent's name on it (lesson 15 shows how to record them). This is the trace of `conv_5531`, shortened:"),
        code("text", `
trace 7f3c9a  conversation conv_5531  assistant v2  user u_1934
 #  agent          span                    tokens in/out   detail
 1  orchestrator   model                   2,950 / 310     plan: [billing, tickets]
 2  orchestrator   delegate -> billing     -               task: "Check order ord_8821 for a duplicate charge"
 3  billing        model                   3,410 / 60      tool_call get_order {"orderId":"ord_8821"}
 4  billing        tool get_order          -               {"id":"ord_8821","userId":"u_2207","charges":[{"amountVnd":349000}]}
 5  billing        model                   3,620 / 95      final: "ord_8821 has one charge of 349,000 VND. No duplicate."
 6  orchestrator   delegate -> tickets     -               task: "Open a ticket only if a duplicate was found"
 7  tickets        model                   2,880 / 40      final: "No ticket needed."
 8  orchestrator   model                   4,105 / 120     draft answer
 9  critic         model                   5,240 / 25      "Answer is consistent with the tool results. APPROVED."
10  orchestrator   model                   4,390 / 70      final answer to the user
    total                                  26,595 / 720    7 model calls, 31.4 s`, "trace 7f3c9a"),
        p("Read it in order and the failure has three links:"),
        numbered([
            "**Span 2: a lossy handoff.** The orchestrator rewrote the user's request in its own words and swapped two digits: `ord_8812` became `ord_8821`. The billing worker never saw the user's message, only the paraphrase.",
            "**Span 4: a tool that trusts the model.** `get_order` returned an order of user `u_2207`, not the learner's `u_1934`. The tool took the order id from the model and never checked who owns the order. Another learner's order data entered the conversation.",
            "**Span 9: a critic that shares the error.** The critic compared the draft with the tool results, and they agreed perfectly. It had no way to know the tool results were about the wrong order, because it never looked at the user's message either.",
        ]),
        p("Each agent did its own job correctly given its input. The system was wrong. That is the typical shape of a multi-agent failure, and the reason this lesson starts from the trace."),

        h2("3. The three patterns, and what each one is for"),
        h3("Orchestrator and workers"),
        p("An orchestrator model breaks a task into subtasks, sends each to a worker agent with its own instructions, context and tools, and merges the results. Its real benefit is **context isolation and parallelism**: each worker reads only what its subtask needs, and independent subtasks can run at the same time. It earns its cost when subtasks are independent and each needs a large context of its own, for example checking all 15 lessons of a course against a style guide, one worker per lesson, with the orchestrator merging a list of findings. It is a poor fit for a support question that needs two lookups in a row."),
        h3("Handoffs"),
        p("One agent transfers the conversation to another that has different instructions and tools: a general course tutor hands a billing question to a billing agent. The benefit is that **each agent holds a smaller, different permission set**: the tutor never has a refund-request tool at all. Check whether a plain router does the same job: a classifier step followed by one of two single agents is a handoff with less to debug (lesson 1)."),
        h3("Critic or reviewer"),
        p("One model produces an answer and another checks it against criteria, sometimes in a loop until it passes. It helps when the criteria can be stated but not checked by code, such as \"every claim in the answer is supported by the cited lesson\", **and** the critic can see the source it checks against. Prefer deterministic checks first: a schema, an id that must appear in the user's message, an amount that must match the order. A critic built from the same model, with the same context and the same tool results, tends to make the same mistakes as the agent it reviews."),
        callout("info", "The cost side of every pattern",
            "Each agent starts its own context: system prompt, tool definitions, the task, and whatever earlier results it is given. The orchestrator then reads every worker's output again, and a critic reads the draft plus the evidence. Tokens grow with the number of model calls times the context each call carries, so splitting one agent into five rarely costs 5 times less per agent; it usually costs several times more in total."),

        h2("4. Price it, then count the failure paths"),
        p("Put the two versions side by side on the same 50 scenarios (lesson 15 builds this scenario set):"),
        code("text", `
                          v1: one agent, 6 tools    v2: orchestrator + 4 workers + critic
model calls, median       3                         7
tokens, median            7.8k                      52k
tokens, p95               14k                       96k
latency, p95              9 s                       38 s
scenarios passed          44 / 50                   45 / 50`, "scenario set, 50 scenarios, real model"),
        p("One more scenario passed, for roughly seven times the tokens and four times the wait. Before deciding, ask what the failures were. Four of v1's six failures were the same: to answer \"was I charged twice?\" the agent had to call `get_order` and `list_payments` and match them up, and it sometimes matched the wrong payment. That is a **tool design problem** (lesson 2), not a reason for more agents."),
        h3("Failures amplify along a chain"),
        p("When agents run in sequence and each one depends on the previous one's output, their error rates multiply. If each of six steps is right 95% of the time and the errors are independent, the chain is right about `0.95^6 = 0.735` of the time: one answer in four is wrong somewhere. Worse, the errors are often not independent: a wrong value early (span 2) is treated as a fact by every agent after it, and a critic that sees only those facts approves it. More agents means more places to introduce an error and more agents that will build on it."),
        h3("Debugging gets harder"),
        p("A single agent gives you one transcript. Seven model calls across four agents give you seven partial transcripts, each with its own prompt, and a bug can sit in a handoff between them. Without a trace that names the agent on every span and keeps parent and child links, nobody can tell which agent introduced the wrong id. Plan the trace before the agents."),

        challenge("chal_quiz_aam_521"),

        h2("5. Worked example: the single agent with a better tool"),
        p("The fix for this incident is to remove the multi-agent design for support, not to add a sixth agent. Give the one agent a tool that answers the real question, owned by the session user, with the matching done in code:"),
        code("typescript", `
// services/assistant/tools/getMyOrderCharges.ts
type Charge = { id: string; amountVnd: number; chargedAt: string; status: "captured" | "refunded" };
type Deps = {
  findOrder(id: string): { id: string; userId: string; courseTitle: string; priceVnd: number } | undefined;
  listCharges(orderId: string): Charge[];
};

export const getMyOrderChargesTool = {
  name: "get_my_order_charges",
  description:
    "Look up one order of the signed-in learner and list its charges. Use it for questions about duplicate or wrong charges. " +
    "orderId looks like ord_8812 and must come from the learner's message.",
  parameters: {
    type: "object",
    properties: { orderId: { type: "string", pattern: "^ord_[0-9]+$" } },
    required: ["orderId"],
    additionalProperties: false,
  },
  permission: "read" as const,
};

// sessionUserId comes from the authenticated session, never from the model's arguments
export function getMyOrderCharges(args: { orderId: string }, sessionUserId: string, deps: Deps) {
  const order = deps.findOrder(args.orderId);
  if (!order || order.userId !== sessionUserId) return { error: "order_not_found" };  // same answer: no hint that it exists
  const charges = deps.listCharges(order.id).filter((c) => c.status === "captured");
  return {
    orderId: order.id,
    course: order.courseTitle,
    priceVnd: order.priceVnd,
    capturedCharges: charges.length,
    duplicateCharge: charges.length > 1,
    charges,
  };
}`, "getMyOrderCharges.ts"),
        bullets([
            "**The matching moved into code.** `duplicateCharge` is computed, not inferred by the model, so it is the same on every run and a unit test covers it.",
            "**Ownership is checked in the tool.** With `sessionUserId` from the session, the wrong id in span 2 would have produced `order_not_found` instead of another learner's order.",
            "**The id comes from the learner's own words.** With one agent there is no paraphrase between the message and the tool call. An extra deterministic check in the loop can refuse a tool call whose `orderId` does not appear in the user's messages.",
        ]),
        h3("If you do keep several agents"),
        p("Some tasks really are parallel. When you keep a multi-agent design, two rules from earlier lessons have to cover the whole tree, not each agent:"),
        code("typescript", `
// one budget for the whole conversation, shared by every agent it starts (lessons 7 and 8)
class SharedBudget {
  private tokens = 0;
  private calls = 0;
  constructor(private readonly maxTokens: number, private readonly maxModelCalls: number) {}
  charge(agent: string, tokensUsed: number): void {
    this.tokens += tokensUsed;
    this.calls += 1;
    if (this.tokens > this.maxTokens || this.calls > this.maxModelCalls) {
      throw new Error("budget_exceeded: " + agent + " at " + this.tokens + " tokens, " + this.calls + " calls");
    }
  }
}

// a handoff passes structured facts and the original words, not a paraphrase
type BillingTask = {
  kind: "check_duplicate_charge";
  userId: string;            // from the session
  orderId: string;           // extracted by code from the user's message, validated against ^ord_[0-9]+$
  userMessage: string;       // the learner's own words, so the worker can check them
};`, "multiAgentGuards.ts"),
        p("The permission policy (lesson 10) also runs on every tool call of every agent. A handoff must not become a way to reach a tool the first agent was not allowed to call."),

        h2("6. How to verify a multi-agent design"),
        bullets([
            "**Same scenario set, both designs.** Compare success rate, p50 and p95 tokens, model calls and latency (lesson 15). A design that does not beat the single agent on the scenarios you care about does not ship.",
            "**Inject a fault into one worker.** Make a fake tool return a wrong id or an error and run the scenario. The final answer must report the problem, not hide it behind a confident sentence; a critic that approves it is not checking anything.",
            "**Plant errors for the critic.** Feed it ten drafts with known mistakes. If it approves most of them, its approval tells you little.",
            "**Read the trace for lossy handoffs.** For every delegate span, compare the ids and amounts in the task with the ones in the user's message. Any difference is a bug, even when the answer happened to be right.",
            "**Check the total, not the parts.** Sum tokens and model calls per conversation across all agents and compare them with the shared budget.",
        ]),

        h2("7. Common mistakes"),
        bullets([
            "**Limits per agent instead of per conversation.** Five agents each allowed 20 steps is 100 steps. Spot it: total model calls per trace exceed every individual agent's limit.",
            "**Paraphrased handoffs.** The orchestrator retells the request and changes a detail. Spot it: ids or numbers in delegate spans that do not appear in the user's message.",
            "**A critic that sees only what the worker saw.** It approves answers that are consistent and wrong. Spot it: an approval rate near 100%, and planted errors that pass.",
            "**A handoff that widens permissions.** The receiving agent holds tools the conversation never needed. Spot it: list the tools of every agent reachable from a conversation and compare with what the task requires.",
            "**Splitting by org chart.** A billing agent, an enrollments agent and a content agent that each call one tool once are three tools wrapped in three prompts. Spot it: workers whose trace is always one model call, one tool call, one answer.",
        ]),

        h2("8. Summary"),
        bullets([
            "Orchestrator-worker pays off for independent subtasks that each need a large context; handoffs for separating permission sets; critics for criteria code cannot check, when the critic can see the source.",
            "Every extra agent multiplies tokens and latency, adds a place for errors to enter and spread, and makes the trace harder to read; budgets and permissions must cover the whole tree.",
            "Measure before you split: on the same scenario set, one agent with a better, owner-checked tool usually matches or beats the multi-agent design at a fraction of the cost.",
        ]),

        h2("Sources"),
        bullets([
            "Anthropic, \"Building effective agents\" (orchestrator-workers, evaluator-optimizer, routing) - anthropic.com/engineering/building-effective-agents",
            "OWASP Top 10 for LLM Applications 2025: LLM06 Excessive Agency - owasp.org/www-project-top-10-for-large-language-model-applications",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Take a multi-agent design you have seen (or v2 above) and draw its agents, the tools each holds and every handoff. For each agent, write the one reason it cannot be a tool of a single agent. Then estimate tokens per conversation: model calls times average context per call, and compare with the single-agent version."),
    ],
});
