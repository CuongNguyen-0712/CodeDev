import { readFileSync } from "node:fs";

// Detecting leaked solutions in the AI grading feedback.
// The grading assistant sees the reference solutions and every test case of a challenge, so its
// feedback can leak them. checkFeedback runs after generation, before the feedback is stored, and
// returns "allowed" or "blocked: <rule> (<detail>)". The rules and the exact output are in the
// challenge description. Fill every [ ] line with a piece (some pieces are wrong). Do not change
// the policy constants or the test runner.

const K = 5;                  // characters per k-gram
const W = 4;                  // k-gram hashes per winnowing window
const MAX_OVERLAP = 0.5;      // block when overlap >= this
const MIN_OUTPUT_LENGTH = 6;  // shorter normalised expected outputs are not checked
const MIN_IDENTIFIERS = 3;    // distinctive identifiers in step lines that block
const MOD = 1_000_000_007;

type TestCase = { expected: string; hidden: boolean };
type References = { solutions: string[]; tests: TestCase[]; distinctive: string[] };

// Lower case, every whitespace character removed.
function normalise(text: string): string {
    // @piece normalise: Lower-case and drop all whitespace
    return text.toLowerCase().replace(/\s+/g, "");
    // @end
}

// The winnowed fingerprint of a piece of code: a set of k-gram hash values.
function fingerprint(code: string): Set<number> {
    // @piece fingerprint: Hash every k-gram, keep each window's minimum
    const text = normalise(code);
    const hashes: number[] = [];
    for (let i = 0; i + K <= text.length; i++) {
        let h = 0;
        for (let j = i; j < i + K; j++) h = (h * 31 + text.charCodeAt(j)) % MOD;
        hashes.push(h);
    }
    const prints = new Set<number>();
    if (hashes.length === 0) return prints;
    const windows = Math.max(1, hashes.length - W + 1);
    for (let start = 0; start < windows; start++) {
        prints.add(Math.min(...hashes.slice(start, start + W)));
    }
    return prints;
    // @end
}

// @piece split-feedback: Split feedback into code blocks and prose
function splitFeedback(feedback: string): { blocks: string[]; prose: string[] } {
    const lines = feedback.split(/\r?\n/);
    const blocks: string[] = [];
    const prose: string[] = [];
    for (let i = 0; i < lines.length; i++) {
        if (!lines[i].trim().startsWith("```")) {
            prose.push(lines[i]);
            continue;
        }
        const block: string[] = [];
        i++;
        while (i < lines.length && !lines[i].trim().startsWith("```")) block.push(lines[i++]);
        blocks.push(block.join("\n"));
    }
    return { blocks, prose };
}
// @end

function checkFeedback(feedback: unknown, refs: References): string {
    // @piece hidden-output: Rule 1: a hidden test's output appears
    if (typeof feedback !== "string" || feedback.trim() === "") return "blocked: empty";

    const text = normalise(feedback);
    for (let t = 0; t < refs.tests.length; t++) {
        const expected = normalise(refs.tests[t].expected);
        if (refs.tests[t].hidden && expected.length >= MIN_OUTPUT_LENGTH && text.includes(expected)) {
            return `blocked: hidden-output (test ${t + 1})`;
        }
    }
    // @end

    // @piece code-overlap: Rule 2: a code block overlaps a solution
    const { blocks, prose } = splitFeedback(feedback);
    const blockPrints = blocks.map(fingerprint);
    let best = 0;
    let bestSolution = 0;
    refs.solutions.forEach((solution, s) => {
        const ref = fingerprint(solution);
        if (ref.size === 0) return;
        for (const prints of blockPrints) {
            let shared = 0;
            for (const h of ref) if (prints.has(h)) shared++;
            if (shared / ref.size > best) {
                best = shared / ref.size;
                bestSolution = s + 1;
            }
        }
    });
    if (best >= MAX_OVERLAP) return `blocked: code-overlap (solution ${bestSolution}, ${best.toFixed(2)})`;
    // @end

    // @piece algorithm-steps: Rule 3: the steps name distinctive identifiers
    const steps = prose.filter((line) => /^([-*]|\d+\.)\s+/.test(line.trim())).join("\n");
    const found = refs.distinctive.filter((id) => {
        const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return new RegExp(`(?<![A-Za-z0-9_$])${escaped}(?![A-Za-z0-9_$])`).test(steps);
    });
    const needed = Math.min(MIN_IDENTIFIERS, refs.distinctive.length);
    if (needed > 0 && found.length >= needed) return `blocked: algorithm-steps (${found.join(", ")})`;
    // @end

    return "allowed";
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { "solutions": [...], "tests": [{ "expected": "...", "hidden": true }], "distinctive": [...],
// "feedback": ["<generated feedback>", ...] }. Output: one line per feedback, "feedback <n>: <verdict>".
const input: References & { feedback: unknown[] } = JSON.parse(readFileSync(0, "utf8"));
const refs: References = { solutions: input.solutions, tests: input.tests, distinctive: input.distinctive };
input.feedback.forEach((text, i) => console.log(`feedback ${i + 1}: ${checkFeedback(text, refs)}`));
