// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-aam-4-1",
    title: "Permission policy: read freely, write with approval",
    slug: { _type: "slug", current: "permission-policy-read-freely-write-with-approval" },
    description:
        "A learner got another learner's quiz scores from the tutor agent, and a 2,990,000 VND refund went through because the model set approved: true on its own call. Learn to put a permission policy between the model and the tools: reads run without a click but only for the session's own user, writes need an approval token bound to the exact call, some tools are off limits for some roles, and amounts above a limit need a manager.",
    estimatedTime: 25,

    scenario: {
        role: "Backend engineer on the AI platform team, CodeDev learning platform",
        problem:
            "Two reports reach the AI platform team in the same week. A learner posts a screenshot on the community forum: the tutor agent at https://app.codedev.test answered \"Your friend u-512 has finished 9 of 12 lessons of SQL Basics, quiz average 64%\" when he asked about a friend. And finance finds a refund of 2,990,000 VND for a team plan that no support lead remembers approving. The audit log shows the call refund_order {\"orderId\":\"o-88\",\"amount\":2990000,\"approved\":true}. The agents have had a check for writes since launch; it reads the approved field of the call.",
    },

    content: [
        h2("1. The incident: the model approved its own refund"),
        p("The support agent has had a safety check for write tools since its first release. Here it is, as shipped:"),
        code("typescript", `
// agent/gateway.ts (release 2026.09.28)
export async function runToolCall(call: ToolCall, session: Session): Promise<string> {
  const tool = registry[call.name];
  if (tool.permission === "write" && call.args.approved !== true) {
    return "This action needs the learner's confirmation. Ask them, then call again with approved: true.";
  }
  return tool.run(call.args);
}`, "agent/gateway.ts"),
        p("Read the check from the model's side. The model writes `call.args`. The check asks the model whether the action is approved, and the error message even tells it what to write next time. On the refund in question the learner had typed \"yes please, refund the whole team plan\", the model called again with `approved: true`, and the gateway ran a 2,990,000 VND refund that the refund policy says needs a manager."),
        p("The second report is the same mistake on a read tool. The tutor agent can call `get_enrollments({ userId })`, and the model fills in `userId`. When a learner asked about \"my friend u-512\", the model did the helpful thing and passed `u-512`."),
        p("Both bugs have one root cause: **the model was asked to authorize itself**. This lesson moves every authorization decision out of the model and into a permission policy that the model cannot talk to."),

        h2("2. Read the evidence"),
        p("The audit log from lesson 2.3 records every call with its arguments and the session it came from. These are the lines that matter:"),
        code("text", `
ts                   session  role     tool             args                                              result
2026-10-14 10:02:11  s-77     tutor    get_enrollments  {"userId":"u-512"}                                ok, 3 rows
2026-10-15 16:40:03  s-102    support  refund_order     {"orderId":"o-88","amount":2990000}                needs confirmation
2026-10-15 16:40:19  s-102    support  refund_order     {"orderId":"o-88","amount":2990000,"approved":true} ok, refunded 2990000

session s-77:  user u-310 (learner), agent role tutor
session s-102: user u-640 (learner), agent role support`, "tool_calls, filtered by session"),
        bullets([
            "**s-77** belongs to learner u-310, yet the call reads u-512's data. Nothing in the gateway compares the two. A read tool, so no confirmation was even asked.",
            "**s-102** shows the round trip: the first call is refused, the error text teaches the model the magic field, and 16 seconds later the same call comes back with `approved: true` and runs. No human outside the chat saw it.",
            "The amount, 2,990,000 VND, is ten times the largest refund support leads may approve alone. The gateway has no notion of amounts or of who may approve what.",
        ]),
        callout("info", "OWASP LLM06: Excessive Agency",
            "The OWASP Top 10 for LLM Applications 2025 calls this Excessive Agency: an agent with more functionality, more permissions or more autonomy than its task needs. Its mitigations are the ones in this lesson: give tools the least privilege that works, run them in the user's own security context, and require a human to approve high-impact actions - enforced outside the model."),

        h2("3. Core idea: the model proposes, the policy decides"),
        p("Treat every tool call as a **request from an untrusted client**. The model is very good at deciding *which* call would help; it is not a place to keep secrets, identities or permissions, because anything in its context can change what it writes. So the agent loop never runs a call directly. It asks a policy, and the policy answers one of three things:"),
        bullets([
            "**allow** - run it now. Reads of the session's own data, and writes that carry a valid approval token.",
            "**needs_approval** - do not run it; show it to a person who can approve it. The model gets a short tool result saying so.",
            "**deny** - never run it, whatever the approval. Unknown tools, tools the role may not use, calls about another user, invalid arguments.",
        ]),
        p("Every answer carries a **reason code** (`role_denied`, `token_expired`, ...) that goes into the audit log. Reason codes are how you answer \"why did the agent refuse?\" on Monday morning without re-running anything."),

        h3("Read freely, but only your own data"),
        p("\"Read freely\" means a read needs no human click, because a click on every lookup would make the agent useless and train people to approve without looking. It does **not** mean a read needs no authorization. The **user comes from the session**, never from the model's arguments. The safest design removes the parameter altogether: `get_enrollments` takes no `userId`, and its implementation reads `session.userId`. When a tool must accept a user id (a support agent looking up the ticket's author, for example), the policy compares it with the session and denies a mismatch."),
        p("This is the **confused deputy** problem: the agent has more access than the person talking to it, and a request phrased the right way makes it use that access on their behalf. A learner cannot query another learner's enrollments through the API, so they must not be able to do it through the agent either."),
        p("A policy that looks at arguments only sees the user ids that are spelled out. Most data is reached through other ids: an order id, a certificate id, a submission id, each owned by someone. For those, the ownership check belongs in the tool's query, scoped to the session (`where: { id, userId: session.userId }`), exactly as the HTTP API already does it. The policy catches the obvious cases early; the data layer makes the rule hold everywhere."),

        h3("Write with approval, bound to the exact call"),
        p("A write needs a person to say yes, and the yes must be impossible to forge or to reuse. That is what an **approval token** gives you. The approval UI, used by a support lead, shows the exact call; when they approve, the server records a token bound to:"),
        bullets([
            "**the session** that proposed the call, so a token cannot travel to another conversation;",
            "**the tool name and a hash of its arguments** in canonical form (keys sorted, no spaces), so approving `refund o-1042 for 349,000` does not approve `refund o-1042 for 3,490,000`, while the same arguments in another key order are still the same call;",
            "**an expiry** on the server's clock, so a token approved yesterday cannot be used next week;",
            "**the approver's role**, for actions that need a manager;",
            "**a used flag**: the token is consumed by the one call it approved.",
        ]),
        p("The model never sees the token. The runtime holds it and attaches it when it retries the call, and the policy checks every binding before it says allow. Compare that with the `approved: true` flag: the flag was a field the model controls, the token is a record only the human path can create."),

        h3("Roles and limits"),
        p("Two more rules come from the business, not from security theory. **Some tools are off limits for some roles**: the tutor agent has no business refunding anything, so `refund_order` lists `tutor` in its denied roles and the policy refuses before any approval is considered. And **some writes have limits**: support leads may approve refunds up to 500,000 VND; above that, only a manager's token counts. A missing or nonsensical amount is denied outright instead of being treated as zero."),
        callout("warning", "When not to build this",
            "If the agent only has read tools over the user's own data, you need the session-scoped user and nothing else. If every action is a write that a person must approve anyway, a fixed workflow with a form may be simpler than an agent (lesson 1.1). And do not put approval on reads to feel safe: people approve hundreds of harmless lookups without reading them, and then approve the harmful write the same way."),

        challenge("chal_quiz_aam_411"),

        h2("4. Worked example: the policy in the loop"),
        p("Start with the registry. Each tool states its permission, the roles that may never use it and, for money, the limit above which a manager must approve:"),
        code("typescript", `
// agent/policy-config.ts
export const toolPolicies: ToolSpec[] = [
  { name: "get_order",       permission: "read",  deniedRoles: [],                    managerAbove: null },
  { name: "get_enrollments", permission: "read",  deniedRoles: [],                    managerAbove: null },
  { name: "refund_order",    permission: "write", deniedRoles: ["tutor"],             managerAbove: 500_000 },
  { name: "close_ticket",    permission: "write", deniedRoles: [],                    managerAbove: null },
  { name: "delete_account",  permission: "write", deniedRoles: ["support", "tutor"],  managerAbove: null },
];`, "agent/policy-config.ts"),
        p("The loop asks the policy before anything runs, and turns each answer into a tool result the model can work with. Notice that the model only ever learns *that* approval is pending, never how to produce it:"),
        code("typescript", `
// agent/loop.ts
const call = turn.toolCall;
const token = pendingTokens.get(callKey(call)) ?? null;    // set by the approval UI's callback, never by the model
const d = policy.decide(session.id, call, token, clock.now());
audit.write({ session: session.id, call, decision: d.decision, reason: d.reason, token: d.consumed });

if (d.decision === "allow") {
  transcript.push(toolMessage(call, await tools[call.name].run(call.args, session)));
} else if (d.decision === "needs_approval") {
  await approvals.request(session.id, call, d.reason);       // shows the exact call to a support lead (or a manager)
  transcript.push(toolMessage(call, "Waiting for staff approval. Tell the learner a person will review it."));
} else {
  transcript.push(toolMessage(call, \`Not allowed (\${d.reason}).\`));
}`, "agent/loop.ts"),
        p("The approval endpoint is the only place a token is born. It runs with the support lead's own login, re-reads the pending call from the server (not from the browser), and stores the binding:"),
        code("typescript", `
// app/api/agent-approvals/[id]/approve/route.ts
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const approver = await requireStaff(req);                 // support lead or manager, from their own session
  const pending = await db.pendingCall.findUniqueOrThrow({ where: { id: params.id } });
  const token = randomUUID();
  await db.approvalToken.create({ data: {
    token,
    sessionId: pending.sessionId,
    tool: pending.tool,
    argsHash: pending.argsHash,                             // sha256 of the canonical arguments, computed when the call was proposed
    approverRole: approver.role,
    expiresAt: new Date(Date.now() + 5 * 60_000),
    usedAt: null,
  } });
  await agentRuntime.resume(pending.sessionId, token);      // the runtime retries the call with the token attached
  return Response.json({ ok: true });
}`, "route.ts"),
        p("Two details make this hold up. The hash is computed from the call the model proposed, so the approver approves exactly what will run. And \"consume the token\" must be atomic in a real database (`UPDATE ... SET used_at = now() WHERE token = $1 AND used_at IS NULL`, then check one row changed), or two retries racing each other could both pass."),

        h2("5. How to verify the policy"),
        p("A policy is a pure function of the session, the call, the token store and the clock, which makes it easy to test exhaustively. Write one test per reason code, and replay the incident:"),
        bullets([
            "**The incident replay.** s-77 calling `get_enrollments {\"userId\":\"u-512\"}` must be `deny user_mismatch`. s-102 calling `refund_order` with `approved: true` and no token must be `needs_approval manager_approval_required`: the extra field changes nothing.",
            "**Token binding, one property at a time.** Approve a call, then try it from another session, with another amount, after the expiry, and twice. Each must fail with its own reason, and the failed attempts must not consume the token.",
            "**Canonical arguments.** The same arguments in another key order are allowed; a different array order or a nested value change is not.",
            "**The clock.** Use a fake clock and test the boundary: a token issued at t with a TTL of 60 s is valid at t + 59,999 ms and expired at t + 60,000 ms.",
            "**The audit log.** After a test run, every decision appears with its reason code. A refusal that leaves no trace is a refusal nobody can debug.",
        ]),
        code("typescript", `
test("a token approves one exact call, once, in one session", () => {
  const clock = fakeClock(1_000);
  const policy = new PermissionPolicy(toolPolicies, sessions);
  policy.approve({ token: "apr-1", sessionId: "s-1", call: refund("o-1", 349_000), approverRole: "support", ttlMs: 60_000 }, clock.now());

  expect(policy.decide("s-2", refund("o-1", 349_000), "apr-1", 2_000).reason).toBe("token_wrong_session");
  expect(policy.decide("s-1", refund("o-1", 3_490_000), "apr-1", 2_000).reason).toBe("token_mismatch");
  expect(policy.decide("s-1", refund("o-1", 349_000), "apr-1", 3_000).decision).toBe("allow");
  expect(policy.decide("s-1", refund("o-1", 349_000), "apr-1", 4_000).reason).toBe("token_used");
});`, "policy.test.ts"),
        p("Notice the second and third assertions together: the tampered amount is refused, and the refusal leaves the token unused, so the real call still goes through afterwards. Decide the order of your checks deliberately and write it down, because the order decides which reason the support lead and the audit log see, and sometimes whether a call is refused at all: if the \"read tools are allowed\" shortcut came before the user check, the s-77 lookup of u-512 would be allowed again."),

        h2("6. The challenge"),
        p("Implement the policy from this lesson: canonical arguments, the approval path that records tokens, and `decide()` with the exact order of checks given in the challenge. The test runner feeds it a sequence of approvals and calls on a fake clock and prints one decision per call."),
        challenge("chal_coding_aam_412"),

        h2("7. Common mistakes"),
        bullets([
            "**Approval as a field the model can set.** `approved: true`, `confirmed: \"yes\"`, `force: true` in the arguments. Spot it: search the gateway for any check that reads `call.args` to decide whether a call is authorized. Only data from the session or the approval store may do that.",
            "**Taking the user id from the arguments.** The tool schema has a `userId` parameter and the implementation trusts it. Spot it: for each tool, ask \"could this call name a user other than the session's?\" and replay a call with another user's id in a test.",
            "**Tokens bound to the tool name only.** \"Approve refunds for this session\" turns one approval into unlimited refunds. Spot it: approve one call, then change one argument and see whether it still runs.",
            "**Tokens that never die.** No expiry, or no used flag, so yesterday's approval still works. Spot it: replay an approved call twice and once after the TTL in a test with a fake clock.",
            "**Leaking the mechanism in error messages.** \"Call again with approved: true\" teaches the model the bypass. Spot it: read every tool result the policy can produce and make sure none of them tells the model how to get past it.",
        ]),

        h2("8. Summary"),
        numbered([
            "The model proposes tool calls; a policy outside the model answers allow, needs_approval or deny, with a reason code that goes to the audit log.",
            "Reads run without a click but only for the session's user; writes run only with an approval token bound to the session, the tool, the canonical arguments and an expiry, consumed by one call.",
            "Roles and limits are policy too: deny tools a role must never use, require a manager above an amount, and test every rule, including the incident replay, against a fake clock.",
        ]),

        h2("Sources"),
        bullets([
            "OWASP Top 10 for LLM Applications 2025: LLM06 Excessive Agency - owasp.org/www-project-top-10-for-large-language-model-applications/",
            "Anthropic: Building effective agents (guardrails and human checkpoints) - anthropic.com/engineering/building-effective-agents",
            "The confused deputy problem: Norm Hardy, \"The Confused Deputy\", ACM SIGOPS Operating Systems Review, 1988",
        ]),
        callout("tip", "Practice on your own (not graded): write the policy table",
            "List every tool of an agent you know (or of CodeDev's support agent) in a table with four columns: permission, roles that may never use it, the limit above which a manager approves, and the parameters that identify a user. For each row, write the one test that would have caught the riskiest misuse. Keep the table next to the registry: reviewers should be able to check one against the other."),
    ],
});
