import { readFileSync } from "node:fs";

// The Bill Exploded. Since release 2026.10.23-1 the provider dashboard of the CodeDev AI hint shows
// about 40 times more input tokens a day, while learners click Hint as often as before. The hint
// service log shows the same hint request sent to the model again and again whenever the answer is
// not valid JSON, and the prompt log shows about 120k input tokens per call: the whole repository
// of the learner's submission is in the context.
//
// Fix hintFor and buildContext so that one hint request:
//   - sends a context with only the failing test's file first, then the files that test file
//     imports, in the order of its `imports` list. Imports that are not files of the repository
//     (packages such as "vitest") and repeated imports are ignored. A file is added only if the
//     tokens of the files added so far plus its own stay within budgetTokens; a file that does not
//     fit is skipped and the next one is tried. No other file of the repository is sent;
//   - after an invalid answer sends a repair request (repairMessages with that answer and the
//     errors of validateHint), at most MAX_REPAIRS of them, and then returns FALLBACK_HINT with
//     source "fallback" instead of asking again. source is "model" for a valid first answer and
//     "repair" for a valid answer to a repair request.
// Do not change the types, the helpers, validateHint or the test runner.

type RepoFile = { path: string; tokens: number; imports: string[] }; // tokens: counted by the provider's tokenizer
type Failure = { testFile: string; testName: string; output: string };
type Message = { role: "system" | "user"; content: string; tokens: number };
type Hint = { level: number; hint: string };
type HintResult = { source: "model" | "repair" | "fallback"; hint: Hint };
type Input = { budgetTokens: number; failure: Failure; files: RepoFile[]; script: string[] };

interface Llm {
    complete(messages: Message[]): Promise<string>;
}

const MAX_REPAIRS = 2;
const FALLBACK_HINT: Hint = {
    level: 1,
    hint: "Compare the expected and the actual output of the failing test line by line and start from the first line that differs.",
};
const SYSTEM_PROMPT =
    'You are the CodeDev hint assistant. Answer with one JSON object only: {"level": 1 | 2 | 3, "hint": "<at most 300 characters>"}. Never include the solution.';
const REPAIR_PROMPT =
    'Your previous answer did not match the schema {"level": 1 | 2 | 3, "hint": "<at most 300 characters>"}. Return only the corrected JSON object.';

const textTokens = (s: string): number => Math.ceil(s.length / 4);
const message = (role: "system" | "user", content: string, tokens = textTokens(content)): Message => ({ role, content, tokens });

function hintMessages(failure: Failure, context: RepoFile[]): Message[] {
    return [
        message("system", SYSTEM_PROMPT),
        ...context.map((f) => message("user", `<file ${f.path}>`, f.tokens)),
        message("user", `Failing test: ${failure.testName}\n${failure.output}`),
    ];
}

function repairMessages(previous: string, errors: string[]): Message[] {
    return [
        message("system", REPAIR_PROMPT),
        message("user", `Previous answer:\n${previous}\nErrors:\n${errors.map((e) => `- ${e}`).join("\n")}`),
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

// The failing test's file, then its imports, within the token budget.
function buildContext(failure: Failure, files: RepoFile[], budgetTokens: number): RepoFile[] {
    const byPath = new Map(files.map((f) => [f.path, f]));
    const test = byPath.get(failure.testFile);
    const wanted = test ? [test.path, ...test.imports] : [];
    const picked: RepoFile[] = [];
    const seen = new Set<string>();
    let used = 0;
    for (const path of wanted) {
        const file = byPath.get(path);
        if (!file || seen.has(path)) continue;
        seen.add(path);
        if (used + file.tokens > budgetTokens) break;
        picked.push(file);
        used += file.tokens;
    }
    return picked;
}

async function hintFor(input: Input, llm: Llm): Promise<HintResult> {
    let messages = hintMessages(input.failure, buildContext(input.failure, input.files, input.budgetTokens));
    for (let repairs = 0; ; repairs++) {
        const reply = await llm.complete(messages);
        const errors = validateHint(reply);
        if (errors.length === 0) return { source: repairs === 0 ? "model" : "repair", hint: JSON.parse(reply) as Hint };
        if (repairs === MAX_REPAIRS) return { source: "fallback", hint: FALLBACK_HINT };
        messages = repairMessages(reply, errors);
    }
}

// ---------------------------------------------------------------- test runner (do not change)
// The fake model answers with the next text of the script and repeats the last one when the script
// runs out (the same prompt keeps getting the same answer). Like the provider's spending cap, it
// refuses every call after the 50th. It adds up the tokens of every message it is sent.
const input: Input = JSON.parse(readFileSync(0, "utf8"));
const calls: { kind: string; tokens: number }[] = [];
const llm: Llm = {
    async complete(messages: Message[]): Promise<string> {
        if (calls.length >= 50) throw new Error("provider spending cap reached after 50 calls");
        const kind = messages[0]?.content === SYSTEM_PROMPT ? "hint" : messages[0]?.content === REPAIR_PROMPT ? "repair" : "other";
        calls.push({ kind, tokens: messages.reduce((sum, m) => sum + m.tokens, 0) });
        return input.script[Math.min(calls.length, input.script.length) - 1];
    },
};

function report(result: string): void {
    const context = buildContext(input.failure, input.files, input.budgetTokens);
    const runs: string[] = [];
    for (let i = 0; i < calls.length; ) {
        let j = i;
        while (j < calls.length && calls[j].kind === calls[i].kind) j++;
        runs.push(j - i > 1 ? `${calls[i].kind} x${j - i}` : calls[i].kind);
        i = j;
    }
    const paths = context.map((f) => f.path);
    const shown = paths.length > 8 ? [...paths.slice(0, 8), `... ${paths.length - 8} more`] : paths;
    console.log(`context: ${paths.length} files, ${context.reduce((s, f) => s + f.tokens, 0)} tokens: ${shown.join(", ") || "none"}`);
    console.log(`calls: ${calls.length} (${runs.join(", ") || "none"})`);
    console.log(`tokens sent: ${calls.reduce((s, c) => s + c.tokens, 0)}`);
    console.log(`result: ${result}`);
}

hintFor(input, llm).then(
    (r) => report(`${r.source}, level ${r.hint.level}: ${r.hint.hint}`),
    (e: unknown) => report(`error (${e instanceof Error ? e.message : String(e)})`),
);
