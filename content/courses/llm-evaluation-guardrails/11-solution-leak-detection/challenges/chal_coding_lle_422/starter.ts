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
    // [ ] Lower-case and drop all whitespace
}

// The winnowed fingerprint of a piece of code: a set of k-gram hash values.
function fingerprint(code: string): Set<number> {
    // [ ] Hash every k-gram, keep each window's minimum
}

// [ ] Split feedback into code blocks and prose

function checkFeedback(feedback: unknown, refs: References): string {
    // [ ] Rule 1: a hidden test's output appears

    // [ ] Rule 2: a code block overlaps a solution

    // [ ] Rule 3: the steps name distinctive identifiers

    return "allowed";
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { "solutions": [...], "tests": [{ "expected": "...", "hidden": true }], "distinctive": [...],
// "feedback": ["<generated feedback>", ...] }. Output: one line per feedback, "feedback <n>: <verdict>".
const input: References & { feedback: unknown[] } = JSON.parse(readFileSync(0, "utf8"));
const refs: References = { solutions: input.solutions, tests: input.tests, distinctive: input.distinctive };
input.feedback.forEach((text, i) => console.log(`feedback ${i + 1}: ${checkFeedback(text, refs)}`));
