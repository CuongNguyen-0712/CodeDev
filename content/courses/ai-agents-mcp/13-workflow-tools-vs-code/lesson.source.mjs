// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-aam-5-1",
    title: "Workflow tools (n8n, Make) or agents in code?",
    slug: { _type: "slug", current: "workflow-tools-or-agents-in-code" },
    description:
        "A refund triage workflow built in a visual workflow tool told 14 learners their refund was issued while the refund API was answering 503: a step was set to continue on error, the prompt had been edited in production the day before, and the workflow held an admin token. Compare workflow automation tools such as n8n and Make with agents written in code on versioning, testing, secrets, error handling, lock-in and ownership, decide when each fits, and move the risky step behind a narrow API that keeps its rules whoever edits the canvas.",
    estimatedTime: 20,

    scenario: {
        role: "Backend engineer supporting the CodeDev support-operations team",
        problem:
            "Support operations built a \"Refund triage\" workflow in a visual workflow tool: a new helpdesk ticket tagged refund goes to an LLM step that decides whether it is eligible, then an HTTP step calls the refund API with an admin token, then the ticket is answered \"Your refund has been issued\" and closed. On 2026-10-23 the refund API returned 503 for 40 minutes during a deploy. The workflow's execution list shows every run as Success, 14 learners were told their refund was issued, and no refund exists for any of them. The LLM step's prompt had been edited in the production workflow the evening before, with no review.",
    },

    content: [
        h2("1. The incident: every run says Success"),
        p("The \"Refund triage\" workflow has run since March without anyone in engineering looking at it. It is four steps on a canvas, built and owned by support operations:"),
        numbered([
            "**Trigger:** a new helpdesk ticket with the tag `refund`.",
            "**LLM step:** a prompt that reads the ticket and returns `{ eligible, orderId, amountVnd, reason }`.",
            "**HTTP step:** if eligible and the amount is at most 500,000 VND, `POST https://api.codedev.test/admin/refunds` with the credential named `codedev-admin`.",
            "**Helpdesk step:** reply \"Your refund has been issued\" and close the ticket.",
        ]),
        p("On Friday 2026-10-23 the payments service was deployed, and the refund API answered `503 Service Unavailable` between 17:00 and 17:40. On Monday the support inbox had 14 replies of the same kind: \"You told me my refund was issued. My bank shows nothing.\" They were right. No refund row exists for any of the 14 tickets."),
        p("Nothing here is a model failure. The model classified the tickets the way it was told to. The failure is in the engineering around the workflow: how a failed step is handled, who can change the prompt, which credential the step holds and how anyone would notice. Those questions are the same whether the steps live on a canvas or in a TypeScript file. This lesson is about answering them before choosing where the steps live."),

        h2("2. Read the evidence"),
        p("Start with the tool's own view. The execution list for Friday afternoon:"),
        code("text", `
Workflow "Refund triage" - executions, 2026-10-23 (times UTC+7)
17:02:11  Success  ticket #48213  1.9 s
17:05:40  Success  ticket #48217  2.1 s
17:09:02  Success  ticket #48220  1.8 s
...
17:38:57  Success  ticket #48261  2.0 s      (14 runs between 17:00 and 17:40, all Success)`, "execution list"),
        p("Then the other side of the same calls. The refund API logs every request with the token that made it:"),
        code("text", `
2026-10-23T10:02:12Z POST /admin/refunds 503 caller=token:codedev-admin ticket=48213
2026-10-23T10:05:41Z POST /admin/refunds 503 caller=token:codedev-admin ticket=48217
2026-10-23T10:09:03Z POST /admin/refunds 503 caller=token:codedev-admin ticket=48220
...`, "refund API access log (UTC)"),
        p("Fourteen `503` answers, fourteen runs marked Success. The workflow export (simplified below; real exports carry more fields) shows why:"),
        code("json", `
{
  "name": "Refund triage",
  "steps": [
    { "name": "Classify ticket", "type": "llm", "prompt": "Decide if this ticket is eligible for a refund. Be generous with annual plans. ..." },
    { "name": "Issue refund", "type": "http", "method": "POST", "url": "https://api.codedev.test/admin/refunds",
      "credential": "codedev-admin", "onError": "continue" },
    { "name": "Reply and close", "type": "helpdesk", "reply": "Your refund has been issued.", "close": true }
  ]
}`, "refund-triage export (simplified)"),
        bullets([
            "**`onError: continue` on a write step.** Someone set it in May when the helpdesk API was flaky and the workflow kept stopping. On the refund step it turns a failed refund into a successful run, and the next step tells the learner the opposite of the truth.",
            "**The credential.** `codedev-admin` is an admin API token stored once in the shared workspace. Any workflow in that workspace can use it, and it can do far more than create refunds. That is the shape OWASP calls LLM06 Excessive Agency: a model-driven step holding permissions it does not need.",
            "**The prompt.** The version history shows \"Saved by ops-lan, 2026-10-22 17:41\". The words \"Be generous with annual plans\" were added in the production workflow. No one reviewed the change, and there is no eval set that would have shown its effect.",
        ]),
        p("The history entry is useful after the fact: it tells you who changed what and when. It did not stop the change from reaching production, and nobody saw the diff until a learner complained."),

        h2("3. What really differs: the engineering around the steps"),
        p("Workflow automation tools such as **n8n** and **Make** let you connect apps on a canvas: a trigger, a few steps, branches, and now LLM and \"AI agent\" steps too. The course plan cites the Stack Overflow 2026 Developer Survey as showing these tools widely used among developers; check the survey itself for current figures. They are a real option, not a toy, and \"rewrite it in code\" is not an automatic answer."),
        callout("info", "Product capabilities change fast",
            "What each tool offers differs by product, by plan and between cloud and self-hosted editions, and it changes often: version history, Git-based source control, separate environments, error workflows, credential sharing rules, execution logs and retention. Treat the comparison below as the list of questions to ask, then read the current documentation of the tool and plan you actually use (docs.n8n.io, help.make.com)."),
        p("Compare the two options on the things that decided this incident:"),
        bullets([
            "**Versioning and review.** In code, a change is a diff in a pull request that someone approves before it ships. In a workflow tool, ask: can a person edit the production workflow directly? Is there history with a diff, and is there a review step before a change goes live, or only after? Can you export the workflow (n8n as workflow JSON, Make as a scenario blueprint) and keep the export in Git?",
            "**Testing.** In code, the agent loop runs against a fake model and fake tools on every commit (lesson 3). In a workflow tool, ask: can you run the workflow against test data without touching production systems? Can you replay a past execution? Who runs it after a change?",
            "**Secrets and permissions.** In code, the service has its own credential with the scopes it needs, and the permission policy (lesson 10) runs on every tool call. In a workflow tool, ask: who in the workspace can use a stored credential, in which workflows, and with what scopes on the API side?",
            "**Error handling.** In code, an unhandled error stops the run unless you catch it, and a test can prove a failed write is not reported as done. In a workflow tool, ask: what does each step do on error, and does a failed step make the whole execution fail and alert someone?",
            "**Vendor lock-in.** Exports are tied to the tool's own format. Moving a 40-step workflow to another tool or to code means rebuilding it. That is fine for glue that is cheap to rebuild and expensive for logic that holds your business rules.",
            "**Who maintains it.** A workflow owned by support operations can be changed the same day by the people who know the process. A service owned by engineering waits in a review queue. Neither is wrong, but every workflow needs a named owner who gets the alert when it fails.",
        ]),
        h3("When each one fits"),
        p("A workflow tool fits well when the steps are fixed and the risk is low:"),
        bullets([
            "Glue between SaaS apps: a new course review creates a task and posts a message to the authors' channel.",
            "The people who own the process change it often and are not engineers.",
            "The actions are read-only, or easy to undo, and a failure becomes visible quickly.",
            "Volume is modest and nobody needs the result in milliseconds.",
        ]),
        p("Code fits better when any of these is true:"),
        bullets([
            "The step moves money, changes accounts, grades or enrollments, or touches personal data.",
            "It is a real agent loop: a model choosing tools across several steps. Step limits, budgets, permission checks and the treatment of tool output as data (lessons 7 to 12) are code you write and test; if the tool hides the loop, you cannot bound it.",
            "The logic has many branches and rules you want unit tests for.",
            "It must pass the same security review and on-call standard as the rest of the API.",
        ]),
        p("Most real cases are mixed, and the mix is usually the best answer: **keep the trigger, routing and notifications in the workflow tool, and put the risky action behind a narrow API in code.** The API enforces the rules, so they hold no matter who edits the canvas or what the LLM step returns. This is also the lesson 1 question again: the \"Refund triage\" flow is a workflow with one LLM classification step, not an agent, and nothing about it needed a loop."),

        challenge("chal_quiz_aam_511"),

        h2("4. Worked example: a narrow endpoint the workflow can call"),
        p("The fix keeps the workflow and changes what its HTTP step is allowed to do. Instead of an admin token on `/admin/refunds`, the workflow gets its own token with one scope, `refund-requests:create`, and calls an endpoint that **creates a refund request waiting for staff approval**. No money moves from this endpoint, whatever the prompt says."),
        code("typescript", `
// services/support/refundRequests.ts
export type Caller = { id: string; scopes: string[] };
export type Order = { id: string; userId: string; amountVnd: number; refundedVnd: number };
export type RefundRequest = {
  id: string; ticketId: string; orderId: string; amountVnd: number;
  reason: string; status: "pending_approval"; createdBy: string; createdAt: string;
};
export type Input = { ticketId: string; orderId: string; amountVnd: number; reason: string; idempotencyKey: string };
export type Deps = {
  getOrder(id: string): Order | undefined;
  findByKey(key: string): RefundRequest | undefined;
  save(key: string, r: RefundRequest): void;
  audit(entry: { caller: string; action: string; target: string; result: string; at: string }): void;
  now(): string;
  newId(): string;
};
type Result = { status: number; body: RefundRequest | { error: string } };

export function createRefundRequest(caller: Caller, input: Input, deps: Deps): Result {
  const deny = (status: number, error: string): Result => {
    deps.audit({ caller: caller.id, action: "refund_request.create", target: String(input.orderId), result: error, at: deps.now() });
    return { status, body: { error } };
  };
  if (!caller.scopes.includes("refund-requests:create")) return deny(403, "missing_scope");

  const previous = deps.findByKey(input.idempotencyKey);
  if (previous) return { status: 200, body: previous };            // a retried run, not a second request

  if (!/^ord_\\d+$/.test(input.orderId)) return deny(400, "invalid_order_id");
  const order = deps.getOrder(input.orderId);
  if (!order) return deny(404, "order_not_found");
  const refundable = order.amountVnd - order.refundedVnd;
  if (!Number.isInteger(input.amountVnd) || input.amountVnd <= 0 || input.amountVnd > refundable) {
    return deny(422, "amount_not_refundable");
  }

  const request: RefundRequest = {
    id: deps.newId(), ticketId: input.ticketId, orderId: order.id, amountVnd: input.amountVnd,
    reason: input.reason.slice(0, 500), status: "pending_approval", createdBy: caller.id, createdAt: deps.now(),
  };
  deps.save(input.idempotencyKey, request);
  deps.audit({ caller: caller.id, action: "refund_request.create", target: order.id, result: "created", at: deps.now() });
  return { status: 201, body: request };
}`, "refundRequests.ts"),
        p("The rules live where a test can reach them. These tests use in-memory fakes and run in milliseconds:"),
        code("typescript", `
// services/support/refundRequests.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { createRefundRequest, type Deps, type RefundRequest } from "./refundRequests.ts";

function fakes() {
  const saved = new Map<string, RefundRequest>();
  const audit: string[] = [];
  let n = 0;
  const deps: Deps = {
    getOrder: (id) => (id === "ord_8812" ? { id, userId: "u_1934", amountVnd: 349000, refundedVnd: 0 } : undefined),
    findByKey: (key) => saved.get(key),
    save: (key, r) => void saved.set(key, r),
    audit: (e) => void audit.push(e.result),
    now: () => "2026-10-26T09:00:00Z",
    newId: () => "rr_" + ++n,
  };
  return { deps, saved, audit };
}
const workflow = { id: "workflow:refund-triage", scopes: ["refund-requests:create"] };
const input = { ticketId: "48213", orderId: "ord_8812", amountVnd: 349000, reason: "charged twice", idempotencyKey: "ticket-48213" };

test("creates a pending request, never a refund", () => {
  const { deps } = fakes();
  const res = createRefundRequest(workflow, input, deps);
  assert.equal(res.status, 201);
  assert.equal((res.body as RefundRequest).status, "pending_approval");
});

test("a retried run with the same key does not create a second request", () => {
  const { deps, saved } = fakes();
  createRefundRequest(workflow, input, deps);
  assert.equal(createRefundRequest(workflow, input, deps).status, 200);
  assert.equal(saved.size, 1);
});

test("more than the order is worth is rejected and audited", () => {
  const { deps, audit } = fakes();
  assert.equal(createRefundRequest(workflow, { ...input, amountVnd: 5_000_000 }, deps).status, 422);
  assert.deepEqual(audit, ["amount_not_refundable"]);
});

test("a token without the scope is refused", () => {
  const { deps } = fakes();
  assert.equal(createRefundRequest({ id: "workflow:other", scopes: [] }, input, deps).status, 403);
});`, "refundRequests.test.ts"),
        p("On the canvas, three things change, and support operations makes the changes themselves:"),
        bullets([
            "The HTTP step calls `POST https://api.codedev.test/support/refund-requests` with the workflow's own credential and sends the ticket id as the idempotency key.",
            "The step's error setting is \"stop the workflow\", and the workflow has an error path that tags the ticket `refund-failed` and alerts the owner. A failed request can no longer reach the reply step.",
            "The reply says what is true: \"We received your refund request. A staff member will confirm it within 2 working days.\"",
        ]),
        p("The admin token is revoked, and the workflow export is committed to `ops/workflows/refund-triage.json` after every change, so the next prompt edit shows up as a diff someone can read."),

        h2("5. How to verify"),
        bullets([
            "**The credential cannot do more than its job.** Call the old endpoint with the workflow's new token; it must be refused: `curl -i -X POST https://api.codedev.test/admin/refunds -H \"Authorization: Bearer $WORKFLOW_TOKEN\"` returns `403`.",
            "**A failed write fails the run.** In staging, make the refund-requests endpoint return `503` and run the workflow on a test ticket. The execution must show as failed, the ticket must stay open with the `refund-failed` tag, and no reply may be sent.",
            "**The two sides agree.** Every day, compare the number of successful executions with the number of `created` audit rows from `caller = 'workflow:refund-triage'`. A gap means a step is swallowing errors again.",
            "**Changes are visible.** The export in Git shows the prompt and every step's error setting; a change to either is a diff in review, not a surprise on Monday.",
        ]),
        code("sql", `
-- refund requests created by the workflow, per day (compare with the tool's execution count)
SELECT date_trunc('day', at) AS day, result, count(*)
FROM audit_log
WHERE caller = 'workflow:refund-triage' AND action = 'refund_request.create'
GROUP BY 1, 2
ORDER BY 1, 2;`, "reconcile.sql"),

        h2("6. Common mistakes"),
        bullets([
            "**Continue-on-error on a step that writes.** Spot it: read each write step's error setting in the export; compare the tool's success count with the API's own logs for the same caller.",
            "**One powerful credential shared by the whole workspace.** Spot it: list the stored credentials and the scopes each token has on the API side. A workflow token that can reach `/admin` is a finding even if no workflow uses it yet.",
            "**Editing the production workflow as the only environment.** Spot it: the history shows saves to the live workflow during working hours and there is no test copy, no export in Git, no review.",
            "**An \"AI agent\" step treated as a simple step.** It is still an agent: it needs step limits, narrow tools, a permission policy and untrusted tool output handling. Spot it: ask where its step limit and tool permissions are configured. If nobody knows, they are not there.",
            "**Rewriting every workflow in code by reflex.** A read-only notification flow that its owners change weekly gains nothing from a pull request queue. Spot it: the rewrite has no named engineering owner, and the old owners now file tickets to change a message.",
        ]),

        h2("7. Summary"),
        bullets([
            "The choice between a workflow tool and code is about versioning and review, testing, secrets, error handling, lock-in and ownership; check what your tool and plan actually offer instead of assuming.",
            "Workflow tools fit fixed, low-risk glue owned by the people who run the process; code fits steps that write money or user data and real agent loops that need limits, permissions and tests.",
            "The usual best answer is both: the workflow keeps the trigger and the messages, and the risky action sits behind a narrow, scoped, idempotent API in code that enforces the rules whoever edits the canvas.",
        ]),

        h2("Sources"),
        bullets([
            "n8n documentation - docs.n8n.io; Make help center - help.make.com (check the features of your plan and edition)",
            "OWASP Top 10 for LLM Applications 2025: LLM06 Excessive Agency - owasp.org/www-project-top-10-for-large-language-model-applications",
            "Anthropic, \"Building effective agents\" (workflows versus agents) - anthropic.com/engineering/building-effective-agents",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Take one workflow your team runs in a workflow tool and write down, for each step: what it writes, which credential it holds and its scopes, what happens on error, who owns it, and where its last change was reviewed. Mark every step that writes money or user data and sketch the narrow API it should call instead."),
    ],
});
