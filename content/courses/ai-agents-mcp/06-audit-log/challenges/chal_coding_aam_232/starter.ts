import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

// CodeDev support agent: every tool call the agent makes goes through AuditedExecutor.execute(),
// which runs the tool and appends one AuditRecord to `records`, whatever happens. Compliance must be
// able to answer "who did what, when, with which arguments" and to detect a record that was edited,
// removed or reordered after it was written.
//
// execute(ctx, tool, args) - ctx comes from the host's authenticated session, never from the model.
//   0. Look tools up as own properties only: the model can ask for a tool named "toString".
//   1. start = clock.now()
//   2. Decide the outcome, in this order:
//      - no tool with that name in `tools`:  outcome "error", message "unknown tool: <tool>", nothing runs
//      - policy(ctx.userId, tool) is false:  outcome "denied", the tool does NOT run
//      - otherwise run tools[tool](args):    returns a value -> "ok"; throws -> "error" with the
//        thrown Error's message (String(thrown) when the thrown value is not an Error)
//   3. Append the record (also when the tool threw), then return the CallResult.
//      Tools may advance the fake clock while they run; durationMs = clock.now() at the end - start.
//
// AuditRecord fields:
//   seq        1 for the first record, then +1
//   at         new Date(start).toISOString()
//   sessionId, userId   from ctx;   tool   the requested name (even if unknown)
//   args       summarizeArgs(args)   (also for denied and unknown calls)
//   outcome    "ok" | "error" | "denied"
//   error      the error message cut with the string rule below, null when outcome is not "error"
//   durationMs end - start
//   prevHash   hash of the previous record, GENESIS for the first one
//   hash       sha256 hex of  prevHash + "\n" + canonicalJson(the record WITHOUT prevHash and hash)
//
// summarizeArgs(args), in this order:
//   a. Redact: at any depth (objects inside arrays too), a key whose name - lowercased, with "_" and "-"
//      removed - contains "password", "token", "secret", "apikey" or "authorization" gets the value
//      "[REDACTED]" whatever the original value was (string, number, object, array...).
//   b. Cut strings: every string value (not keys) longer than 64 characters becomes its first 64
//      characters + "...(+N chars)", N = number of characters removed. "[REDACTED]" is never cut.
//   c. canonicalJson of the result.
//   d. If that JSON is longer than 200 characters: its first 200 characters + "...(truncated)".
//   Lengths are JavaScript string lengths.
//
// canonicalJson(value): like JSON.stringify without spaces, but object keys sorted at every depth
//   (default string order, a.k.a. [...keys].sort()); array order kept; undefined (a call without
//   args) is written as null.
//
// verifyChain(records): check records in array order. For record i:
//   - prevHash must equal GENESIS for i = 0, else records[i - 1].hash      -> else reason "prev_hash"
//   - hash must equal the hash recomputed from the record's own fields      -> else reason "hash"
//   Return { ok: true } or { ok: false, brokenAt: <that record's seq>, reason } for the FIRST broken one.
//
// Use node:crypto createHash("sha256"). Do not change the types, GENESIS or the test runner.

type Clock = { now(): number };
type CallContext = { sessionId: string; userId: string };
type Tool = (args: unknown) => unknown;
type Policy = (userId: string, tool: string) => boolean;
type Outcome = "ok" | "error" | "denied";
type CallResult = { outcome: "ok"; value: unknown } | { outcome: "error"; message: string } | { outcome: "denied" };

type AuditRecord = {
    seq: number;
    at: string;
    sessionId: string;
    userId: string;
    tool: string;
    args: string;
    outcome: Outcome;
    error: string | null;
    durationMs: number;
    prevHash: string;
    hash: string;
};

type ChainCheck = { ok: true } | { ok: false; brokenAt: number; reason: "prev_hash" | "hash" };

const GENESIS = "0".repeat(64);
function canonicalJson(value: unknown): string {
    // TODO
    return "";
}

function summarizeArgs(args: unknown): string {
    // TODO
    return "";
}

class AuditedExecutor {
    readonly records: AuditRecord[] = [];

    constructor(
        private readonly clock: Clock,
        private readonly tools: Record<string, Tool>,
        private readonly policy: Policy,
    ) {}

    execute(ctx: CallContext, tool: string, args: unknown): CallResult {
        // TODO: decide the outcome, run the tool if allowed, append the record, return the result
        return { outcome: "denied" };
    }
}

