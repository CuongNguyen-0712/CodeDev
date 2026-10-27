import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

// CodeDev support agent: the permission policy between the model and the tools.
// The model proposes tool calls; decide() answers allow, needs_approval or deny for each one.
//
// Checks, in this order (the first one that applies gives the answer):
//   1. the session id is unknown                                  -> deny "unknown_session"
//   2. the tool is not in the registry                            -> deny "unknown_tool"
//   3. the session's role is in the tool's deniedRoles            -> deny "role_denied"
//   4. args.userId is present and differs from session.userId    -> deny "user_mismatch"
//   5. the tool is a read tool                                    -> allow "read"
//   6. the tool has managerAbove (not null) and args.amount is not a finite number > 0
//                                                                 -> deny "invalid_amount"
//   7. no token came with the call                                -> needs_approval "manager_approval_required"
//      when args.amount > managerAbove, otherwise needs_approval "approval_required"
//   8. the token was never issued                                 -> deny "invalid_token"
//      the token was already consumed                             -> deny "token_used"
//      now >= the token's expiresAt (issue time + ttlMs)          -> deny "token_expired"
//      the token was issued for another session                   -> deny "token_wrong_session"
//      the token was issued for another tool or other arguments   -> deny "token_mismatch"
//   9. args.amount > managerAbove and the approver was not a "manager"
//                                                                 -> needs_approval "manager_approval_required"
//  10. otherwise                                                  -> allow "approved", and the token is consumed
// A token is consumed only by an "allow"; every other answer leaves it as it was.
// Arguments are compared through sha256(canonicalJson(args)): object keys sorted at every level,
// no spaces, so {"orderId":"o-1","amount":20} and {"amount":20,"orderId":"o-1"} are the same call.
// Arrays keep their order. Write canonicalJson and the PermissionPolicy class; do not change the types,
// sha256 or the test runner.

type Permission = "read" | "write";
type ToolSpec = { name: string; permission: Permission; deniedRoles: string[]; managerAbove: number | null };
type Session = { id: string; userId: string; role: string };
type ToolCall = { name: string; args: Record<string, unknown> };
type Approval = { token: string; sessionId: string; call: ToolCall; approverRole: string; ttlMs: number };
type Decision = { decision: "allow" | "needs_approval" | "deny"; reason: string; consumed: string | null };

function sha256(text: string): string {
    return createHash("sha256").update(text).digest("hex");
}

function canonicalJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
    if (value !== null && typeof value === "object") {
        const obj = value as Record<string, unknown>;
        return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}}`;
    }
    return JSON.stringify(value);
}

type Grant = { sessionId: string; tool: string; argsHash: string; approverRole: string; expiresAt: number; used: boolean };

class PermissionPolicy {
    private tools = new Map<string, ToolSpec>();
    private sessions = new Map<string, Session>();
    private grants = new Map<string, Grant>();

    constructor(tools: ToolSpec[], sessions: Session[]) {
        for (const t of tools) this.tools.set(t.name, t);
        for (const s of sessions) this.sessions.set(s.id, s);
    }

    /** The human approval path: a person looked at this exact call and approved it at `now`. */
    approve(approval: Approval, now: number): void {
        this.grants.set(approval.token, {
            sessionId: approval.sessionId,
            tool: approval.call.name,
            argsHash: sha256(canonicalJson(approval.call.args)),
            approverRole: approval.approverRole,
            expiresAt: now + approval.ttlMs,
            used: false,
        });
    }

    decide(sessionId: string, call: ToolCall, token: string | null, now: number): Decision {
        const answer = (decision: Decision["decision"], reason: string, consumed: string | null = null): Decision =>
            ({ decision, reason, consumed });
        const session = this.sessions.get(sessionId);
        if (!session) return answer("deny", "unknown_session");
        const tool = this.tools.get(call.name);
        if (!tool) return answer("deny", "unknown_tool");
        if (tool.deniedRoles.includes(session.role)) return answer("deny", "role_denied");
        if ("userId" in call.args && call.args.userId !== session.userId) return answer("deny", "user_mismatch");
        if (tool.permission === "read") return answer("allow", "read");

        const amount = call.args.amount;
        let overLimit = false;
        if (tool.managerAbove !== null) {
            if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) return answer("deny", "invalid_amount");
            overLimit = amount > tool.managerAbove;
        }
        if (token === null) return answer("needs_approval", overLimit ? "manager_approval_required" : "approval_required");

        const grant = this.grants.get(token);
        if (!grant) return answer("deny", "invalid_token");
        if (grant.used) return answer("deny", "token_used");
        if (now >= grant.expiresAt) return answer("deny", "token_expired");
        if (grant.tool !== call.name || grant.argsHash !== sha256(canonicalJson(call.args))) return answer("deny", "token_mismatch");
        if (overLimit && grant.approverRole !== "manager") return answer("needs_approval", "manager_approval_required");
        grant.used = true;
        return answer("allow", "approved", token);
    }
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { tools, sessions, events }. Events run in order on a fake clock (at = milliseconds):
//   { "type": "approve", "at": 1000, "approval": Approval }
//   { "type": "call", "at": 2000, "sessionId": "s-1", "call": ToolCall, "token": "apr-1" | null }
// Prints one line per call.
type Event =
    | { type: "approve"; at: number; approval: Approval }
    | { type: "call"; at: number; sessionId: string; call: ToolCall; token: string | null };
const input: { tools: ToolSpec[]; sessions: Session[]; events: Event[] } = JSON.parse(readFileSync(0, "utf8"));
const policy = new PermissionPolicy(input.tools, input.sessions);
const lines: string[] = [];
for (const event of input.events) {
    if (event.type === "approve") {
        policy.approve(event.approval, event.at);
        continue;
    }
    const d = policy.decide(event.sessionId, event.call, event.token, event.at);
    lines.push(`t=${event.at} ${event.sessionId} ${event.call.name}: ${d.decision} ${d.reason}${d.consumed ? ` (consumed ${d.consumed})` : ""}`);
}
console.log(lines.join("\n"));
