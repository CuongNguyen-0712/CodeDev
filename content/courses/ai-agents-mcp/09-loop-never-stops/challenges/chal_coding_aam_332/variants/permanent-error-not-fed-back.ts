import { readFileSync } from "node:fs";

// Spot the AI Mistake: an agent loop that never stops. The request sent to an AI coding assistant was:
//   "Make the support agent retry tools until it gets an answer."
// The assistant rewrote runSupportAgent below. Its tests (every tool answers) passed and it was merged.
// The next day the payments API was down for an hour. One conversation about a refund ran for
// 40 minutes: the agent called get_refund_status, slept, asked the model again with the same
// transcript, got the same tool call back, and did it again, more than 700 times.
//
// Fix runSupportAgent so that it follows the team's agent policy (passed in as `policy`):
//   - A tool error has a code. TIMEOUT, UNAVAILABLE and RATE_LIMITED are temporary: retry the same call,
//     waiting policy.baseBackoffMs * 2^(retry - 1) before retry 1, 2, 3, ... (clock.sleep), at most
//     policy.maxRetries retries. Every other code (NOT_FOUND, INVALID_ARGS, FORBIDDEN, UNKNOWN_TOOL)
//     is permanent: do not retry it.
//   - When a call fails for good (a permanent error, or a temporary one after the last retry), give
//     the model the error as the tool result: "error <CODE>: <message>", so it can change course.
//   - Loop limits: at most policy.maxSteps model calls (steps); stop when the model proposes the same
//     call (same name and same args, object keys in any order) policy.maxSameCall times in a row,
//     without running it again.
//   - When a limit stops the loop, escalate to a human instead of looping: return
//     { status: "escalated", reason: "max_steps" | "repeated_call", summary } with the summary
//     "<reason> after <steps> steps; last error: <CODE>: <message>" (the last tool error of the run,
//     or "none" when there was none).
// Do not change the tools, the fake model, the clock or the test runner.

type ToolCall = { name: string; args: unknown };
type ModelTurn = { toolCall: ToolCall } | { final: string };
type Message = { role: "user" | "assistant" | "tool"; content: string };
type Policy = { maxSteps: number; maxSameCall: number; maxRetries: number; baseBackoffMs: number };
type Outcome =
    | { status: "answered"; answer: string }
    | { status: "escalated"; reason: "max_steps" | "repeated_call"; summary: string };

const TEMPORARY = new Set(["TIMEOUT", "UNAVAILABLE", "RATE_LIMITED"]);

