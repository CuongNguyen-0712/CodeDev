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
    // [ ] Parse the output, unwrapping one json fence

    const errors: string[] = [];
    // [ ] Reject keys the schema does not have
    const has = (key: string) => Object.prototype.hasOwnProperty.call(data, key);

    // [ ] Check hint

    // [ ] Check level

    // [ ] Check references and collect them

    // [ ] Check revealsSolution

    // [ ] Return every error or the typed answer
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: a list of raw model outputs (strings). Output: the ParseResult for each one, as JSON.
const outputs: string[] = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(outputs.map((text) => parseHintAnswer(text))));
