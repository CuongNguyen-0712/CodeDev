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
    // @piece unknown-status: Stop on an unknown status
    const unknown = run.mutants.find((m) => !STATUSES.includes(m.status as Status));
    if (unknown) return { error: `unknown status "${unknown.status}" for mutant ${unknown.id}` };
    // @end

    // @piece per-file: A score for each file, sorted by file
    const byFile = new Map<string, Mutant[]>();
    for (const m of run.mutants) {
        if (!byFile.has(m.file)) byFile.set(m.file, []);
        byFile.get(m.file)!.push(m);
    }
    const files = [...byFile.keys()].sort().map((file) => ({ file, ...score(byFile.get(file)!) }));
    // @end

    // @piece overall-undetected: The overall score and the undetected mutants
    const overall = score(run.mutants);
    const undetected = run.mutants
        .filter((m) => UNDETECTED.has(m.status))
        .sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line || a.id - b.id))
        .map((m) => `${m.file}:${m.line} ${m.mutator} ${m.status} #${m.id}`);
    // @end
    // @piece gate: The quality gate
    // Compare the exact score, not the rounded one: detected / valid >= threshold / 100.
    const gate = overall.valid > 0 && overall.detected * 100 >= run.threshold * overall.valid ? "pass" : "fail";
    // @end
    return { files, overall, undetected, gate };
}

// @piece status-type: Every status a run can report
type Status = "killed" | "survived" | "timeout" | "no-coverage" | "compile-error" | "ignored";
// @end

// @piece status-sets: Statuses that count as detected and undetected
const STATUSES: Status[] = ["killed", "survived", "timeout", "no-coverage", "compile-error", "ignored"];
const DETECTED = new Set(["killed", "timeout"]);
const UNDETECTED = new Set(["survived", "no-coverage"]);
// @end

// @piece score-fn: Helper: the score of a list of mutants
function score(mutants: Mutant[]): Score {
    const detected = mutants.filter((m) => DETECTED.has(m.status)).length;
    const valid = detected + mutants.filter((m) => UNDETECTED.has(m.status)).length;
    return { detected, valid, score: valid === 0 ? null : Math.round((detected * 1000) / valid) / 10 };
}
// @end

// ---------------------------------------------------------------- test runner (do not change)
const run: Run = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(mutationReport(run)));
