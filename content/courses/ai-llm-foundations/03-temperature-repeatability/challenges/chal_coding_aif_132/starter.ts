import { readFileSync } from "node:fs";

// CodeDev "Explain my error": learners clicked "Explain again" and got a different answer each time.
// The team recorded several runs of the same prompts at different temperatures (no live model here:
// the outputs are a fixture) and wants one number per prompt and temperature: how repeatable is it?
//
// measureStability(runs, threshold):
//   1. A run is valid when prompt is a non-empty string, temperature is a finite number and output is
//      a string. Ignore every other run (a failed request is recorded with output null) and count the
//      ignored runs in "ignored".
//   2. Normalise each output before comparing: trim it, replace every run of whitespace (spaces, tabs,
//      newlines) with one space, and lower-case it. "Use  a NUMBER.\n" and "use a number." are equal.
//   3. Group the valid runs by prompt and temperature together. For each group:
//        runs       number of valid runs in the group
//        distinct   number of different normalised outputs
//        agreement  share of runs whose normalised output equals the most common one, i.e.
//                   (count of the most common output) / runs, rounded to 2 decimals with
//                   Math.round(share * 100) / 100
//        flagged    true when the unrounded share is below threshold (a share equal to it is not flagged)
//   4. Return { results, ignored } with results sorted by prompt (compare with < and >), then by
//      temperature from low to high. A prompt and temperature with no valid run has no row.
//
// Do not change the types or the test runner.

type RecordedRun = { prompt: string; temperature: number; output: string | null };

type StabilityRow = {
    prompt: string;
    temperature: number;
    runs: number;
    distinct: number;
    agreement: number;
    flagged: boolean;
};

type StabilityReport = { results: StabilityRow[]; ignored: number };

function measureStability(runs: RecordedRun[], threshold: number): StabilityReport {
    return { results: [], ignored: 0 };
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { threshold, runs } as JSON. Output: the StabilityReport, as JSON.
const input: { threshold: number; runs: RecordedRun[] } = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(measureStability(input.runs, input.threshold)));
