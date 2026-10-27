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

function checkToolCalls(input: GateInput): Decision[] {
    // For each proposed call, in order:
    // 1. find the tool by name
    // 2. parse the raw arguments as unknown and check them against the tool's parameters
    // 3. a needs-confirmation tool runs only when the learner confirmed that call id
    // 4. build new args from the checked values; userId comes from the session, never from the model
    return [];
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: one GateInput as JSON. Output: the list of decisions, in the order of the calls, as JSON.
const input: GateInput = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(checkToolCalls(input)));
