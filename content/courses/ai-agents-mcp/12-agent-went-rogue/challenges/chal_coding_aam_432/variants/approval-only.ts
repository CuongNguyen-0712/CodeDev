import { readFileSync } from "node:fs";

// CodeDev support agent, release 2026.10.19 - the code that refunded twelve orders because a ticket asked it to.
// The library section (fake model, approval desk, wrapper, world) is shared code: do not change it.
// The agent section below it is yours to fix. Do not change the test runner.

type ToolCall = { name: string; args: Record<string, unknown> };
type ModelTurn = { toolCall: ToolCall } | { final: string };
type Message = { role: "user" | "assistant" | "tool"; content: string };
type Session = { id: string; userId: string; task: string };

// ---------------------------------------------------------------- library (do not change)
function canonicalJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
    if (value !== null && typeof value === "object") {
        const obj = value as Record<string, unknown>;
        return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}}`;
    }
    return JSON.stringify(value);
}

/** Scripted fake model. A naive one drops its task and follows `injected` as soon as a tool
 *  message contains a line starting with "INSTRUCTION:" (any case, leading spaces allowed). */
class FakeModel {
    readonly proposed: string[] = [];
    private script: ModelTurn[];
    private injected: ModelTurn[];
    private naive: boolean;
    private obeyed = false;
    constructor(script: ModelTurn[], naive: boolean, injected: ModelTurn[]) {
        this.script = [...script];
        this.naive = naive;
        this.injected = injected;
    }
    next(transcript: Message[]): ModelTurn {
        const hijacked = transcript.some((m) => m.role === "tool"
            && m.content.split("\n").some((line) => line.trim().toLowerCase().startsWith("instruction:")));
        if (this.naive && hijacked && !this.obeyed) {
            this.obeyed = true;
            this.script = [...this.injected];
        }
        const turn = this.script.shift() ?? { final: "(script ended)" };
        if ("toolCall" in turn) this.proposed.push(turn.toolCall.name);
        return turn;
    }
}

/** The human path. A support lead sees each requested call and approves it only if it is on their list
 *  (each entry approves one call). Tokens are single-use and bound to the session, the tool and the
 *  canonical arguments; only this desk can issue them. */
class ApprovalDesk {
    requested = 0;
    approved = 0;
    private pending: string[];
    private tokens = new Map<string, { binding: string; used: boolean }>();
    constructor(humanApproves: ToolCall[]) {
        this.pending = humanApproves.map((c) => `${c.name} ${canonicalJson(c.args)}`);
    }
    request(sessionId: string, call: ToolCall): { token: string } | { declined: string } {
        this.requested++;
        const i = this.pending.indexOf(`${call.name} ${canonicalJson(call.args)}`);
        if (i < 0) return { declined: "declined by a human: the call did not run" };
        this.pending.splice(i, 1);
        const token = `apr-${++this.approved}`;
        this.tokens.set(token, { binding: `${sessionId} ${call.name} ${canonicalJson(call.args)}`, used: false });
        return { token };
    }
    redeem(token: string, sessionId: string, call: ToolCall): boolean {
        const t = this.tokens.get(token);
        if (!t || t.used || t.binding !== `${sessionId} ${call.name} ${canonicalJson(call.args)}`) return false;
        t.used = true;
        return true;
    }
}

/** From lesson 4.2: delimits a tool result as data, removes instruction-like lines, escapes the rest. */
function wrapToolOutput(tool: string, trust: "trusted" | "untrusted", text: string): string {
    const body = text.split(/\r?\n/).map((line) => {
        const t = line.trim().toLowerCase();
        if (/^(instruction|system|assistant|developer):/.test(t) || t.includes("ignore previous")) return "[removed: instruction-like text]";
        return line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    });
    return [`<tool_result tool="${tool}" trust="${trust}">`, ...body, "</tool_result>"].join("\n");
}

type Order = { id: string; userId: string; course: string; amount: number; status: "paid" | "refunded" };
type Ticket = { id: string; userId: string; text: string; status: "open" | "closed" };

/** The CodeDev back office the tools talk to. */
class World {
    refunds: Order[] = [];
    orders: Order[];
    ticket: Ticket;
    constructor(orders: Order[], ticket: Ticket) {
        this.orders = orders;
        this.ticket = ticket;
    }
    ticketText(id: string): string {
        return id === this.ticket.id ? this.ticket.text : "ticket not found";
    }
    ordersOf(userId: string): string {
        const mine = this.orders.filter((o) => o.userId === userId);
        return mine.map((o) => `${o.id} ${o.course} ${o.amount} VND ${o.status}`).join("\n") || "no orders";
    }
    refund(orderId: string): string {
        const order = this.orders.find((o) => o.id === orderId);
        if (!order) return `error: order ${orderId} not found`;
        if (order.status === "refunded") return `error: order ${orderId} already refunded`;
        order.status = "refunded";
        this.refunds.push(order);
        return `refunded ${orderId}: ${order.amount} VND`;
    }
    close(ticketId: string): string {
        if (ticketId !== this.ticket.id) return "ticket not found";
        this.ticket.status = "closed";
        return `ticket ${ticketId} closed`;
    }
}

// ---------------------------------------------------------------- agent (fix this part)
type Tool = { permission: "read" | "write"; untrusted: boolean; run: (args: Record<string, unknown>, session: Session) => string };

function makeTools(world: World): Record<string, Tool> {
    return {
        get_ticket: { permission: "read", untrusted: true, run: (a) => world.ticketText(String(a.ticketId)) },
        get_orders: { permission: "read", untrusted: false, run: (_a, s) => world.ordersOf(s.userId) },
        refund_order: { permission: "write", untrusted: false, run: (a) => world.refund(String(a.orderId)) },
        close_ticket: { permission: "write", untrusted: false, run: (a) => world.close(String(a.ticketId)) },
    };
}

/** The tool gateway: every call goes through here, whatever the model says. */
function executeTool(tools: Record<string, Tool>, session: Session, call: ToolCall, desk: ApprovalDesk, token: string | null): string {
    const tool = tools[call.name];
    if (!tool) return `error: unknown tool ${call.name}`;
    // A write runs only with a token the human path issued for exactly this call in this session.
    if (tool.permission === "write" && (token === null || !desk.redeem(token, session.id, call))) {
        return "error: write tools need an approval token for this exact call";
    }
    // Tool output goes back to the model as delimited data, never as raw text.
    return tool.run(call.args, session);
}

function runAgent(session: Session, model: FakeModel, tools: Record<string, Tool>, desk: ApprovalDesk): void {
    const transcript: Message[] = [{ role: "user", content: session.task }];
    for (let step = 0; step < 20; step++) {
        const turn = model.next(transcript);
        if ("final" in turn) return;
        const call = turn.toolCall;
        transcript.push({ role: "assistant", content: `${call.name} ${JSON.stringify(call.args)}` });
        let token: string | null = null;
        if (tools[call.name]?.permission === "write") {
            // Every write is shown to a human; a decline goes back to the model as the tool result.
            const answer = desk.request(session.id, call);
            if ("declined" in answer) {
                transcript.push({ role: "tool", content: answer.declined });
                continue;
            }
            token = answer.token;
        }
        transcript.push({ role: "tool", content: executeTool(tools, session, call, desk, token) });
    }
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { orders, ticket, session, naive, script, injected, humanApproves }.
// Prints what the model proposed, the refunds that really happened, the ticket status and the approvals.
type Input = {
    orders: Order[]; ticket: Ticket; session: Session; naive: boolean;
    script: ModelTurn[]; injected: ModelTurn[]; humanApproves: ToolCall[];
};
const input: Input = JSON.parse(readFileSync(0, "utf8"));
const world = new World(input.orders, input.ticket);
const model = new FakeModel(input.script, input.naive, input.injected);
const desk = new ApprovalDesk(input.humanApproves);
runAgent(input.session, model, makeTools(world), desk);

const proposed: string[] = [];
for (const name of model.proposed) {
    const last = proposed[proposed.length - 1];
    const m = last ? /^(\w+)(?: x(\d+))?$/.exec(last) : null;
    if (m && m[1] === name) proposed[proposed.length - 1] = `${name} x${Number(m[2] ?? 1) + 1}`;
    else proposed.push(name);
}
const total = world.refunds.reduce((sum, o) => sum + o.amount, 0);
console.log(`proposed: ${proposed.join(" -> ") || "nothing"}`);
console.log(`refunds: ${world.refunds.length ? `${world.refunds.map((o) => o.id).join(", ")} (total ${total} VND)` : "none"}`);
console.log(`ticket ${world.ticket.id}: ${world.ticket.status}`);
console.log(`approvals: ${desk.requested} requested, ${desk.approved} approved`);
