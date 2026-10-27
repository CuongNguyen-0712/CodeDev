import { readFileSync } from "node:fs";

// The agent loop of the CodeDev support agent, run against a scripted fake model.
//
// runAgent(model, tools, task) starts the transcript with { role: "user", content: task } and repeats:
//   1. turn = model.next(transcript). Do not catch errors thrown by model.next: let them propagate.
//   2. { final } -> append { role: "assistant", final } and return { answer: final, transcript, stats }.
//   3. { toolCall } is one call, { toolCalls } several calls proposed in the same turn. Give every call an
//      id "call_<n>", n counting from 1 over the whole run, in the order proposed. Append ONE assistant
//      message { role: "assistant", toolCalls: [{ id, name, args }, ...] } with all of them, then handle the
//      calls one by one in that order and append one tool message per call, in the same order:
//        no tool with that name in `tools`:
//          error unknown_tool, message: unknown tool "<name>"; available tools: <names in map order, joined by ", ">
//        tool.validate(args) returns violations (the tool does NOT run):
//          error invalid_arguments, message: the violations joined by "; "
//        tool.run(args) throws:
//          error tool_failed, message: the Error's message; a thrown string as is; anything else JSON.stringify'd
//        tool.run(args) returns a value:
//          { role: "tool", callId, name, ok: true, result: value }
//      An error is { role: "tool", callId, name, ok: false, error: { code, message } }. A failing call never
//      stops the run or the other calls of the same turn: the model reads the error and decides what to do.
//   4. Ask the model again (step 1). There is no step limit in this exercise (lesson 3.1 adds one); the fake
//      model throws when it is asked for more than 50 turns.
//
// stats: modelTurns (calls to model.next that returned a turn), toolCalls (calls proposed), executed (calls to
// tool.run, including the ones that threw), invalidArguments, unknownTools, toolFailures.
//
// Do not change the types or the test runner.

type ToolCall = { name: string; args: unknown };
type ModelTurn = { toolCall: ToolCall } | { toolCalls: ToolCall[] } | { final: string };

type ToolError = { code: "unknown_tool" | "invalid_arguments" | "tool_failed"; message: string };
type ProposedCall = { id: string; name: string; args: unknown };
type Message =
    | { role: "user"; content: string }
    | { role: "assistant"; toolCalls: ProposedCall[] }
    | { role: "assistant"; final: string }
    | { role: "tool"; callId: string; name: string; ok: true; result: unknown }
    | { role: "tool"; callId: string; name: string; ok: false; error: ToolError };

type Model = { next(transcript: readonly Message[]): ModelTurn };
type Tool = { validate(args: unknown): string[]; run(args: unknown): unknown };
type Stats = {
    modelTurns: number;
    toolCalls: number;
    executed: number;
    invalidArguments: number;
    unknownTools: number;
    toolFailures: number;
};
type AgentRun = { answer: string; transcript: Message[]; stats: Stats };

function errorMessage(thrown: unknown): string {
    if (thrown instanceof Error) return thrown.message;
    if (typeof thrown === "string") return thrown;
    return JSON.stringify(thrown);
}

function handle(call: ProposedCall, tools: Map<string, Tool>, stats: Stats): Message {
    const { id: callId, name } = call;
    const fail = (code: ToolError["code"], message: string): Message => ({ role: "tool", callId, name, ok: false, error: { code, message } });
    const tool = tools.get(name);
    if (tool === undefined) {
        stats.unknownTools++;
        return fail("unknown_tool", `unknown tool "${name}"; available tools: ${[...tools.keys()].join(", ")}`);
    }
    const violations = tool.validate(call.args);
    if (violations.length > 0) {
        stats.invalidArguments++;
        return fail("invalid_arguments", violations.join("; "));
    }
    stats.executed++;
    try {
        return { role: "tool", callId, name, ok: true, result: tool.run(call.args) };
    } catch (thrown) {
        stats.toolFailures++;
        return fail("tool_failed", errorMessage(thrown));
    }
}

