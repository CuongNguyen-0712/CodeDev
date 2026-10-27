import { readFileSync } from "node:fs";

// CodeDev quality gate: mutation score of a recorded mutation-testing run. Reference solution.

type Status = "killed" | "survived" | "timeout" | "no-coverage" | "compile-error" | "ignored";
type Mutant = { id: number; file: string; line: number; mutator: string; status: string };
type Run = { threshold: number; mutants: Mutant[] };
type Score = { detected: number; valid: number; score: number | null };
type FileScore = { file: string } & Score;
type Report =
    | { files: FileScore[]; overall: Score; undetected: string[]; gate: "pass" | "fail" }
    | { error: string };

const STATUSES: Status[] = ["killed", "survived", "timeout", "no-coverage", "compile-error", "ignored"];
const DETECTED = new Set(["killed", "timeout"]);
const UNDETECTED = new Set(["survived", "no-coverage"]);

function score(mutants: Mutant[]): Score {
    const detected = mutants.filter((m) => DETECTED.has(m.status)).length;
    const valid = detected + mutants.filter((m) => m.status === "survived").length;
    return { detected, valid, score: valid === 0 ? null : Math.round((detected * 1000) / valid) / 10 };
}

function mutationReport(run: Run): Report {
    const unknown = run.mutants.find((m) => !STATUSES.includes(m.status as Status));
    if (unknown) return { error: `unknown status "${unknown.status}" for mutant ${unknown.id}` };

    const byFile = new Map<string, Mutant[]>();
    for (const m of run.mutants) {
        if (!byFile.has(m.file)) byFile.set(m.file, []);
        byFile.get(m.file)!.push(m);
    }
    const files = [...byFile.keys()].sort().map((file) => ({ file, ...score(byFile.get(file)!) }));

    const overall = score(run.mutants);
    const undetected = run.mutants
        .filter((m) => UNDETECTED.has(m.status))
        .sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line || a.id - b.id))
        .map((m) => `${m.file}:${m.line} ${m.mutator} ${m.status} #${m.id}`);
    // Compare the exact score, not the rounded one: detected / valid >= threshold / 100.
    const gate = overall.valid > 0 && overall.detected * 100 >= run.threshold * overall.valid ? "pass" : "fail";
    return { files, overall, undetected, gate };
}

// ---------------------------------------------------------------- test runner (do not change)
const run: Run = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(mutationReport(run)));
