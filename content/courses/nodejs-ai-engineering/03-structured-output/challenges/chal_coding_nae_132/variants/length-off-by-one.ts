import { readFileSync } from "node:fs";

// Known wrong answer: rejects a hint of exactly 400 characters.

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
    const trimmed = text.trim();
    const fenced = FENCE.exec(trimmed);
    let data: unknown;
    try {
        data = JSON.parse(fenced ? fenced[1] : trimmed);
    } catch {
        return { ok: false, errors: ["$: not valid JSON"] };
    }
    if (!isRecord(data)) return { ok: false, errors: ["$: expected an object"] };

    const errors: string[] = [];
    for (const key of Object.keys(data)) {
        if (!KEYS.includes(key)) errors.push(`$.${key}: unexpected key`);
    }
    const has = (key: string) => Object.prototype.hasOwnProperty.call(data, key);

    const hint = data.hint;
    if (!has("hint")) errors.push("$.hint: required");
    else if (typeof hint !== "string") errors.push("$.hint: expected a string");
    else if (hint.trim() === "") errors.push("$.hint: must not be blank");
    else if (hint.length >= 400) errors.push("$.hint: longer than 400 characters");

    const level = data.level;
    if (!has("level")) errors.push("$.level: required");
    else if (level !== 1 && level !== 2 && level !== 3) errors.push("$.level: expected 1, 2 or 3");

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

    const revealsSolution = data.revealsSolution;
    if (!has("revealsSolution")) errors.push("$.revealsSolution: required");
    else if (typeof revealsSolution !== "boolean") errors.push("$.revealsSolution: expected a boolean");

    // the type checks repeat here only to narrow the types for the compiler
    if (errors.length > 0 || typeof hint !== "string" || (level !== 1 && level !== 2 && level !== 3)
        || typeof revealsSolution !== "boolean") {
        return { ok: false, errors };
    }
    return { ok: true, value: { hint, level, references, revealsSolution } };
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: a list of raw model outputs (strings). Output: the ParseResult for each one, as JSON.
const outputs: string[] = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(outputs.map((text) => parseHintAnswer(text))));
