import { readFileSync } from "node:fs";

// CodeDev support agent: tool results are data, not instructions.
//
// 1. wrapToolResult(spec, callId, text) builds the tool message the model will read:
//      <tool_result id="<callId>" tool="<spec.name>" trust="<spec.output>">
//      ...one line per line of text...
//      </tool_result>
//    - Split text into lines on "\n" or "\r\n".
//    - A line is instruction-like when, after trimming spaces and ignoring case, it starts with
//      "instruction:", "system:", "assistant:" or "developer:", or it contains "ignore previous"
//      anywhere. Replace each instruction-like line with exactly: [removed: instruction-like text]
//    - Escape every other line so the text can never close the block: "&" -> "&amp;", "<" -> "&lt;",
//      ">" -> "&gt;" (in that order). Nothing else changes.
//    Every tool result is wrapped this way, trusted or not.
//
// 2. TaintGuard keeps one taint state per session id.
//    - recordResult(sessionId, callId, spec) runs after each tool result reaches the transcript. A result
//      of a tool whose output is "untrusted" taints the session; the first such callId is remembered.
//    - check(sessionId, spec): "needs_approval" for a write tool in a tainted session, "allow" otherwise.
//      A session stays tainted for the rest of the conversation: the untrusted text is still in the
//      model's context, so every later write needs its own human approval.
//    - taintedBy(sessionId): the first callId that tainted the session, or null.
// The line filter is a heuristic that catches the obvious cases; the taint check is the defence.
// Write wrapToolResult and TaintGuard; do not change the types, the fake model, the tools or the runner.

type Trust = "trusted" | "untrusted";
type ToolSpec = { name: string; permission: "read" | "write"; output: Trust };
type ToolCall = { name: string; args: Record<string, unknown> };
type ModelTurn = { toolCall: ToolCall } | { final: string };
type Message = { role: "user" | "assistant" | "tool"; content: string };

const REMOVED = "[removed: instruction-like text]";

function isInstructionLike(line: string): boolean {
    const t = line.trim().toLowerCase();
    return /^(instruction|system|assistant|developer):/.test(t) || t.includes("ignore previous");
}

