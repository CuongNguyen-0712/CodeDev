import { readFileSync } from "node:fs";

// Spot the AI Mistake: a hint that leaks the solution. The request sent to an AI coding assistant was:
//   "Add an output filter to the hint service. A generated hint must never contain the reference
//    solution of the challenge: if it does, return FALLBACK_HINT instead. Normal hints, including
//    ones that mention a function name, must go through unchanged."
// The assistant wrote filterHint below, the reviewer pasted a reference solution into a hint, saw it
// blocked, and the change was merged.
//
// Learners now report hints that contain the whole solution: with the variables renamed, with
// different spacing, with comments added, or split into two code blocks. Make filterHint compare
// code the way the team's policy says:
//   1. Remove comments: every "/* ... */" (to the first "*/", or to the end of the text when it is
//      not closed), then every "//" up to the end of its line.
//   2. Split into tokens: a word is a run of letters, digits, "_" and "$"; every other character
//      that is not whitespace is a token on its own. Whitespace only separates tokens.
//   3. A word that starts with a letter, "_" or "$" and is not in KEYWORDS becomes "ID" (so renamed
//      variables look the same). Keywords and words that start with a digit stay as they are.
//   4. Take every run of NGRAM consecutive tokens (an n-gram) of the reference and of the hint.
//      share = (distinct reference n-grams that also appear in the hint) / (distinct reference n-grams).
//   5. Return FALLBACK_HINT when share >= MAX_SHARED; otherwise return the hint unchanged.
// A hint that is empty or only whitespace (the model returned nothing) also gets FALLBACK_HINT.
// A reference with fewer than NGRAM tokens (no reference configured) blocks nothing.
// Do not change the policy constants or the test runner.

const FALLBACK_HINT = "Try your code on the smallest example from the task. What should it return, and what does it return?";

// ---------------------------------------------------------------- filter policy (do not change)
const NGRAM = 8;
const MAX_SHARED = 0.3;
const KEYWORDS = new Set([
    "async", "await", "break", "case", "catch", "class", "const", "continue", "default", "do", "else",
    "export", "extends", "false", "for", "function", "if", "import", "in", "instanceof", "interface",
    "let", "new", "null", "of", "return", "switch", "this", "throw", "true", "try", "type", "typeof",
    "undefined", "var", "void", "while",
]);

// ---------------------------------------------------------------- output filter
function tokens(source: string): string[] {
    const code = source;
    return (code.match(/[A-Za-z0-9_$]+|\S/g) ?? []).map((t) => (/^[A-Za-z_$]/.test(t) && !KEYWORDS.has(t) ? "ID" : t));
}

function ngrams(list: string[]): Set<string> {
    const out = new Set<string>();
    for (let i = 0; i + NGRAM <= list.length; i++) out.add(list.slice(i, i + NGRAM).join(" "));
    return out;
}

function filterHint(hint: string, reference: string): string {
    if (hint.trim() === "") return FALLBACK_HINT;
    const fromReference = ngrams(tokens(reference));
    if (fromReference.size === 0) return hint;
    const fromHint = ngrams(tokens(hint));
    let shared = 0;
    for (const gram of fromReference) if (fromHint.has(gram)) shared++;
    return shared / fromReference.size >= MAX_SHARED ? FALLBACK_HINT : hint;
}


// ---------------------------------------------------------------- test runner (do not change)
// Input: { "reference": "<reference solution of a challenge>", "hints": ["<hint from the model>", ...] }.
// Prints one line per hint: "allowed" (returned unchanged), "fallback" (FALLBACK_HINT) or "changed".
const input: { reference: string; hints: string[] } = JSON.parse(readFileSync(0, "utf8"));
input.hints.forEach((hint, i) => {
    const out = filterHint(hint, input.reference);
    console.log(`hint ${i + 1}: ${out === FALLBACK_HINT ? "fallback" : out === hint ? "allowed" : "changed"}`);
});
