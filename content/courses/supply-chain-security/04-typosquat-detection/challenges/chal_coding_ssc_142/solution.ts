import { readFileSync } from "node:fs";

// CodeDev dependency review: flag package names that look like a popular package but are not it.
//
// A pull request adds package names (candidates). Compare each one with a list of popular package
// names and return one verdict per candidate, in input order:
//
//   1. "invalid"  - the candidate is empty or contains whitespace (no npm name can).
//   2. "known"    - the candidate is exactly (same characters, same case) one of the popular names.
//   3. "separator_confusion" - after normalization the candidate equals one or more popular names
//                   whose raw spelling is different ("lodash_merge" vs "lodash.merge", "Express").
//   4. "lookalike" - otherwise, the smallest optimal-string-alignment distance between the normalized
//                   candidate and a normalized popular name is at most 1 when the normalized candidate
//                   is shorter than 6 characters, or at most 2 when it has 6 characters or more.
//   5. "unknown"  - none of the above (a new or made-up name: lesson 3's existence and age checks
//                   decide what happens to it, not this detector).
//
// normalize(name): lowercase, then replace every "_" and "." with "-". A scoped name is compared as
// one full string: "@types/node" is never shortened to "node".
//
// osaDistance(a, b): the minimum number of single-character insertions, deletions, substitutions and
// transpositions of two adjacent characters that turn a into b, where no substring is edited more
// than once (the restricted Damerau-Levenshtein distance). osaDistance("lodahs", "lodash") === 1.
//
// Output for each candidate: { name, verdict, distance, matches }
//   - known:               distance 0,    matches []
//   - separator_confusion: distance 0,    matches = the colliding popular names (raw spelling)
//   - lookalike:           distance = the smallest distance, matches = every popular name at that distance
//   - unknown, invalid:    distance null, matches []
//   matches are sorted alphabetically (plain string comparison). Popular names are distinct.

type Verdict = "invalid" | "known" | "separator_confusion" | "lookalike" | "unknown";

interface Finding {
    name: string;
    verdict: Verdict;
    distance: number | null;
    matches: string[];
}

function normalize(name: string): string {
    return name.toLowerCase().replace(/[_.]/g, "-");
}

function osaDistance(a: string, b: string): number {
    const d: number[][] = [];
    for (let i = 0; i <= a.length; i++) {
        d.push(new Array<number>(b.length + 1).fill(0));
        d[i][0] = i;
    }
    for (let j = 0; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
            if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
                d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
            }
        }
    }
    return d[a.length][b.length];
}

function sorted(names: string[]): string[] {
    return [...names].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
}

function classify(name: string, popular: string[]): Finding {
    if (name.length === 0 || /\s/.test(name)) return { name, verdict: "invalid", distance: null, matches: [] };
    if (popular.includes(name)) return { name, verdict: "known", distance: 0, matches: [] };

    const n = normalize(name);
    const collisions = popular.filter((p) => normalize(p) === n);
    if (collisions.length > 0) return { name, verdict: "separator_confusion", distance: 0, matches: sorted(collisions) };

    const limit = n.length < 6 ? 1 : 2;
    let best = Infinity;
    let closest: string[] = [];
    for (const p of popular) {
        const dist = osaDistance(n, normalize(p));
        if (dist < best) {
            best = dist;
            closest = [p];
        } else if (dist === best) {
            closest.push(p);
        }
    }
    if (best <= limit) return { name, verdict: "lookalike", distance: best, matches: sorted(closest) };
    return { name, verdict: "unknown", distance: null, matches: [] };
}

function detectTyposquats(candidates: string[], popular: string[]): Finding[] {
    return candidates.map((name) => classify(name, popular));
}

// ---------------------------------------------------------------- test runner (do not change)
interface Input {
    popular: string[];
    candidates: string[];
}
const input: Input = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(detectTyposquats(input.candidates, input.popular)));