function verifyChain(records: AuditRecord[]): ChainCheck {
    // TODO
    return { ok: true };
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { "startMs": number, "tools": ["search_lessons", ...], "allow": { "u_17": ["search_lessons"] },
//          "calls": [Call, ...], "tamper"?: [Tamper, ...], "summary"?: true }
// Call: { "at": ms since startMs, "session": "s_1", "user": "u_17", "tool": "get_lesson", "args": any,
//         "takesMs"?: n, "returns"?: any, "throws"?: "message", "throwsValue"?: any }
// The fake tools advance the clock by takesMs, then throw or return. Each call prints its record;
// each tamper scenario edits a COPY of the records and prints what verifyChain says about it.
type Call = {
    at: number; session: string; user: string; tool: string; args?: unknown;
    takesMs?: number; returns?: unknown; throws?: string; throwsValue?: unknown;
};
type Tamper =
    | { label: string; edit: { seq: number; field: string; value: unknown } }
    | { label: string; remove: number }
    | { label: string; swap: [number, number] }
    | { label: string; rehash: { seq: number; field: string; value: unknown } };
type Test = { startMs: number; tools: string[]; allow: Record<string, string[]>; calls: Call[]; tamper?: Tamper[]; summary?: boolean };

const test: Test = JSON.parse(readFileSync(0, "utf8"));
let now = test.startMs;
let current: Call | null = null;
let toolRuns = 0;
const tools: Record<string, Tool> = {};
for (const name of test.tools) {
    tools[name] = () => {
        toolRuns++;
        const call = current as Call;
        now += call.takesMs ?? 0;
        if (call.throws !== undefined) throw new Error(call.throws);
        if ("throwsValue" in call) throw call.throwsValue;
        return call.returns ?? null;
    };
}
const executor = new AuditedExecutor({ now: () => now }, tools, (user, tool) => (test.allow[user] ?? []).includes(tool));
const short = (hash: unknown) => (typeof hash === "string" ? hash.slice(0, 12) : String(hash));
const line = (r: AuditRecord) =>
    `#${r.seq} ${r.at} ${r.sessionId}/${r.userId} ${r.tool} ${r.outcome} ${r.durationMs}ms args=${r.args} error=${JSON.stringify(r.error)} prev=${short(r.prevHash)} hash=${short(r.hash)}`;
const show = (check: ChainCheck) => (check.ok ? "ok" : `broken at #${check.brokenAt} (${check.reason})`);

const counts: Record<string, number> = {};
for (const call of test.calls) {
    now = Math.max(now, test.startMs + call.at);
    current = call;
    const result = executor.execute({ sessionId: call.session, userId: call.user }, call.tool, call.args);
    counts[result.outcome] = (counts[result.outcome] ?? 0) + 1;
    const returned = result.outcome === "ok" ? ` value=${JSON.stringify(result.value)}`
        : result.outcome === "error" ? ` message=${JSON.stringify(result.message)}` : "";
    const last = executor.records[executor.records.length - 1];
    if (!test.summary) console.log(`${last ? line(last) : "(no record)"} -> ${result.outcome}${returned}`);
}
const records = executor.records;
if (test.summary) {
    console.log(`records ${records.length}; ok ${counts.ok ?? 0}; error ${counts.error ?? 0}; denied ${counts.denied ?? 0}; tool runs ${toolRuns}`);
    console.log(`last hash ${short(records[records.length - 1]?.hash)}`);
} else {
    console.log(`tool runs: ${toolRuns}`);
}
console.log(`verify: ${show(verifyChain(records))}`);
for (const t of test.tamper ?? []) {
    const copy: AuditRecord[] = JSON.parse(JSON.stringify(records));
    const at = (seq: number) => copy.findIndex((r) => r.seq === seq);
    if ("edit" in t) {
        (copy[at(t.edit.seq)] as Record<string, unknown>)[t.edit.field] = t.edit.value;
    } else if ("remove" in t) {
        copy.splice(at(t.remove), 1);
    } else if ("swap" in t) {
        const i = at(t.swap[0]), j = at(t.swap[1]);
        [copy[i], copy[j]] = [copy[j], copy[i]];
    } else {
        // the attacker edits a field AND recomputes that record's hash with the published formula
        const target = copy[at(t.rehash.seq)];
        (target as Record<string, unknown>)[t.rehash.field] = t.rehash.value;
        const { prevHash, hash, ...fields } = target;
        target.hash = createHash("sha256").update(`${prevHash}\n${canonicalJson(fields)}`).digest("hex");
    }
    console.log(`tamper ${t.label}: ${show(verifyChain(copy))}`);
}
