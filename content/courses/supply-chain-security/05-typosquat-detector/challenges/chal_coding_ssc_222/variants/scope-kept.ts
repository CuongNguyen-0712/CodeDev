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
    let n = name.toLowerCase();
    
    n = n.replace(/[_.]/g, "-").replace(/1/g, "l").replace(/0/g, "o");
    if (n.startsWith("js-") && n.length > 3) n = n.slice(3);
    if (n.endsWith("-js") && n.length > 3) n = n.slice(0, -3);
    return n;
}

function distance(a: string, b: string): number {
    const d: number[][] = [];
    for (let i = 0; i <= a.length; i++) {
        d.push([i]);
        for (let j = 1; j <= b.length; j++) {
            if (i === 0) {
                d[i].push(j);
                continue;
            }
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            let best = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
            if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) best = Math.min(best, d[i - 2][j - 2] + 1);
            d[i].push(best);
        }
    }
    return d[a.length][b.length];
}

function threshold(n: number): number {
    return n <= 3 ? 0 : n <= 7 ? 1 : 2;
}

const VALID = /^[A-Za-z0-9@/._~-]{1,214}$/;
const ORDER: Verdict[] = ["lookalike", "invalid", "clear", "exact"];

function detectTyposquats(popular: string[], candidates: string[]): Result[] {
    const known = popular.map((name) => ({ name, normalized: normalize(name) }));
    const results = candidates.map((name): Result => {
        if (!VALID.test(name)) return { name, nearest: null, distance: null, verdict: "invalid" };
        if (popular.includes(name)) return { name, nearest: name, distance: 0, verdict: "exact" };
        const n = normalize(name);
        let nearest = known[0].name;
        let best = Infinity;
        for (const p of known) {
            const d = distance(n, p.normalized);
            if (d < best || (d === best && p.name < nearest)) {
                best = d;
                nearest = p.name;
            }
        }
        return { name, nearest, distance: best, verdict: best <= threshold(n.length) ? "lookalike" : "clear" };
    });
    return results.sort((x, y) =>
        ORDER.indexOf(x.verdict) - ORDER.indexOf(y.verdict)
        || (x.distance ?? 0) - (y.distance ?? 0)
        || (x.name < y.name ? -1 : x.name > y.name ? 1 : 0));
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { popular, candidates }, popular has at least one name. Output: the results as JSON.
type Input = { popular: string[]; candidates: string[] };

const input: Input = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(detectTyposquats(input.popular, input.candidates)));
