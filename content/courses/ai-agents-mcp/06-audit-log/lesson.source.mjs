// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-aam-2-3",
    title: "Audit every tool call",
    slug: { _type: "slug", current: "audit-every-tool-call" },
    description:
        "A refund for order ord_8812 went out through the support agent, and nobody could say who asked for it: the agent logged only successful calls, logged them with the learner's access token in the arguments, and wrote them to a table anyone on the team could edit. Learn what an audit record of a tool call must contain (who, which session, which tool, a redacted and bounded summary of the arguments, the outcome and the duration), why it is written for denied and failed calls too, how a hash chain makes edits and deletions detectable, and what a chain alone cannot prove.",
    estimatedTime: 30,

    scenario: {
        role: "Backend engineer, CodeDev AI platform team",
        problem:
            "Finance finds a refund of 349,000 VND for order ord_8812 that no human approved. The payment provider shows it was issued at 14:02:07 on Friday through CodeDev's API key. The support agent is the only caller of refund_order, but its logs have no line for that call: the tool crashed after the provider answered, and the agent logged tool calls only after they returned. The lines that do exist contain full arguments, including a learner's access token, and live in an ordinary table that the whole support engineering team can update. Compliance asks for every write the agent made last week, on whose behalf, and for evidence that nothing was removed.",
    },

    content: [
        h2("1. The incident: a refund with no record"),
        p("The support agent has had `refund_order` since lesson 1.2, behind the read-freely-write-with-approval policy you will build in lesson 4.1. On Friday a refund went out that no staff member remembers approving. The provider's dashboard and CodeDev's own logs disagree about whether it happened at all:"),
        code("text", `
# payment provider, request log (CodeDev API key)
2026-10-24T14:02:07.311Z POST /v1/refunds order=ord_8812 amount=349000 -> 200 refund_id=re_5521

# CodeDev API, application log
2026-10-24T14:02:07.402Z ERROR refund_order ord_8812: TypeError: Cannot read properties of undefined (reading 'status')

# agent_tool_log table, same minute
SELECT created_at, tool, args FROM agent_tool_log WHERE created_at >= '2026-10-24 14:01' ORDER BY created_at;
 2026-10-24 14:01:52 | lookup_order | {"orderId":"ord_8812","auth":{"accessToken":"eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1XzMzMTgi..."}}
 (1 row)`, "evidence"),
        p("Three separate failures hide in that output, and each one is common:"),
        bullets([
            "**The failed call left nothing.** The refund was issued, then the handler crashed while reading the provider's response. The tool log was written after the tool returned, so the one call that moved money has no row at all.",
            "**The row that exists is a liability.** It contains a learner's access token, copied verbatim from the arguments. The audit trail has become a place to steal credentials from, and nobody can share it with finance without leaking them.",
            "**Nobody can prove the table is complete.** `agent_tool_log` is a normal table; the support engineering role can `UPDATE` and `DELETE` it. Even if every row were present, nothing would show that a row had not been removed or changed.",
        ]),
        p("And the most basic question - which staff member's session asked the agent for the refund - has no answer, because the rows have no user or session column. A tool log is not an audit log until it answers **who did what, when, with what, and what happened**, for every call, in a form that shows tampering."),

        h2("2. Read the evidence: what an investigation actually needs"),
        p("Before designing the record, write down the questions compliance asked, and check each one against the data you have:"),
        numbered([
            "**Which calls did the agent make for staff member staff_09 last week?** Needs a user id and a session id on every record - from the host's authenticated session, the same identity rule as lesson 2.2.",
            "**Did anyone try a write they were not allowed to make?** Needs records for **denied** calls, not only for calls that ran.",
            "**Which calls failed, and after how long?** Needs the outcome (`ok`, `error`, `denied`), the error message and the duration. A refund that took 3 seconds and failed is a different story from one refused in 0 ms.",
            "**What exactly was asked?** Needs the arguments - but redacted and bounded, so the log can be read by more people than the database it describes.",
            "**Is this the whole list?** Needs records that are numbered and linked, so that a missing or edited record is visible.",
        ]),
        p("You can verify the gaps in the current table with two queries: `SELECT count(*) FROM agent_tool_log WHERE user_id IS NULL` (every row, since the column does not exist) and `SELECT has_table_privilege('support_eng', 'agent_tool_log', 'DELETE')` (true)."),

        h2("3. The core idea: one wrapper, one record per call"),
        p("Audit is not something each tool remembers to do. Put it in **one wrapper** that every tool call goes through - in the agent loop of lesson 1.3, or in the MCP server's `tools/call` handler of lesson 2.2 - and make the wrapper write exactly one record per call, on every path:"),
        bullets([
            "**Unknown tool** (the model invented a name): record it as an error, run nothing.",
            "**Denied by policy**: record it as `denied`, with the arguments that were attempted, and do not run the tool. Denied writes are the early warning of prompt injection (lesson 4.2) and of a policy that is too tight.",
            "**Ran and returned**: record `ok` and the duration.",
            "**Ran and threw**: record `error`, the message and the duration - then return or rethrow as your loop expects. The record must not depend on the tool behaving.",
        ]),
        h3("What goes in a record, and what stays out"),
        bullets([
            "**Identity and correlation:** a sequence number, a timestamp, the session id and the user id from the host, and the tool name as requested. With the session id you can join the record to the full transcript when you need it.",
            "**A summary of the arguments, not a copy.** Redact any field whose name says it holds a credential (`password`, `token`, `secret`, `apiKey`, `authorization`, in any casing or with `_`/`-`), at any depth. Cut long strings and the whole summary to a fixed size: a model that pastes a 40 KB lesson into an argument should not grow the audit table by 40 KB.",
            "**The outcome, not the result.** Store `ok`/`error`/`denied`, the error message (cut too) and the duration. Tool results can be large and full of personal data; if you need to prove what a result was, store its size or a hash, and keep the result itself in the system it came from.",
        ]),
        callout("warning", "Redaction by key name is a floor, not a guarantee",
            "Key-based redaction catches the credentials you named. It does not catch a token pasted into a free-text \"reason\" field, or an email address in a query. Keep the summary short, keep credentials out of tool arguments in the first place (identity comes from the connection, not from arguments), and review samples of real records."),
        h3("Tamper evidence: a hash chain"),
        p("An append-only table (no `UPDATE`, no `DELETE` for anyone but a break-glass role) stops casual edits. A **hash chain** makes the remaining ones visible. Each record stores the hash of the record before it, and its own hash covers that link plus its own fields:"),
        code("text", `
hash(record n) = sha256( hash(record n-1) + "\\n" + canonicalJson(fields of record n) )
hash(record 0's predecessor) = GENESIS = "000...000" (64 zeros)

#1 prev=000000000000 hash=3f9a1c07d2e8   lookup_order  ok
#2 prev=3f9a1c07d2e8 hash=b82e55a0c914   refund_order  denied
#3 prev=b82e55a0c914 hash=0c7d3e9f61ab   refund_order  ok`, "chain"),
        bullets([
            "**Edit a record's fields** and its stored hash no longer matches the hash recomputed from them.",
            "**Edit the fields and recompute that record's hash** and the next record's `prev` no longer matches.",
            "**Remove or reorder a record in the middle** and the record after the gap points at a hash that is not its neighbour's.",
            "**Canonical JSON is not optional.** The hash covers bytes, so the same record must always serialize to the same string: keys sorted at every depth, no whitespace. `JSON.stringify` keeps insertion order, and a record rebuilt from a database row can come back with its keys in another order.",
        ]),
        p("Know the limits before you promise anything. Someone who can rewrite the **whole** table can recompute every hash from the first changed record onwards, and someone who deletes the **newest** records leaves a shorter chain that still verifies. The defence for both is the same: regularly copy the latest hash and count (the head) to a place the writer cannot modify - a separate account's write-once object storage, a ticket, a signed message to another team - and check the table against those copies."),
        h3("When not to build this"),
        p("A hash-chained audit log is worth it for agents that touch money, personal data or permissions, and for anything a regulator or a customer may ask about. For a read-only documentation bot, an ordinary structured log with session, user, tool and outcome is enough - the per-call wrapper is still the right shape, the chain is not. And an audit log is not observability: latency histograms and traces (lesson 5.3) answer \"is it healthy\", the audit log answers \"who did what\"."),

        challenge("chal_quiz_aam_231"),

        h2("4. Worked example: the wrapper and the table"),
        p("The shape of the wrapper is what matters: the record is built on every path and written in one place. The details - the summary rules, the canonical JSON, the hash and the verification - are what you will write in the exercise:"),
        code("typescript", `
async function audited<T>(ctx: CallContext, name: string, args: unknown, run: () => Promise<T>): Promise<T> {
    const start = clock.now();
    let outcome: "ok" | "error" | "denied" = "ok";
    let error: string | null = null;
    try {
        if (!policy.allows(ctx.userId, name)) {
            outcome = "denied";
            throw new PermissionDenied(name);
        }
        return await run();
    } catch (thrown) {
        if (outcome !== "denied") {
            outcome = "error";
            error = thrown instanceof Error ? thrown.message : String(thrown);
        }
        throw thrown;
    } finally {
        // runs on every path: returned, threw, denied
        await auditLog.append({ ctx, tool: name, args, outcome, error, durationMs: clock.now() - start });
    }
}`, "audited.ts"),
        p("`auditLog.append` computes the summary, the sequence number and the hash. It must serialize appends - two concurrent calls must not both read the same previous hash - so in PostgreSQL it takes a lock (or uses a single writer) around \"read the last record, insert the next one\". The table gives the database's own guarantee on top:"),
        code("sql", `
CREATE TABLE agent_audit (
    seq         bigint PRIMARY KEY,
    at          timestamptz NOT NULL,
    session_id  text NOT NULL,
    user_id     text NOT NULL,
    tool        text NOT NULL,
    args        text NOT NULL,           -- redacted, bounded summary
    outcome     text NOT NULL CHECK (outcome IN ('ok', 'error', 'denied')),
    error       text,
    duration_ms integer NOT NULL,
    prev_hash   char(64) NOT NULL,
    hash        char(64) NOT NULL UNIQUE
);
REVOKE ALL ON agent_audit FROM PUBLIC;
GRANT INSERT, SELECT ON agent_audit TO agent_runtime;      -- append and read, never UPDATE or DELETE
GRANT SELECT ON agent_audit TO compliance_reader;`, "migration.sql"),
        p("With that in place, the Friday refund would have produced a record like this one - written in `finally`, after the `TypeError`, with the staff session that asked for it:"),
        code("json", `
{ "seq": 48211, "at": "2026-10-24T14:02:07.120Z", "sessionId": "s_77c1", "userId": "staff_09",
  "tool": "refund_order", "args": "{\\"orderId\\":\\"ord_8812\\",\\"reason\\":\\"duplicate purchase\\"}",
  "outcome": "error", "error": "Cannot read properties of undefined (reading 'status')", "durationMs": 282,
  "prevHash": "5be0c1...", "hash": "e41d07..." }`, "agent_audit row"),
        p("Write the core of it now: an executor that records every call - unknown, denied, ok or thrown - with the redaction and truncation rules above, chains the records with SHA-256, and a `verifyChain` that reports the first broken record. The tests replay calls against fake tools and a fake clock, then tamper with copies of your records."),
        challenge("chal_coding_aam_232"),

        h2("5. How to verify an audit log"),
        bullets([
            "**One record per call, on every path.** In tests, make a tool throw, deny a call, request an unknown tool, and assert the record count equals the call count. In production, compare the number of `tools/call` requests in the server's access log with the number of audit records for the same hour.",
            "**Redaction tests with real-looking secrets.** Feed `accessToken`, `refresh_token`, `API-Key` and a nested `password` and assert none of their values appears anywhere in the stored summary. Grep a day of real records for `eyJ` (the start of most JWTs) and for `Bearer`.",
            "**A nightly chain check.** Recompute the chain over the table and compare its head with the copies stored elsewhere; page someone when either fails. Run it once against a copy where you edited a record on purpose, to prove the check can fail.",
            "**Privilege checks.** As the runtime role, `UPDATE agent_audit` and `DELETE FROM agent_audit` must fail with `permission denied`.",
            "**Answer the incident's questions with SQL.** \"Every write by staff_09 last week\" and \"every denied call\" should be one `SELECT` each. If they are not, a field is missing.",
        ]),

        h2("6. Common mistakes"),
        bullets([
            "**Recording after the call instead of in `finally`.** Failed calls - often the interesting ones - vanish. Spot it by making a tool throw in a test and counting records.",
            "**Logging raw arguments.** Tokens, passwords and pasted documents land in a table with wider access than the systems they came from. Spot it by searching the log for `eyJ`, `Bearer` or `password\":\"` followed by anything other than `[REDACTED]`.",
            "**Skipping denied calls.** The policy did its job, and the evidence that someone - or some injected instruction - tried a refund is gone. Spot it when the denied count in the audit log is zero while the policy's own counter is not.",
            "**Hashing non-canonical JSON.** A record re-read from the database serializes with different key order and fails verification although nobody touched it. Spot it as verification failures that appear after a driver upgrade or an export, on records nobody edited.",
            "**Trusting the chain to prove completeness.** Deleting the newest records leaves a valid chain. Spot it by asking where the latest head hash is stored outside the table; if the answer is nowhere, truncation is undetectable.",
        ]),

        h2("7. Summary"),
        numbered([
            "Audit in one wrapper around every tool call, and write exactly one record on every path - unknown tool, denied, ok, thrown - with session, user, tool, outcome, error and duration from a clock you control.",
            "Store a redacted, bounded summary of the arguments and the outcome, not raw arguments or results; keep credentials out of arguments altogether.",
            "Make the log append-only and hash-chained over canonical JSON so edits, removals and reordering show up, and anchor the head hash outside the table, because a chain alone cannot detect a truncated tail.",
        ]),

        h2("Sources"),
        bullets([
            "OWASP Top 10 for LLM Applications 2025: LLM06 Excessive Agency (logging and monitoring of agent actions) - owasp.org/www-project-top-10-for-large-language-model-applications",
            "OWASP Logging Cheat Sheet: data to exclude from logs and protecting log integrity - cheatsheetseries.owasp.org",
            "Node.js documentation: crypto.createHash - nodejs.org/api/crypto.html",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Write the questions your compliance or support lead would ask about one of your agents, and the SELECT that answers each from your audit table. Then design the head anchoring: where the latest hash goes, how often, who can write there, and the exact check the nightly job runs. Try it by deleting the newest record of a test table and confirming the check fails."),
    ],
});
