// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-nae-1-3",
    title: "Structured output: JSON Schema & validating before you use it",
    slug: { _type: "slug", current: "structured-output-json-schema-validation" },
    description:
        "A hint answer arrived as JSON wrapped in friendly prose, with \"level\": \"2\" as a string, and the lesson page crashed. Learn to treat model output as untrusted input: describe it with a JSON Schema, ask the provider for structured output where it helps, and still validate every answer on the server, with precise error paths, before anything is stored or sent to the page. Includes what to do with code fences, prose, extra keys and wrong types.",
    estimatedTime: 20,

    scenario: {
        role: "Backend developer, CodeDev learning platform",
        problem:
            "On Thursday the error tracker for https://app.codedev.test reports 312 crashes of the lesson page in one hour, all in the HintCard component, with the message unexpected hint level: \"2\". The API returned 200 for every one of these hint requests. The gateway's debug sample shows that the model started its answers with \"Sure! Here is a hint for you:\", wrapped the JSON in a code fence, and wrote the level as a string. The hint service had extracted the JSON with a regular expression and cast it to HintAnswer.",
    },

    content: [
        h2("1. The incident: a 200 that crashed the page"),
        p("The prompt asks the model to answer with JSON, and for weeks it did. The hint service trusted that:"),
        code("typescript", `
// src/hints/hint.service.ts - the version that shipped
type HintAnswer = { hint: string; level: 1 | 2 | 3; references: string[]; revealsSolution: boolean };

const result = await this.llm.complete({ feature: "hint", promptRef: rendered.ref, /* ... */ });
const json = result.text.match(/\\{[\\s\\S]*\\}/)![0];     // "the model sometimes adds text around the JSON"
return JSON.parse(json) as HintAnswer;                      // sent to the lesson page as is`, "hint.service.ts"),
        p("On Thursday a provider-side model update changed the style of the answers. This is one of them, as the gateway recorded it:"),
        code("text", `
Sure! Here is a hint for you:
\`\`\`json
{
  "hint": "Check where your loop starts: which index does the first element of an array have?",
  "level": "2",
  "references": "Arrays, lesson 3",
  "revealsSolution": false
}
\`\`\`
Good luck!`, "result.text"),
        p("The regular expression found the braces, `JSON.parse` succeeded, and the cast told the compiler everything was fine. The page then received `level: \"2\"` and `references: \"Arrays, lesson 3\"`:"),
        code("tsx", `
function LevelBadge({ level }: { level: 1 | 2 | 3 }) {
    switch (level) {
        case 1: return <span className="badge">Nudge</span>;
        case 2: return <span className="badge">Hint</span>;
        case 3: return <span className="badge">Walkthrough</span>;
        default: return assertNever(level);    // throws: unexpected hint level: "2"
    }
}
// ...and two lines later: hint.references.map(...) - a string has no .map`, "HintCard.tsx"),
        p("Every request returned 200, so the API dashboards were green. The failure only existed in the browser, three layers away from the line that caused it."),

        h2("2. Read the evidence"),
        p("Line up what each layer believed. The provider returned a normal completion: `stopReason: \"end\"`, a few hundred tokens. The gateway logged `outcome: \"ok\"`. The service returned 200. The page crashed. Nobody in the chain **checked** the answer; each layer assumed the one before it had."),
        p("Reproduce the cast in a Node REPL with the recorded text, and look at what the type promised:"),
        code("typescript", `
const answer = JSON.parse(recorded.match(/\\{[\\s\\S]*\\}/)![0]) as HintAnswer;
typeof answer.level        // "string"  - the type says 1 | 2 | 3
answer.level === 2         // false
answer.level + 1           // "21"
Array.isArray(answer.references)   // false`, "node REPL"),
        p("The regular expression is a second, quieter bug. It takes everything from the first `{` to the last `}`. A friendly sentence such as \"Remember that {} creates an empty object\" before the JSON, or a hint that itself contains a code example with braces after it, moves those positions and produces either invalid JSON or, worse, valid JSON that is not the answer."),

        h2("3. Core idea: model output is untrusted input"),
        p("You already know this rule from APIs: a request body is checked before the service uses it (in NestJS, a DTO with a `ValidationPipe`). A model's answer deserves the same treatment, for the same reason: it comes from outside your code and can have any shape. OWASP lists using model output without checking it as one of the main risks of LLM applications (improper output handling)."),
        h3("Write the contract down as a JSON Schema"),
        p("The shape the hint feature needs, as a JSON Schema. It is short, it is reviewable, and the same document can be sent to the provider and kept next to the prompt version that asks for it:"),
        code("json", `
{
  "type": "object",
  "additionalProperties": false,
  "required": ["hint", "level", "references", "revealsSolution"],
  "properties": {
    "hint": { "type": "string", "minLength": 1, "maxLength": 400 },
    "level": { "enum": [1, 2, 3] },
    "references": { "type": "array", "items": { "type": "string" }, "maxItems": 3 },
    "revealsSolution": { "type": "boolean" }
  }
}`, "hint-answer.schema.json"),
        bullets([
            "**`additionalProperties: false`** rejects keys you did not ask for. The day the model adds `\"solution\": \"...\"` to be helpful, the answer is rejected instead of being forwarded to the page.",
            "**`enum: [1, 2, 3]`** accepts the numbers only. The string `\"2\"` is a different JSON value and fails, which is exactly the incident.",
            "**`maxLength` and `maxItems`** are product limits: the hint card has room for 400 characters and three links.",
            "**The schema belongs to the prompt version.** Changing the schema changes what the prompt asks for, so it is a new prompt version (lesson 2).",
        ]),
        h3("Structured output helps, validation decides"),
        p("Many providers can constrain a model to produce JSON that follows a schema you send with the request (often called structured output or JSON mode). Use it when your provider and model support it: invalid answers become much rarer. But keep the server-side validator, because:"),
        bullets([
            "**Answers can be cut off.** An answer that hits the output token limit stops in the middle of a string, whatever the schema says (`stopReason: \"max_tokens\"`).",
            "**Support differs.** Which schema keywords are enforced (`maxLength`? `maxItems`?) differs between providers and models, and a fallback model (lesson 5) may not support the feature at all. Check the provider's current docs; do not assume.",
            "**Refusals and errors have other shapes.** A model that declines to answer may return text or a refusal field instead of your object.",
            "**Your limits are yours.** A string that is valid JSON can still be 4,000 characters long or blank.",
        ]),
        h3("Strict, not lenient"),
        p("It is tempting to make the parser forgiving: dig the JSON out of prose, turn `\"2\"` into `2`, drop unknown keys. Each of these hides that the contract is broken, and the next variation will not be one you anticipated. The rules of this lesson:"),
        bullets([
            "**Strip one fence, only around the whole answer.** A first line of three backticks (optionally followed by `json`) and a last line of three backticks around the entire output is a formatting habit and is safe to remove. Prose before or after the fence means the model ignored the instruction: reject.",
            "**Do not search for JSON inside prose.** Which block is the answer when the hint itself contains a code example in a fence? You cannot know, so do not guess.",
            "**Collect every error, with its path.** `$.level: expected 1, 2 or 3` and `$.references: expected an array` in one log line tell you what changed in the model's behaviour; a single `invalid output` does not.",
            "**Repair is a separate, counted decision.** Retrying with the error messages, or a deliberate fix-up, is lesson 4. It happens after validation, is limited, and shows up in metrics.",
        ]),
        h3("When not to"),
        bullets([
            "**Free text needs no JSON.** If the feature shows a paragraph to the user and nothing else reads it, ask for text and enforce a length limit and safe rendering (as text, never as HTML). JSON is for answers your code acts on.",
            "**Use the validator your project already has.** In a real code base, generate the check from the schema with a library such as Ajv, or describe it once with zod or class-validator. Configure it strictly: no type coercion and no unknown keys (with class-validator, `whitelist` plus `forbidNonWhitelisted`, and check that implicit conversion is off). The exercise below is hand-written because the code runner has no libraries, and because writing one once shows what the library does for you.",
        ]),

        challenge("chal_quiz_nae_131"),

        h2("4. Worked example: a validator for review comments"),
        p("The gateway also serves a `review` feature that comments on a learner's submission: `{ line, severity, message }`. A hand-written validator for that shape shows the pattern: parse as `unknown`, check the root, report unknown keys, then check each field, collecting errors with paths:"),
        code("typescript", `
type ReviewComment = { line: number; severity: "info" | "warning"; message: string };
type Parsed<T> = { ok: true; value: T } | { ok: false; errors: string[] };

const isRecord = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null && !Array.isArray(v);

function parseReviewComment(text: string): Parsed<ReviewComment> {
    let data: unknown;
    try { data = JSON.parse(text); } catch { return { ok: false, errors: ["$: not valid JSON"] }; }
    if (!isRecord(data)) return { ok: false, errors: ["$: expected an object"] };

    const errors: string[] = [];
    for (const key of Object.keys(data)) {
        if (!["line", "severity", "message"].includes(key)) errors.push(\`$.\${key}: unexpected key\`);
    }
    const { line, severity, message } = data;
    if (typeof line !== "number" || !Number.isInteger(line) || line < 1) errors.push("$.line: expected an integer >= 1");
    if (severity !== "info" && severity !== "warning") errors.push("$.severity: expected info or warning");
    if (typeof message !== "string" || message.length > 200) errors.push("$.message: expected a string of at most 200 characters");

    if (errors.length > 0 || typeof line !== "number" || typeof message !== "string"
        || (severity !== "info" && severity !== "warning")) return { ok: false, errors };
    return { ok: true, value: { line, severity, message } };      // a new object: nothing else gets through
}`, "src/review/parse-review-comment.ts"),
        p("Two details matter more than they look. The value is checked as `unknown`, so the compiler refuses every use until a check has narrowed it; the repeated checks in the last `if` are there only to narrow the types for the compiler, not because the logic needs them. And the result is a **new** object built from checked fields, so nothing the model added can travel further."),
        p("In the hint service, the validator sits between the gateway and everything else. A failure is not an exception that crashes the request; it is a typed outcome that is logged and counted:"),
        code("typescript", `
// src/hints/hint.service.ts
const result = await this.llm.complete({ feature: "hint", promptRef: rendered.ref, /* ... */ });
const parsed = parseHintAnswer(result.text);
if (!parsed.ok) {
    // paths only: the learner's code and the model's text stay out of the normal log
    this.logger.warn({ event: "llm.output_invalid", promptRef: rendered.ref, stopReason: result.stopReason, errors: parsed.errors });
    this.metrics.increment("hint_output_invalid_total", { promptRef: rendered.ref });
    return { ok: false, error: "hint_unavailable" };     // lesson 4: retry once with the errors
}
if (parsed.value.revealsSolution) return { ok: false, error: "hint_unavailable" };   // policy, lesson 10
return { ok: true, hint: parsed.value };`, "hint.service.ts"),
        p("Notice the split of responsibilities: the validator only answers \"is this the shape we agreed on?\". `revealsSolution: true` is a valid answer, and what the product does with it is the service's decision."),

        h2("5. Your turn: validate the hint answer"),
        p("Write `parseHintAnswer(text)` for the hint schema: strip a fence that wraps the whole answer, reject prose, reject extra keys and wrong types, and return either the typed answer or every error with its path. The tests replay recorded outputs: the incident's answer, fences with CRLF line endings, a hint that contains its own code example, a truncated answer and a batch of 150 recordings."),
        challenge("chal_coding_nae_132"),

        h2("6. How to verify"),
        bullets([
            "**Recorded fixtures as tests.** Every broken answer you meet in production (redacted) becomes a fixture with its expected errors. The incident's text is the first one. These tests run in milliseconds with no model.",
            "**The page never sees an unchecked value.** In DevTools, **Network** tab, the response of `POST /challenges/:id/hints` is either the four checked fields or `{ \"error\": \"hint_unavailable\" }`, nothing in between. A contract test on the API asserts the same.",
            "**A metric per prompt version.** `hint_output_invalid_total` by `promptRef`, next to the call count. A jump after a provider model update or a prompt change shows up within minutes, while the page keeps working.",
            "**Error paths in logs.** Group `llm.output_invalid` lines by their error strings: \"$.level: expected 1, 2 or 3\" appearing 300 times in an hour tells you exactly which instruction the model stopped following.",
        ]),

        h2("7. Common mistakes"),
        bullets([
            "**`JSON.parse(text) as HintAnswer`.** The cast checks nothing. Spot it by searching for `as` next to `JSON.parse`, and for any value from the gateway that is returned without passing a parser.",
            "**Extracting `{...}` with a regular expression.** It works until prose or a code example contains a brace. Spot it by searching for `match(/\\{` near model output.",
            "**Silent coercion.** `Number(level)` or a validation library with implicit conversion turns `\"2\"` into `2` and hides that the model changed. Spot it when the invalid-output metric stays at zero after a model update that you know changed the output.",
            "**Checking only that keys exist.** `\"level\" in answer` passes `\"2\"`, `null` and `[]`. Spot it in tests: a fixture with the right keys and wrong types must fail.",
            "**Skipping validation because structured output is on.** Truncated and refused answers still arrive. Spot it by looking for `stopReason: \"max_tokens\"` in the logs of a feature that has no validator.",
        ]),

        h2("8. Summary"),
        numbered([
            "Model output is untrusted input: describe the shape with a JSON Schema (no extra keys, exact types, product limits) and validate every answer on the server before it is stored or sent to the page.",
            "Provider structured output makes valid answers more likely, but truncation, refusals, fallback models and differing keyword support mean the server-side validator still decides.",
            "Be strict: strip only a fence around the whole answer, never dig JSON out of prose, never coerce types silently, and report every error with its path so logs and metrics show what changed.",
        ]),

        h2("Sources"),
        bullets([
            "Understanding JSON Schema - json-schema.org/understanding-json-schema (object properties, additionalProperties, enum, string length, array items)",
            "OWASP Top 10 for Large Language Model Applications - owasp.org/www-project-top-10-for-large-language-model-applications/ (improper output handling)",
            "Your provider's documentation on structured output or JSON mode: which models support it and which schema keywords are enforced (check the current version)",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Write the hint schema as a zod schema or an Ajv-compiled JSON Schema in a project of your own, configure it strictly (no coercion, no unknown keys) and run it on the same recorded outputs as the exercise. Compare its error messages with yours, and check whether your provider's structured output feature enforces maxLength and maxItems for the model you use."),
    ],
});
