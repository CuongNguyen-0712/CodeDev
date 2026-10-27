import { readFileSync } from "node:fs";

// The CodeDev AI tutor lets the model propose tool calls. The model only proposes: this gate decides
// what runs. Incident: getSubmission took a userId argument from the model and showed another
// learner's code. Write checkToolCalls(input). The full rules are in the challenge description.
// Do not change the types or the test runner.

type ParamSpec = {
    type: "string" | "integer" | "boolean";
    required: boolean;
    minimum?: number; // integer only
    maximum?: number; // integer only
    maxLength?: number; // string only
    enum?: string[]; // string only
};

type ToolDef = {
    name: string;
    permission: "read-only" | "needs-confirmation";
    scope: "user" | "public"; // "user": the server adds userId from the session
    parameters: Record<string, ParamSpec>;
};

// What the model proposed: the tool name and the raw JSON text of its arguments.
type ProposedCall = { id: string; name: string; arguments: string };

type GateInput = {
    sessionUserId: string;
    confirmedCallIds: string[];
    tools: ToolDef[];
    calls: ProposedCall[];
};

type ArgValue = string | number | boolean;

type Decision =
    | { id: string; tool: string; status: "run"; args: Record<string, ArgValue> }
    | { id: string; tool: string; status: "rejected"; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

/** The checked arguments, or the reason the call is rejected. */
function checkArguments(tool: ToolDef, raw: string): Record<string, ArgValue> | string {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return "arguments are not valid JSON";
    }
    if (!isRecord(parsed)) return "arguments must be a JSON object";
    if (Object.hasOwn(parsed, "userId")) return "userId comes from the session";
    for (const key of Object.keys(parsed)) {
        if (!Object.hasOwn(tool.parameters, key)) return `unexpected argument "${key}"`;
    }
    const args: Record<string, ArgValue> = {};
    for (const [name, spec] of Object.entries(tool.parameters)) {
        if (!Object.hasOwn(parsed, name)) {
            if (spec.required) return `missing argument "${name}"`;
            continue;
        }
        const value = parsed[name];
        if (spec.type === "integer") {
            if (typeof value !== "number" || !Number.isInteger(value)) return `argument "${name}" must be integer`;
            if ((spec.minimum !== undefined && value < spec.minimum) || (spec.maximum !== undefined && value > spec.maximum)) {
                return `argument "${name}" is out of range`;
            }
            args[name] = value;
        } else if (spec.type === "string") {
            if (typeof value !== "string") return `argument "${name}" must be string`;
            if (spec.maxLength !== undefined && value.length > spec.maxLength) return `argument "${name}" is too long`;
            if (spec.enum !== undefined && !spec.enum.includes(value)) return `argument "${name}" is not an allowed value`;
            args[name] = value;
        } else {
            if (typeof value !== "boolean") return `argument "${name}" must be boolean`;
            args[name] = value;
        }
    }
    return args;
}

function checkToolCalls(input: GateInput): Decision[] {
    const tools = new Map(input.tools.map((t) => [t.name, t]));
    const confirmed = new Set(input.confirmedCallIds);
    return input.calls.map((call): Decision => {
        const reject = (reason: string): Decision => ({ id: call.id, tool: call.name, status: "rejected", reason });
        const tool = tools.get(call.name);
        if (!tool) return reject(`unknown tool "${call.name}"`);
        const args = checkArguments(tool, call.arguments);
        if (typeof args === "string") return reject(args);
        if (tool.permission === "needs-confirmation" && !confirmed.has(call.id)) return reject("needs confirmation");
        if (tool.scope === "user") args.userId = input.sessionUserId;
        return { id: call.id, tool: call.name, status: "run", args };
    });
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: one GateInput as JSON. Output: the list of decisions, in the order of the calls, as JSON.
const input: GateInput = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(checkToolCalls(input)));
