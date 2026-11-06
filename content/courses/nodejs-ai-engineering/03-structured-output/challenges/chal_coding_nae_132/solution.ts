import { readFileSync } from "node:fs";

// CodeDev AI hints: the model is asked to answer with JSON for this schema:
//
//   { "hint": string (not blank, at most 400 characters),
//     "level": 1 | 2 | 3,
//     "references": string[] (at most 3 items),
//     "revealsSolution": boolean }          no other keys
//
// The old service did `JSON.parse(text.match(/\{[\s\S]*\}/)![0]) as HintAnswer`. One answer arrived
// wrapped in prose with "level": "2", the cast let it through, and the lesson page crashed.
//
// Fill parseHintAnswer(text) with pieces (some are wrong): strip one ```json fence around the whole
// output, parse, check the schema and return either the typed answer or every error with its path
// ("$.level: ...").
// The exact rules and messages are in the challenge description. No `as HintAnswer`, no libraries.
// Do not change the types or the test runner.

type HintAnswer = {
    hint: string;
    level: 1 | 2 | 3;
    references: string[];
    revealsSolution: boolean;
};

type ParseResult = { ok: true; value: HintAnswer } | { ok: false; errors: string[] };

const KEYS = ["hint", "level", "references", "revealsSolution"];
const FENCE = /^```(?:json)?[ \t]*\r?\n([\s\S]*)\r?\n```$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseHintAnswer(text: string): ParseResult {
    // @piece parse-json: Parse the output, unwrapping one json fence
    const trimmed = text.trim();
    const fenced = FENCE.exec(trimmed);
    let data: unknown;
    try {
        data = JSON.parse(fenced ? fenced[1] : trimmed);
    } catch {
        return { ok: false, errors: ["$: not valid JSON"] };
    }
    if (!isRecord(data)) return { ok: false, errors: ["$: expected an object"] };
    // @end

    const errors: string[] = [];
    // @piece unexpected-keys: Reject keys the schema does not have
    for (const key of Object.keys(data)) {
        if (!KEYS.includes(key)) errors.push(`$.${key}: unexpected key`);
    }
    // @end
    const has = (key: string) => Object.prototype.hasOwnProperty.call(data, key);

    // @piece hint: Check hint
    const hint = data.hint;
    if (!has("hint")) errors.push("$.hint: required");
    else if (typeof hint !== "string") errors.push("$.hint: expected a string");
    else if (hint.trim() === "") errors.push("$.hint: must not be blank");
    else if (hint.length > 400) errors.push("$.hint: longer than 400 characters");
    // @end

    // @piece level: Check level
    const level = data.level;
    if (!has("level")) errors.push("$.level: required");
    else if (level !== 1 && level !== 2 && level !== 3) errors.push("$.level: expected 1, 2 or 3");
    // @end

    // @piece references: Check references and collect them
    const references: string[] = [];
    const rawReferences = data.references;
    if (!has("references")) errors.push("$.references: required");
    else if (!Array.isArray(rawReferences)) errors.push("$.references: expected an array");
    else {
        if (rawReferences.length > 3) errors.push("$.references: more than 3 items");
        rawReferences.forEach((item: unknown, i: number) => {
            if (typeof item === "string") references.push(item);
            else errors.push(`$.references[${i}]: expected a string`);
        });
    }
    // @end

    // @piece reveals-solution: Check revealsSolution
    const revealsSolution = data.revealsSolution;
    if (!has("revealsSolution")) errors.push("$.revealsSolution: required");
    else if (typeof revealsSolution !== "boolean") errors.push("$.revealsSolution: expected a boolean");
    // @end

    // @piece result: Return every error or the typed answer
    // the type checks repeat here only to narrow the types for the compiler
    if (errors.length > 0 || typeof hint !== "string" || (level !== 1 && level !== 2 && level !== 3)
        || typeof revealsSolution !== "boolean") {
        return { ok: false, errors };
    }
    return { ok: true, value: { hint, level, references, revealsSolution } };
    // @end
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: a list of raw model outputs (strings). Output: the ParseResult for each one, as JSON.
const outputs: string[] = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(outputs.map((text) => parseHintAnswer(text))));