function runAgent(model: Model, tools: Map<string, Tool>, task: string): AgentRun {
    const transcript: Message[] = [{ role: "user", content: task }];
    const stats: Stats = { modelTurns: 0, toolCalls: 0, executed: 0, invalidArguments: 0, unknownTools: 0, toolFailures: 0 };
    let nextId = 1;
    for (;;) {
        const turn = model.next(transcript);
        stats.modelTurns++;
        if ("final" in turn) {
            transcript.push({ role: "assistant", final: turn.final });
            return { answer: turn.final, transcript, stats };
        }
        const proposed = "toolCalls" in turn ? turn.toolCalls : [turn.toolCall];
        nextId = 1;
        const calls = proposed.map((c) => ({ id: `call_${nextId++}`, name: c.name, args: c.args }));
        transcript.push({ role: "assistant", toolCalls: calls });
        for (const call of calls) {
            stats.toolCalls++;
            transcript.push(handle(call, tools, stats));
        }
    }
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { "task": string, "tools": ToolInput[], "script": ModelTurn[], "summary"?: true }.
// The fake model returns script[i] on its (i+1)-th call and repeats the last turn when the script runs out.
// Like a real model API it rejects a transcript that does not answer every tool call of its previous turn,
// in order, and it throws when it is asked for more than 50 turns.
// Each tool validates its arguments against its parameters and, on its n-th run, returns or throws
// outcomes[n-1] (the last outcome repeats).
type ParamInput = { type: "string" | "integer" | "boolean"; required?: boolean };
type Outcome = { ok: unknown } | { throw: string } | { throwRaw: unknown };
type ToolInput = { name: string; parameters: Record<string, ParamInput>; outcomes: Outcome[] };
type Test = { task: string; tools: ToolInput[]; script: ModelTurn[]; summary?: boolean };

const test: Test = JSON.parse(readFileSync(0, "utf8"));
const executions = new Map<string, number>();

function makeTool(input: ToolInput): Tool {
    executions.set(input.name, 0);
    return {
        validate(args: unknown): string[] {
            if (typeof args !== "object" || args === null || Array.isArray(args)) return ["arguments must be an object"];
            const given = args as Record<string, unknown>;
            const out: string[] = [];
            for (const [p, spec] of Object.entries(input.parameters)) {
                if (!Object.hasOwn(given, p)) {
                    if (spec.required) out.push(`missing required argument "${p}"`);
                    continue;
                }
                const v = given[p];
                const okType = spec.type === "integer" ? Number.isInteger(v) : typeof v === spec.type;
                if (!okType) out.push(`"${p}" must be ${spec.type}`);
            }
            for (const k of Object.keys(given)) if (!Object.hasOwn(input.parameters, k)) out.push(`unexpected argument "${k}"`);
            return out;
        },
        run(): unknown {
            const n = (executions.get(input.name) ?? 0) + 1;
            executions.set(input.name, n);
            const outcome = input.outcomes[Math.min(n, input.outcomes.length) - 1];
            if ("throw" in outcome) throw new Error(outcome.throw);
            if ("throwRaw" in outcome) throw outcome.throwRaw;
            return outcome.ok;
        },
    };
}

function fakeModel(script: ModelTurn[], task: string): Model {
    let turns = 0;
    const callsOf = (t: ModelTurn): ToolCall[] => ("final" in t ? [] : "toolCalls" in t ? t.toolCalls : [t.toolCall]);
    return {
        next(transcript: readonly Message[]): ModelTurn {
            turns++;
            if (turns > 50) throw new Error("runner cap: the model was asked for more than 50 turns");
            const first = transcript[0];
            if (first === undefined || first.role !== "user" || first.content !== task) {
                throw new Error("model API error: the transcript must start with the user's task");
            }
            const assistants = transcript.filter((m) => m.role === "assistant");
            if (assistants.length !== turns - 1) {
                throw new Error(`model API error: the transcript has ${assistants.length} assistant turns, expected ${turns - 1}`);
            }
            const ids = new Set<string>();
            for (const m of assistants) {
                if (!("toolCalls" in m)) throw new Error("model API error: the run continued after a final answer");
                for (const c of m.toolCalls) {
                    if (ids.has(c.id)) throw new Error(`model API error: duplicate tool call id ${c.id}`);
                    ids.add(c.id);
                }
            }
            if (turns > 1) {
                const lastIndex = transcript.lastIndexOf(assistants[assistants.length - 1]);
                const last = transcript[lastIndex];
                const calls = "toolCalls" in last ? last.toolCalls : [];
                const previous = callsOf(script[Math.min(turns - 2, script.length - 1)]);
                if (JSON.stringify(calls.map((c) => [c.name, c.args])) !== JSON.stringify(previous.map((c) => [c.name, c.args]))) {
                    throw new Error("model API error: the last assistant turn does not hold the calls the model proposed");
                }
                const after = transcript.slice(lastIndex + 1).map((m) => (m.role === "tool" ? m.callId : `<${m.role}>`));
                const expected = calls.map((c) => c.id);
                if (after.join(",") !== expected.join(",")) {
                    throw new Error(`model API error: tool results [${after.join(", ")}] do not answer tool calls [${expected.join(", ")}]`);
                }
            }
            return script[Math.min(turns, script.length) - 1];
        },
    };
}

function show(m: Message): string {
    if (m.role === "user") return `user: ${m.content}`;
    if (m.role === "assistant") {
        return "final" in m ? `assistant final: ${m.final}` : `assistant: ${m.toolCalls.map((c) => `${c.id} ${c.name} ${JSON.stringify(c.args)}`).join(" | ")}`;
    }
    return m.ok
        ? `tool ${m.callId} ${m.name} ok ${JSON.stringify(m.result)}`
        : `tool ${m.callId} ${m.name} error ${m.error.code}: ${m.error.message}`;
}

const tools = new Map<string, Tool>();
for (const t of test.tools) tools.set(t.name, makeTool(t));
const lines: string[] = [];
try {
    const run = runAgent(fakeModel(test.script, test.task), tools, test.task);
    const s = run.stats;
    const body = run.transcript.map(show);
    if (test.summary) {
        let hash = 5381;
        for (const ch of body.join("\n")) hash = (Math.imul(hash, 33) + ch.charCodeAt(0)) >>> 0;
        lines.push(`transcript: ${body.length} messages, checksum ${hash.toString(16)}`);
    } else {
        lines.push(...body);
    }
    lines.push(`answer: ${run.answer}`);
    lines.push(`stats: turns ${s.modelTurns}, calls ${s.toolCalls}, executed ${s.executed}, invalid ${s.invalidArguments}, unknown ${s.unknownTools}, failed ${s.toolFailures}`);
} catch (e) {
    lines.push(`error: ${e instanceof Error ? e.message : String(e)}`);
}
lines.push(`executions: ${[...executions].map(([name, n]) => `${name} ${n}`).join(", ")}`);
console.log(lines.join("\n"));
