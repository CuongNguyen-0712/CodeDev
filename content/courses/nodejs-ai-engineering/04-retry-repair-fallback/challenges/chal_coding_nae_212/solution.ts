import { readFileSync } from "node:fs";

// Retry, repair & fallback for the CodeDev AI hint.
//
// getHint(req, llm, clock, opts) asks the model for a hint and must ALWAYS return a hint the
// lesson page can render, while counting what it spent:
//
// 1. Send hintMessages(req) with llm.complete(messages).
// 2. If complete() throws an LlmError with a TRANSIENT status (429, 502, 503, 504) and fewer than
//    opts.maxRetries retries were used in this getHint call, wait with
//      await clock.sleep(opts.baseDelayMs * 2 ** (n - 1))
//    where n is the number of this retry (1, 2, 3 ... counted over the whole getHint call),
//    then send the SAME messages again. Any other error (400, 401, 403, 404, ...), or a transient
//    error when no retry is left, ends with the fallback, reason "error <status>".
// 3. If a reply comes back, check it with validateHint(reply.text):
//    - no errors: return the parsed hint, source "model" (answer to the first request) or
//      "repair" (answer to a repair request);
//    - errors, and fewer than opts.maxRepairs repairs sent: send ONE repair request,
//      repairMessages(reply.text, errors) - only those two messages, not the original
//      conversation again - and check its reply the same way;
//    - errors and no repair left: fallback, reason "invalid output".
// 4. The fallback is FALLBACK_HINT with source "fallback" and the reason; reason is null otherwise.
// 5. calls = every call to llm.complete, including the ones that threw.
//    inputTokens / outputTokens = the sums of reply.usage over the replies that came back.
//
// Use only llm and clock: the tests pass a scripted fake model and a fake clock.
// Do not change the types, the helpers, validateHint or the test runner.

type Message = { role: "system" | "user"; content: string };
type Usage = { inputTokens: number; outputTokens: number };
type Reply = { text: string; usage: Usage };
type Hint = { level: number; hint: string };
type HintRequest = { challenge: string; failingTest: string; code: string };
type Options = { maxRetries: number; maxRepairs: number; baseDelayMs: number };
type HintResult = {
    source: "model" | "repair" | "fallback";
    hint: Hint;
    reason: string | null;
    calls: number;
    inputTokens: number;
    outputTokens: number;
};

interface Llm {
    complete(messages: Message[]): Promise<Reply>;
}
interface Clock {
    now(): number;
    sleep(ms: number): Promise<void>;
}

class LlmError extends Error {
    status: number;
    constructor(status: number) {
        super(`provider answered ${status}`);
        this.status = status;
    }
}

const TRANSIENT = [429, 502, 503, 504];

const SYSTEM_PROMPT =
    'You are the CodeDev hint assistant. Answer with one JSON object only: {"level": 1 | 2 | 3, "hint": "<at most 300 characters>"}. Never include the solution.';
const REPAIR_PROMPT =
    'Your previous answer did not match the schema {"level": 1 | 2 | 3, "hint": "<at most 300 characters>"}. Return only the corrected JSON object.';
const FALLBACK_HINT: Hint = {
    level: 1,
    hint: "Compare the expected and the actual output of the failing test line by line and start from the first line that differs.",
};

