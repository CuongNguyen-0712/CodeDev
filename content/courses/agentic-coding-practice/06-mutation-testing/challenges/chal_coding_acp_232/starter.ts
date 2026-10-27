import { readFileSync } from "node:fs";

// CodeDev quality gate: mutation score of a recorded mutation-testing run.
//
//   detected   = killed + timeout
//   undetected = survived + no-coverage
//   valid      = detected + undetected      (compile-error and ignored count nowhere)
//   score      = null when valid is 0, else Math.round(detected * 1000 / valid) / 10
//   gate       = "pass" when valid > 0 and the exact score is >= threshold, else "fail"
// An unknown status returns { error } instead of a report.
// The full rules (sorting, the undetected line format, the error text) are in the challenge description.

type Mutant = { id: number; file: string; line: number; mutator: string; status: string };
type Run = { threshold: number; mutants: Mutant[] };
type Score = { detected: number; valid: number; score: number | null };
type FileScore = { file: string } & Score;
type Report =
    | { files: FileScore[]; overall: Score; undetected: string[]; gate: "pass" | "fail" }
    | { error: string };

function mutationReport(run: Run): Report {
    return { files: [], overall: { detected: 0, valid: 0, score: null }, undetected: [], gate: "pass" };
}

// ---------------------------------------------------------------- test runner (do not change)
const run: Run = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(mutationReport(run)));
