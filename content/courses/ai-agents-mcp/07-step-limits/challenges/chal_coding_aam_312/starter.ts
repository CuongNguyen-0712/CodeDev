import { readFileSync } from "node:fs";

// CodeDev support agent: step limits and stop conditions.
//
// The support agent answers learners' questions about orders, enrollments and lessons. Its loop
// (runAgent below) asks the model for the next turn, runs the tool the model asked for, appends the
// result to the transcript and asks again, until the model gives a final answer. It has no other way
// to stop: a model that keeps calling tools keeps the loop running.
//
// Add these stop conditions. A step is one call to model.next(); `steps` counts them.
//   1. max_steps        before each model call: if `steps` already equals limits.maxSteps, stop.
//   2. final            a turn { final: text } with a non-empty text (after trim): stop with that answer.
//   3. no_final_answer  any other turn that is not a valid tool call - an empty final, a missing or
//                       non-string final, a tool call without a non-empty string name - is not an
//                       answer: stop.
//   4. repeated_call    the same tool call (same name and same canonical args: object keys sorted at
//                       every level, so {"a":1,"b":2} equals {"b":2,"a":1}) proposed limits.maxSameCall
//                       times in a row: stop when that proposal arrives, without running the tool.
//   5. no_progress      progress means the tool result is a text not seen before in this run. After
//                       running a tool, if the last limits.maxNoProgress tool results in a row were all
//                       already seen, stop.
// Every stop returns the reason, the step count, the answer (null unless the reason is "final") and
// the partial result: every distinct tool result of the run, in the order they first appeared.
// Do not change the tools, the fake model or the test runner.

type ToolCall = { name: string; args: unknown };
type ModelTurn = { toolCall: ToolCall } | { final: string };
type Message = { role: "user" | "assistant" | "tool"; content: string };
type Model = { next(transcript: readonly Message[]): unknown }; // parsed model output: check its shape

type Limits = { maxSteps: number; maxSameCall: number; maxNoProgress: number };
type StopReason = "final" | "max_steps" | "repeated_call" | "no_progress" | "no_final_answer";
type RunResult = { reason: StopReason; steps: number; answer: string | null; partial: string[] };

function runAgent(question: string, model: Model, limits: Limits): RunResult {
    const transcript: Message[] = [{ role: "user", content: question }];
    let steps = 0;

    // TODO: stop conditions. As written, the loop only ends when the model gives a final answer.
    for (;;) {
        const turn = model.next(transcript) as ModelTurn;
        steps++;

        if ("final" in turn) return { reason: "final", steps, answer: turn.final, partial: [] };

        const call = turn.toolCall;
        transcript.push({ role: "assistant", content: `call ${call.name} ${JSON.stringify(call.args)}` });
        transcript.push({ role: "tool", content: callTool(call) });
    }
}

// ---------------------------------------------------------------- tools (do not change)
// Read-only support tools. They never throw: a problem comes back as a text starting with "error:",
// which the model reads like any other result.
type Args = Record<string, unknown>;
const COURSES = ["ts-foundations", "python-data", "sql-basics", "react-hooks", "node-streams"];

const TOOLS: Record<string, (args: Args) => string> = {
    get_order(args) {
        const id = String(args.orderId ?? "");
        const m = /^o-(\d+)$/.exec(id);
        if (!m) return `error: order ${id || "(missing orderId)"} not found`;
        const n = Number(m[1]);
        return `order ${id}: ${COURSES[n % COURSES.length]}, ${n % 4 === 0 ? "refunded" : "paid"}`;
    },
    get_enrollment(args) {
        const user = String(args.userId ?? "");
        const course = String(args.courseId ?? "");
        if (!user || !COURSES.includes(course)) return `error: no enrollment for ${user || "?"} in ${course || "?"}`;
        const done = (user.length * 7 + course.length) % 13;
        return `enrollment ${user}/${course}: ${done}/12 lessons done`;
    },
    search_lessons(args) {
        const course = String(args.courseId ?? "");
        const query = String(args.query ?? "");
        if (!COURSES.includes(course)) return `error: unknown course ${course || "?"}`;
        return `search ${course} "${query}": ${query.length % 5} lessons`;
    },
};

function callTool(call: ToolCall): string {
    const tool = TOOLS[call.name];
    if (!tool) return `error: unknown tool ${call.name}`;
    const args = call.args !== null && typeof call.args === "object" ? (call.args as Args) : {};
    return tool(args);
}

// ---------------------------------------------------------------- fake model + test runner (do not change)
// The fake model replays a script: one turn per call. When the script runs out it keeps returning its
// last turn, like a model that is stuck. The harness gives up after 1000 calls in one run.
function scriptedModel(script: unknown[]): Model {
    let calls = 0;
    return {
        next() {
            calls++;
            if (calls > 1000) throw new Error("fake model called more than 1000 times in one run");
            return script[Math.min(calls, script.length) - 1] ?? { final: "" };
        },
    };
}

type Input = { limits: Limits; runs: Array<{ name: string; question: string; script: unknown[] }> };
const input: Input = JSON.parse(readFileSync(0, "utf8"));
const output = input.runs.map((run) => {
    try {
        return { run: run.name, ...runAgent(run.question, scriptedModel(run.script), input.limits) };
    } catch (error) {
        return { run: run.name, error: (error as Error).message };
    }
});
console.log(JSON.stringify(output, null, 1));
