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
// Write parseHintAnswer(text): strip one ```json fence around the whole output, parse, check the
// schema and return either the typed answer or every error with its path ("$.level: ...").
// The exact rules and messages are in the challenge description. No `as HintAnswer`, no libraries.
// Do not change the types or the test runner.

type HintAnswer = {
    hint: string;
    level: 1 | 2 | 3;
    references: string[];
    revealsSolution: boolean;
};

type ParseResult = { ok: true; value: HintAnswer } | { ok: false; errors: string[] };

function parseHintAnswer(text: string): ParseResult {
    return { ok: false, errors: [] };
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: a list of raw model outputs (strings). Output: the ParseResult for each one, as JSON.
const outputs: string[] = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(outputs.map((text) => parseHintAnswer(text))));