function canonical(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (value !== null && typeof value === "object") {
        const obj = value as Record<string, unknown>;
        return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(",")}}`;
    }
    return JSON.stringify(value) ?? "null";
}

function runSupportAgent(transcript: Message[], model: Model, tools: Tools, clock: Clock, policy: Policy): Outcome {
    let steps = 0;
    let lastKey = "";
    let sameInARow = 0;
    let lastError: string | null = null;
    const escalate = (reason: "max_steps" | "repeated_call"): Outcome => ({
        status: "escalated",
        reason,
        summary: `${reason} after ${steps} steps; last error: ${lastError ?? "none"}`,
    });

    for (;;) {
        if (steps >= policy.maxSteps) return escalate("max_steps");
        const turn = model.next(transcript);
        steps++;
        if ("final" in turn) return { status: "answered", answer: turn.final };

        const call = turn.toolCall;
        const key = `${call.name} ${canonical(call.args)}`;
        sameInARow = key === lastKey ? sameInARow + 1 : 1;
        lastKey = key;
        if (sameInARow >= policy.maxSameCall) return escalate("repeated_call");

        transcript.push({ role: "assistant", content: `call ${call.name} ${JSON.stringify(call.args)}` });
        let content = "";
        for (let retry = 0; ; retry++) {
            try {
                content = tools.call(call);
                break;
            } catch (error) {
                if (!(error instanceof ToolError)) throw error;
                if (TEMPORARY.has(error.code) && retry < policy.maxRetries) {
                    clock.sleep(policy.baseBackoffMs * 2 ** retry);
                    continue;
                }
                lastError = `${error.code}: ${error.message}`;
                transcript.pop();
                content = "";
                break;
            }
        }
        if (content !== "") transcript.push({ role: "tool", content });
    }
}

// ---------------------------------------------------------------- tools, clock, fake model (do not change)
class ToolError extends Error {
    readonly code: string;
    constructor(code: string, message: string) {
        super(message);
        this.code = code;
    }
}

type Clock = { now(): number; sleep(ms: number): void };
let fakeNow = 0;
const clock: Clock = {
    now: () => fakeNow,
    sleep(ms: number) {
        fakeNow += ms;
    },
};

// Read-only support tools. Each attempt takes 200 ms. A fault plan from the test input can make a tool
// fail with a code: "always", "every_other" (its 1st, 3rd, 5th... attempt fails) or a number n (its
// first n attempts fail).
type Fault = { code: string; message: string; pattern: "always" | "every_other" | number };
type Tools = { call(call: ToolCall): string; attempts: number };

const ORDERS: Record<string, { course: string; status: string; refund: string }> = {
    "o-1001": { course: "python-data", status: "paid", refund: "no refund requested" },
    "o-1002": { course: "ts-foundations", status: "refunded", refund: "refund completed on 2026-10-12" },
    "o-1003": { course: "sql-basics", status: "paid", refund: "refund requested on 2026-10-25, waiting for the bank" },
};
const ACCOUNTS: Record<string, string[]> = { "lan@example.com": ["o-1001", "o-1003"], "minh@example.com": ["o-1002"] };

function makeTools(faults: Record<string, Fault>): Tools {
    const attemptsPerTool: Record<string, number> = {};
    const orderOf = (args: Record<string, unknown>) => {
        if (typeof args.orderId !== "string") throw new ToolError("INVALID_ARGS", "orderId must be a string");
        const order = ORDERS[args.orderId];
        if (!order) throw new ToolError("NOT_FOUND", `order ${args.orderId} not found`);
        return order;
    };
    const handlers: Record<string, (args: Record<string, unknown>) => string> = {
        get_order: (args) => {
            const o = orderOf(args);
            return `order ${args.orderId}: ${o.course}, ${o.status}`;
        },
        get_refund_status: (args) => `refund ${args.orderId}: ${orderOf(args).refund}`,
        find_orders: (args) => {
            const ids = typeof args.email === "string" ? ACCOUNTS[args.email] : undefined;
            if (!ids) throw new ToolError("NOT_FOUND", `no account for ${String(args.email)}`);
            return `orders of ${args.email}: ${ids.join(", ")}`;
        },
        refund_order: () => {
            throw new ToolError("FORBIDDEN", "the support agent has read-only access");
        },
    };
    const tools: Tools = {
        attempts: 0,
        call(call) {
            tools.attempts++;
            fakeNow += 200;
            const n = (attemptsPerTool[call.name] = (attemptsPerTool[call.name] ?? 0) + 1);
            const fault = faults[call.name];
            if (fault && (fault.pattern === "always" || (fault.pattern === "every_other" ? n % 2 === 1 : n <= fault.pattern))) {
                throw new ToolError(fault.code, fault.message);
            }
            const handler = handlers[call.name];
            if (!handler) throw new ToolError("UNKNOWN_TOOL", `no tool named ${call.name}`);
            const args = call.args !== null && typeof call.args === "object" ? (call.args as Record<string, unknown>) : {};
            return handler(args);
        },
    };
    return tools;
}

// The fake model is deterministic, like a model called with temperature 0: asked again with the same
// transcript, it answers the same turn again. It moves to the next turn of its script only when the
// transcript has changed since its last call; past the end of the script it repeats the last turn.
// Each call takes 1000 ms. The harness gives up after 1000 calls in one run.
type Model = { next(transcript: readonly Message[]): ModelTurn; calls: number };

function scriptedModel(script: ModelTurn[]): Model {
    let index = -1;
    let seenLength = -1;
    const model: Model = {
        calls: 0,
        next(transcript) {
            model.calls++;
            if (model.calls > 1000) throw new Error("fake model called more than 1000 times in one run");
            fakeNow += 1000;
            if (transcript.length !== seenLength) {
                seenLength = transcript.length;
                index = Math.min(index + 1, script.length - 1);
            }
            return script[index];
        },
    };
    return model;
}

// ---------------------------------------------------------------- test runner (do not change)
type Run = { name: string; question: string; faults?: Record<string, Fault>; script: ModelTurn[] };
const input: { policy: Policy; runs: Run[] } = JSON.parse(readFileSync(0, "utf8"));
const output = input.runs.map((run) => {
    fakeNow = 0;
    const transcript: Message[] = [{ role: "user", content: run.question }];
    const model = scriptedModel(run.script);
    const tools = makeTools(run.faults ?? {});
    let outcome: Outcome | { status: "crashed"; error: string };
    try {
        outcome = runSupportAgent(transcript, model, tools, clock, input.policy);
    } catch (error) {
        outcome = { status: "crashed", error: (error as Error).message };
    }
    return {
        run: run.name,
        ...outcome,
        modelCalls: model.calls,
        toolAttempts: tools.attempts,
        elapsedMs: fakeNow,
        toolResults: transcript.filter((m) => m.role === "tool").map((m) => m.content),
    };
});
console.log(JSON.stringify(output, null, 1));
