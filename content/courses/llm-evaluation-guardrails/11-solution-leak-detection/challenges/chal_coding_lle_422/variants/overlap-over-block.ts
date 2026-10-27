import { readFileSync } from "node:fs";

// Wrong: divides the shared fingerprints by the size of the feedback block, not of the reference.

const K = 5;                  // characters per k-gram
const W = 4;                  // k-gram hashes per winnowing window
const MAX_OVERLAP = 0.5;      // block when overlap >= this
const MIN_OUTPUT_LENGTH = 6;  // shorter normalised expected outputs are not checked
const MIN_IDENTIFIERS = 3;    // distinctive identifiers in step lines that block
const MOD = 1_000_000_007;

type TestCase = { expected: string; hidden: boolean };
type References = { solutions: string[]; tests: TestCase[]; distinctive: string[] };

function normalise(text: string): string {
    return text.toLowerCase().replace(/\s+/g, "");
}

function fingerprint(code: string): Set<number> {
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
}

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

function checkFeedback(feedback: unknown, refs: References): string {
    if (typeof feedback !== "string" || feedback.trim() === "") return "blocked: empty";

    const text = normalise(feedback);
    for (let t = 0; t < refs.tests.length; t++) {
        const expected = normalise(refs.tests[t].expected);
        if (refs.tests[t].hidden && expected.length >= MIN_OUTPUT_LENGTH && text.includes(expected)) {
            return `blocked: hidden-output (test ${t + 1})`;
        }
    }

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
            if (prints.size > 0 && shared / prints.size > best) {
                best = shared / prints.size;
                bestSolution = s + 1;
            }
        }
    });
    if (best >= MAX_OVERLAP) return `blocked: code-overlap (solution ${bestSolution}, ${best.toFixed(2)})`;

    const steps = prose.filter((line) => /^([-*]|\d+\.)\s+/.test(line.trim())).join("\n");
    const found = refs.distinctive.filter((id) => {
        const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return new RegExp(`(?<![A-Za-z0-9_$])${escaped}(?![A-Za-z0-9_$])`).test(steps);
    });
    const needed = Math.min(MIN_IDENTIFIERS, refs.distinctive.length);
    if (needed > 0 && found.length >= needed) return `blocked: algorithm-steps (${found.join(", ")})`;

    return "allowed";
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { "solutions": [...], "tests": [{ "expected": "...", "hidden": true }], "distinctive": [...],
// "feedback": ["<generated feedback>", ...] }. Output: one line per feedback, "feedback <n>: <verdict>".
const input: References & { feedback: unknown[] } = JSON.parse(readFileSync(0, "utf8"));
const refs: References = { solutions: input.solutions, tests: input.tests, distinctive: input.distinctive };
input.feedback.forEach((text, i) => console.log(`feedback ${i + 1}: ${checkFeedback(text, refs)}`));