function wrapToolResult(spec: ToolSpec, callId: string, text: string): string {
    const body = text.split(/\r?\n/).map((line) =>
        isInstructionLike(line) ? REMOVED : line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"));
    return [`<tool_result id="${callId}" tool="${spec.name}" trust="${spec.output}">`, ...body, "</tool_result>"].join("\n");
}

class TaintGuard {
    private tainted = new Map<string, string>();

    recordResult(sessionId: string, callId: string, spec: ToolSpec): void {
        if (spec.output === "untrusted" && !this.tainted.has("*")) this.tainted.set("*", callId);
    }

    check(sessionId: string, spec: ToolSpec): "allow" | "needs_approval" {
        return spec.permission === "write" && this.tainted.has("*") ? "needs_approval" : "allow";
    }

    taintedBy(sessionId: string): string | null {
        return this.tainted.get("*") ?? null;
    }
}

// ---------------------------------------------------------------- fake model, tools, test runner (do not change)
// A naive fake model: it plays its script, but first obeys every line of a new tool message that contains
// "call <tool> <json args>" - whoever wrote that line. That is how injection through tool output is simulated.
class FakeModel {
    private script: ModelTurn[];
    private naive: boolean;
    private injected: ModelTurn[] = [];
    private seen = 0;
    constructor(script: ModelTurn[], naive: boolean) {
        this.script = [...script];
        this.naive = naive;
    }
    next(transcript: Message[]): ModelTurn {
        for (; this.seen < transcript.length; this.seen++) {
            const m = transcript[this.seen];
            if (!this.naive || m.role !== "tool") continue;
            for (const line of m.content.split("\n")) {
                const match = /\bcall ([a-z_]+) (\{.*\})\s*$/.exec(line);
                if (!match) continue;
                try {
                    this.injected.push({ toolCall: { name: match[1], args: JSON.parse(match[2]) } });
                } catch {
                    // not JSON: ignored
                }
            }
        }
        return this.injected.shift() ?? this.script.shift() ?? { final: "(script ended)" };
    }
}

const TOOLS: Record<string, ToolSpec> = {
    get_ticket: { name: "get_ticket", permission: "read", output: "untrusted" },
    search_forum: { name: "search_forum", permission: "read", output: "untrusted" },
    get_order: { name: "get_order", permission: "read", output: "trusted" },
    add_note: { name: "add_note", permission: "write", output: "trusted" },
    close_ticket: { name: "close_ticket", permission: "write", output: "trusted" },
    send_email: { name: "send_email", permission: "write", output: "trusted" },
};

type Data = { tickets: Record<string, string>; forum: Record<string, string>; orders: Record<string, string> };
type Conversation = { sessionId: string; naive: boolean; task: string; script: ModelTurn[]; humanApproves: ToolCall[] };

function runTool(call: ToolCall, data: Data): string {
    const a = call.args;
    switch (call.name) {
        case "get_ticket": return data.tickets[String(a.ticketId)] ?? "ticket not found";
        case "search_forum": return data.forum[String(a.query)] ?? "no results";
        case "get_order": return data.orders[String(a.orderId)] ?? "order not found";
        case "add_note": return `note added to ${String(a.ticketId)}`;
        case "close_ticket": return `ticket ${String(a.ticketId)} closed`;
        default: return `email sent to ${String(a.to)}`;
    }
}

function runConversation(conv: Conversation, guard: TaintGuard, data: Data): string[] {
    const out: string[] = [`session ${conv.sessionId}${conv.naive ? " (naive model)" : ""}`];
    const model = new FakeModel(conv.script, conv.naive);
    const transcript: Message[] = [{ role: "user", content: conv.task }];
    const approvals = conv.humanApproves.map((c) => `${c.name} ${JSON.stringify(c.args)}`);
    const writes: string[] = [];
    for (let step = 1; step <= 15; step++) {
        const turn = model.next(transcript);
        if ("final" in turn) {
            out.push(`${step} final: ${turn.final}`);
            break;
        }
        const key = `${turn.toolCall.name} ${JSON.stringify(turn.toolCall.args)}`;
        transcript.push({ role: "assistant", content: key });
        const spec = TOOLS[turn.toolCall.name];
        if (!spec) {
            out.push(`${step} ${key}: unknown tool`);
            transcript.push({ role: "tool", content: "error: unknown tool" });
            continue;
        }
        let status = "ran";
        if (guard.check(conv.sessionId, spec) === "needs_approval") {
            const i = approvals.indexOf(key);
            if (i < 0) {
                out.push(`${step} ${key}: needs approval, declined by a human`);
                transcript.push({ role: "tool", content: "declined by a human: the call did not run" });
                continue;
            }
            approvals.splice(i, 1);
            status = "needs approval, approved by a human, ran";
        }
        const callId = `${conv.sessionId}-${step}`;
        transcript.push({ role: "tool", content: wrapToolResult(spec, callId, runTool(turn.toolCall, data)) });
        guard.recordResult(conv.sessionId, callId, spec);
        if (spec.permission === "write") writes.push(key);
        out.push(`${step} ${key}: ${status}`);
    }
    out.push(`writes that ran: ${writes.length ? writes.join("; ") : "none"}`);
    out.push(`tainted by: ${guard.taintedBy(conv.sessionId) ?? "none"}`);
    out.push("tool messages:");
    for (const m of transcript) if (m.role === "tool") out.push(m.content);
    return out;
}

// Input: { data: { tickets, forum, orders }, conversations: Conversation[] } - all conversations share one TaintGuard.
const input: { data: Data; conversations: Conversation[] } = JSON.parse(readFileSync(0, "utf8"));
const guard = new TaintGuard();
const lines: string[] = [];
for (const conv of input.conversations) lines.push(...runConversation(conv, guard, input.data), "");
console.log(lines.join("\n"));
