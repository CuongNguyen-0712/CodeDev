// Harness: runs the learner's getHint against a scripted fake LLM. No network, no real model.
// input.scenarios is a list of { script, maxAttempts? }. Each script entry answers one llm.complete
// call, in order (the last one repeats if the model is called more often):
//   { text, usage: { inputTokens, outputTokens } }   llm.complete resolves with { text, usage }
//   { error: "message" }                             llm.complete rejects with new Error(message)
// The harness builds the request, the validator (the lesson 3 hint contract) and the static
// fallback hint, and passes them in. maxAttempts is passed only when the scenario has one.
// Output, one entry per scenario: { result, calls } where result is what getHint returned
// (or "threw <name>: <message>") and calls describes the messages of every llm.complete call:
//   "original"                the request's messages, unchanged
//   "repair of attempt N"     request messages + answer N (assistant) + repairMessage(errors of N) (user)
//   "unexpected messages (K)" anything else (K = number of messages sent)
//   "wrong model, temperature or maxTokens"
const __HINT_REQUEST = {
    model: "model-large",
    temperature: 0,
    maxTokens: 300,
    messages: [
        {
            role: "system",
            content: "You are the CodeDev Hint Service (template hint.v3). Reply with one JSON object only: {\"level\": 1|2|3, \"hint\": string, \"references\": string[]}. Never include the solution.",
        },
        {
            role: "user",
            content: "Level: 2\nChallenge: chal_coding_nae_132\nFailing test: rejects extra properties\nLearner code:\nfunction parseHint(text) {\n  return { ok: true, value: JSON.parse(text) };\n}",
        },
    ],
};

const __FALLBACK_HINT = {
    level: 2,
    hint: "Compare the object your function returns with the contract in the challenge description. Which property does the failing test send that the contract does not list?",
    references: ["lesson-nae-1-3"],
};

// The lesson 3 contract: { level: 1|2|3, hint: 1-400 chars after trim, references: lesson ids }.
function __validateHint(text) {
    if (typeof text !== "string") return { ok: false, errors: ["response: not valid JSON"] };
    let body = text.trim();
    const fence = body.match(/^```(?:json)?[ \t]*\n([\s\S]*?)\n?```$/);
    if (fence) body = fence[1];
    let value;
    try {
        value = JSON.parse(body);
    } catch {
        return { ok: false, errors: ["response: not valid JSON"] };
    }
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return { ok: false, errors: ["response: must be a JSON object"] };
    }
    const errors = [];
    if (![1, 2, 3].includes(value.level)) errors.push("level: must be 1, 2 or 3");
    const hint = typeof value.hint === "string" ? value.hint.trim() : "";
    if (hint.length < 1 || hint.length > 400) errors.push("hint: must be a string of 1-400 characters");
    if (!Array.isArray(value.references) || !value.references.every((r) => typeof r === "string" && /^lesson-[a-z0-9-]+$/.test(r))) {
        errors.push("references: must be an array of lesson ids");
    }
    for (const key of Object.keys(value)) {
        if (!["level", "hint", "references"].includes(key)) errors.push(key + ": unexpected property");
    }
    if (errors.length > 0) return { ok: false, errors };
    return { ok: true, value: { level: value.level, hint, references: value.references.slice() } };
}

function __expectedRepair(errors) {
    return "Your previous answer did not match the hint schema:\n" + errors.map((e) => "- " + e).join("\n") + "\nReturn only the corrected JSON object.";
}

function __sameMessages(actual, expected) {
    return Array.isArray(actual) && actual.length === expected.length &&
        actual.every((m, i) => m && m.role === expected[i].role && m.content === expected[i].content);
}

async function __harness(input) {
    const results = [];
    for (const scenario of input.scenarios) {
        const script = scenario.script;
        const answered = []; // text of each call that resolved, by call index
        const calls = [];

        const llm = {
            complete: async (req) => {
                const index = calls.length;
                const step = script[Math.min(index, script.length - 1)];
                let label;
                if (!req || req.model !== __HINT_REQUEST.model || req.temperature !== __HINT_REQUEST.temperature || req.maxTokens !== __HINT_REQUEST.maxTokens) {
                    label = "wrong model, temperature or maxTokens";
                } else if (__sameMessages(req.messages, __HINT_REQUEST.messages)) {
                    label = "original";
                } else {
                    label = "unexpected messages (" + (Array.isArray(req.messages) ? req.messages.length : 0) + ")";
                    for (let j = answered.length - 1; j >= 0; j--) {
                        if (answered[j] === undefined) continue;
                        const expected = __HINT_REQUEST.messages.concat([
                            { role: "assistant", content: answered[j] },
                            { role: "user", content: __expectedRepair(__validateHint(answered[j]).errors || []) },
                        ]);
                        if (__sameMessages(req.messages, expected)) {
                            label = "repair of attempt " + (j + 1);
                            break;
                        }
                    }
                }
                calls.push(label);
                if (step.error !== undefined) {
                    answered.push(undefined);
                    throw new Error(step.error);
                }
                answered.push(step.text);
                return { text: step.text, usage: { inputTokens: step.usage.inputTokens, outputTokens: step.usage.outputTokens } };
            },
        };

        // a fresh copy per scenario, so a learner who mutates the request cannot affect the next one
        const request = JSON.parse(JSON.stringify(__HINT_REQUEST));
        const options = { validate: __validateHint, fallbackHint: JSON.parse(JSON.stringify(__FALLBACK_HINT)) };
        if (scenario.maxAttempts !== undefined) options.maxAttempts = scenario.maxAttempts;

        let result;
        try {
            result = await getHint(llm, request, options);
        } catch (error) {
            result = "threw " + (error && error.name) + ": " + (error && error.message);
        }
        results.push({ result, calls });
    }
    return results;
}
