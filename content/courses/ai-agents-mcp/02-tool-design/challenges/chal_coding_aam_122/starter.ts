import { readFileSync } from "node:fs";

// Tool registry for the CodeDev support agent. Every tool the model may call is registered here
// once; the registry rejects tools that would confuse the model, lists the registered tools in the
// exact shape the model receives, and checks every proposed call before a handler runs.
//
// registerTool(registry, spec) returns every problem with the spec, in this order (empty = registered):
//   1. name is not snake_case (^[a-z][a-z0-9]*(_[a-z0-9]+)*$) or longer than 64 characters:
//        name must be snake_case, 1-64 characters (got "<name>")
//      otherwise, a tool with that name is already in the registry:
//        name "<name>" is already registered
//   2. description, trimmed, is missing or empty:  description is required
//      shorter than 20 characters:                 description is shorter than 20 characters
//      longer than 300 characters:                 description is longer than 300 characters
//   3. parameters.type is not "object":            parameters must have type "object"
//   4. for each property, in the order of parameters.properties, these checks in this order:
//        description missing or blank:             parameter "<p>" needs a description
//        type not string/integer/number/boolean:   parameter "<p>" has unsupported type "<type>"
//        minimum and maximum given, min > max:     parameter "<p>" has minimum greater than maximum
//        minLength and maxLength given, min > max: parameter "<p>" has minLength greater than maxLength
//        pattern given, new RegExp(pattern) throws: parameter "<p>" has an invalid pattern
//   5. for each entry of parameters.required, in order, that is not an own key of properties:
//        required "<p>" is not a declared parameter
//   A spec with no problem is added to the registry; a rejected spec is not.
//
// listTools(registry) returns the registered tools in registration order, each as
//   { name, description, parameters: { type: "object", properties, required, additionalProperties: false } }
//   with the description trimmed; each property is { type, description (trimmed), then only the keywords
//   the spec gives, in this order: enum, minimum, maximum, minLength, maxLength, pattern }.
//   Key order matters: the runner prints it with JSON.stringify.
//
// validateCall(registry, call) returns every violation of the call, empty when it may run:
//   - no registered tool has that name: only  unknown tool "<name>"
//   - args is not a plain object (null, an array, a string, a number...): only  arguments must be an object
//   - otherwise, for each property in the order of parameters.properties:
//       absent (not an own key of args): missing required argument "<p>" if it is required, else nothing
//       wrong type ("integer": Number.isInteger, "number": a finite number, null is a wrong type):
//         "<p>" must be <type>   (and no further checks for that property)
//       enum given and the value is not in it (===):  "<p>" must be one of <values as JSON, joined by ", ">
//       numbers: below minimum: "<p>" must be >= <minimum>; above maximum: "<p>" must be <= <maximum>
//       strings (length = .length): shorter than minLength: "<p>" must be at least <n> characters;
//         longer than maxLength: "<p>" must be at most <n> characters;
//         pattern given and new RegExp(pattern).test(value) is false: "<p>" does not match pattern <pattern>
//     then each own key of args, in key order, that is not an own key of properties:
//       unexpected argument "<key>"
//
// Do not change the types or the test runner.

type ParamSpec = {
    type: string;
    description?: string;
    enum?: (string | number)[];
    minimum?: number;
    maximum?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
};

type ToolSpec = {
    name: string;
    description?: string;
    parameters: { type: string; properties: Record<string, ParamSpec>; required: string[] };
};

type ModelTool = {
    name: string;
    description: string;
    parameters: {
        type: "object";
        properties: Record<string, Record<string, unknown>>;
        required: string[];
        additionalProperties: false;
    };
};

type ToolCall = { name: string; args: unknown };
type Registry = Map<string, ToolSpec>;

function registerTool(registry: Registry, spec: ToolSpec): string[] {
    return [];
}

function listTools(registry: Registry): ModelTool[] {
    return [];
}

function validateCall(registry: Registry, call: ToolCall): string[] {
    return [];
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { "tools": ToolSpec[], "calls": ToolCall[], "summary"?: true }. The specs come from the
// support team's tool files, the calls are recorded model proposals, so both can be wrong.
// Prints one line per registration, the listing the model receives, then one line per call.
// With "summary": true the call lines are replaced by counts and a checksum of those lines.
type Test = { tools: ToolSpec[]; calls: ToolCall[]; summary?: boolean };

const test: Test = JSON.parse(readFileSync(0, "utf8"));
const registry: Registry = new Map();
for (const spec of test.tools) {
    const errors = registerTool(registry, spec);
    console.log(`register ${spec.name}: ${errors.length ? `rejected: ${errors.join("; ")}` : "ok"}`);
}
console.log(`tools: ${JSON.stringify(listTools(registry))}`);
const lines: string[] = [];
let rejected = 0;
let violations = 0;
for (const call of test.calls) {
    const found = validateCall(registry, call);
    if (found.length) rejected++;
    violations += found.length;
    lines.push(`call ${call.name}: ${found.length ? `rejected: ${found.join("; ")}` : "ok"}`);
}
if (test.summary) {
    let hash = 5381;
    for (const ch of lines.join("\n")) hash = (Math.imul(hash, 33) + ch.charCodeAt(0)) >>> 0;
    console.log(`calls ${lines.length}, ok ${lines.length - rejected}, rejected ${rejected}, violations ${violations}, checksum ${hash.toString(16)}`);
} else {
    for (const line of lines) console.log(line);
}
