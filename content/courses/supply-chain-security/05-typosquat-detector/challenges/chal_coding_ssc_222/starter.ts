import { readFileSync } from "node:fs";

// Typosquat detector for CodeDev's dependency review. Before a PR that adds dependencies can merge,
// every new package name is compared with a list of popular package names: a name one or two edits
// away from a popular one ("reqeust", "crossenv", "L0dash.js") is a typosquat or a slopsquat
// until a human says otherwise.
//
// detectTyposquats(popular, candidates) returns one result per candidate: { name, nearest, distance, verdict }.
//
//   invalid    the candidate is "", longer than 214 characters, or contains a character other than
//              A-Z a-z 0-9 @ / . _ ~ -                          nearest null, distance null
//   exact      the candidate is exactly (same characters, same case) one of the popular names
//                                                               nearest = the candidate, distance 0
//   otherwise  normalize the candidate and every popular name, and compute the distance between the
//              normalized forms. nearest = the popular name (as written in the list) with the
//              smallest distance; on a tie, the popular name that sorts first (< and >).
//              lookalike  when distance <= threshold(length of the normalized candidate)
//              clear      otherwise
//
// normalize(name), in this order:
//   1. lowercase
//   2. a scoped name "@scope/rest" becomes "rest" (only when it starts with "@" and contains "/")
//   3. every "_" and "." becomes "-"
//   4. every "1" becomes "l" and every "0" becomes "o"
//   5. remove a leading "js-", then a trailing "-js", each only when something is left after it
//
// distance(a, b): Damerau-Levenshtein distance in its restricted form (optimal string alignment):
//   the fewest single-character inserts, deletes, substitutions and swaps of two adjacent
//   characters that turn a into b, each costing 1, where no character is edited twice.
//
// threshold(n): n <= 3 -> 0, 4 <= n <= 7 -> 1, n >= 8 -> 2.
//
// Order of the results: by verdict (lookalike, invalid, clear, exact), then by distance (smallest
// first), then by name (< and >); equal results keep their input order.
// Do not change the types or the test runner.

type Verdict = "lookalike" | "invalid" | "clear" | "exact";

type Result = { name: string; nearest: string | null; distance: number | null; verdict: Verdict };

function normalize(name: string): string {
    return name;
}

function distance(a: string, b: string): number {
    return a === b ? 0 : 1;
}

function detectTyposquats(popular: string[], candidates: string[]): Result[] {
    return candidates.map((name) => ({ name, nearest: null, distance: null, verdict: "clear" }));
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { popular, candidates }, popular has at least one name. Output: the results as JSON.
type Input = { popular: string[]; candidates: string[] };

const input: Input = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(detectTyposquats(input.popular, input.candidates)));