function hintMessages(req: HintRequest): Message[] {
    return [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Challenge: ${req.challenge}\nFailing test: ${req.failingTest}\nLearner code:\n${req.code}` },
    ];
}

function repairMessages(previous: string, errors: string[]): Message[] {
    return [
        { role: "system", content: REPAIR_PROMPT },
        { role: "user", content: `Previous answer:\n${previous}\nErrors:\n${errors.map((e) => `- ${e}`).join("\n")}` },
    ];
}

/** A short version of the hint schema (lesson 1.3 has the full one): returns the list of errors, empty when the text is a valid hint. */
function validateHint(text: string): string[] {
    let value: unknown;
    try {
        value = JSON.parse(text);
    } catch {
        return ["not valid JSON"];
    }
    if (typeof value !== "object" || value === null || Array.isArray(value)) return ["must be a JSON object"];
    const v = value as Record<string, unknown>;
    const errors: string[] = [];
    if (v.level !== 1 && v.level !== 2 && v.level !== 3) errors.push("level: must be 1, 2 or 3");
    if (typeof v.hint !== "string" || v.hint.trim() === "") errors.push("hint: must be a non-empty string");
    else if (v.hint.length > 300) errors.push("hint: must be at most 300 characters");
    for (const key of Object.keys(v)) if (key !== "level" && key !== "hint") errors.push(`${key}: unknown property`);
    return errors;
}

async function getHint(req: HintRequest, llm: Llm, clock: Clock, opts: Options): Promise<HintResult> {
    let messages = hintMessages(req);
    let repairs = 0;
    let retries = 0;
    let calls = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    const fallback = (reason: string): HintResult => ({ source: "fallback", hint: FALLBACK_HINT, reason, calls, inputTokens, outputTokens });

    for (;;) {
        let reply: Reply;
        calls++;
        try {
            reply = await llm.complete(messages);
        } catch (error) {
            if (!(error instanceof LlmError)) return fallback("error");
            if (!TRANSIENT.includes(error.status) || retries >= opts.maxRetries) return fallback(`error ${error.status}`);
            retries++;
            await clock.sleep(opts.baseDelayMs * 2 ** (retries - 1));
            continue;
        }
        inputTokens += reply.usage.inputTokens;
        outputTokens += reply.usage.outputTokens;
        const errors = validateHint(reply.text);
        if (errors.length === 0) {
            return { source: repairs === 0 ? "model" : "repair", hint: JSON.parse(reply.text) as Hint, reason: null, calls, inputTokens, outputTokens };
        }
        if (repairs >= opts.maxRepairs) return fallback("invalid output");
        repairs++;
        messages = repairMessages(reply.text, errors);
    }
}

// ---------------------------------------------------------------- test runner (do not change)
// The fake model replays a script: { "status": 503 } throws LlmError(503), { "text": "..." } answers
// with that text. It counts 1 token per 4 characters (rounded up) of each message and of the answer.
// The fake clock only moves when someone sleeps on it.
type Step = { status?: number; text?: string };
type Input = { options: Options; request: HintRequest; script: Step[] };

const input: Input = JSON.parse(readFileSync(0, "utf8"));
const tokens = (s: string): number => Math.ceil(s.length / 4);
let time = 0;
const clock: Clock = {
    now: () => time,
    sleep: async (ms: number) => {
        time += ms;
    },
};
const log: string[] = [];
let next = 0;
const llm: Llm = {
    async complete(messages: Message[]): Promise<Reply> {
        const kind = messages[0]?.content === SYSTEM_PROMPT ? "hint" : messages[0]?.content === REPAIR_PROMPT ? "repair" : "other";
        const sent = messages.reduce((sum, m) => sum + tokens(m.content), 0);
        const head = `call ${log.length + 1} at ${time}ms: ${kind}, ${messages.length} messages, ${sent} tokens`;
        const step = input.script[next++];
        if (!step) {
            log.push(`${head} -> script exhausted`);
            throw new Error("script exhausted");
        }
        if (step.status !== undefined) {
            log.push(`${head} -> ${step.status}`);
            throw new LlmError(step.status);
        }
        const text = step.text ?? "";
        const errors = validateHint(text);
        log.push(`${head} -> ${errors.length ? `invalid (${errors.join("; ")})` : "valid"}`);
        return { text, usage: { inputTokens: sent, outputTokens: tokens(text) } };
    },
};

getHint(input.request, llm, clock, input.options).then((r) => {
    console.log(log.join("\n"));
    console.log(
        `result: ${r.source}${r.reason ? ` (${r.reason})` : ""}, calls ${r.calls}, tokens in ${r.inputTokens} out ${r.outputTokens}, waited ${clock.now()}ms`,
    );
    console.log(`hint (level ${r.hint.level}): ${r.hint.hint}`);
});
