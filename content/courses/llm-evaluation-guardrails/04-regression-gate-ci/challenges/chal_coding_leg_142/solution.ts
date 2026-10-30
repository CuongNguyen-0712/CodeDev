import { readFileSync } from "node:fs";

// CodeDev AI Hint Service: the regression gate that runs in CI on every change to a prompt, a model or
// a generation config. It compares the eval results of the production prompt (baseline, hint-v3) with
// the results of the pull request (candidate, hint-v4) and decides whether the change may be merged.
//
// regressionGate(baseline, candidate, policy) returns a GateResult:
//   1. Malformed input: if a run contains the same caseId more than once, the result cannot be trusted.
//      decision "fail", baselineRate / candidateRate / deltaPoints null, regressions [], and one reason per
//      duplicated id: "duplicate caseId in baseline: <id>" (ids sorted), then
//      "duplicate caseId in candidate: <id>" (ids sorted). Each duplicated id is listed once per run.
//   2. Shared cases are the caseIds present in both runs; every other case is ignored.
//      If there are no shared cases, or fewer than policy.minSharedCases: decision "insufficient_data",
//      rates and delta null, regressions [], reasons ["only <n> shared cases (minimum <minSharedCases>)"].
//   3. Otherwise, on the shared cases only:
//      baselineRate / candidateRate = percent of shared cases passed, rounded with Math.round(x * 10) / 10;
//      deltaPoints = candidate percent minus baseline percent, computed unrounded, then rounded the same way;
//      regressions = caseIds that passed in the baseline and failed in the candidate, sorted.
//      reasons, in this order:
//        - "pass rate dropped by <-deltaPoints> points (max <maxDropPoints>)" when the unrounded drop
//          (baseline percent minus candidate percent) is strictly greater than policy.maxDropPoints;
//        - "critical case regressed: <id>" for every regression whose tags include policy.criticalTag in
//          the baseline run or in the candidate run (ids sorted).
//      decision "fail" when there is at least one reason, otherwise "pass".
// "Sorted" means the default order of Array.prototype.sort() on strings.

interface CaseResult {
    caseId: string;
    passed: boolean;
    tags: string[];
}

interface GatePolicy {
    maxDropPoints: number;
    minSharedCases: number;
    criticalTag: string;
}

type Decision = "pass" | "fail" | "insufficient_data";

interface GateResult {
    decision: Decision;
    baselineRate: number | null;
    candidateRate: number | null;
    deltaPoints: number | null;
    regressions: string[];
    reasons: string[];
}

function duplicateIds(run: CaseResult[]): string[] {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const result of run) {
        if (seen.has(result.caseId)) duplicates.add(result.caseId);
        seen.add(result.caseId);
    }
    return [...duplicates].sort();
}

const round1 = (x: number): number => Math.round(x * 10) / 10;

function regressionGate(baseline: CaseResult[], candidate: CaseResult[], policy: GatePolicy): GateResult {
    const malformed = [
        ...duplicateIds(baseline).map((id) => `duplicate caseId in baseline: ${id}`),
        ...duplicateIds(candidate).map((id) => `duplicate caseId in candidate: ${id}`),
    ];
    if (malformed.length > 0) {
        return { decision: "fail", baselineRate: null, candidateRate: null, deltaPoints: null, regressions: [], reasons: malformed };
    }

    const byId = new Map(candidate.map((c) => [c.caseId, c]));
    const pairs = baseline.flatMap((b) => {
        const c = byId.get(b.caseId);
        return c ? [{ b, c }] : [];
    });
    const n = pairs.length;
    if (n === 0 || n < policy.minSharedCases) {
        return {
            decision: "insufficient_data", baselineRate: null, candidateRate: null, deltaPoints: null, regressions: [],
            reasons: [`only ${n} shared cases (minimum ${policy.minSharedCases})`],
        };
    }

    const basePassed = pairs.filter((p) => p.b.passed).length;
    const candPassed = pairs.filter((p) => p.c.passed).length;
    const deltaPoints = round1(((candPassed - basePassed) * 100) / n);
    const regressed = pairs.filter((p) => p.b.passed && !p.c.passed);

    const reasons: string[] = [];
    // integer comparison: drop% > max  <=>  (basePassed - candPassed) * 100 > max * n
    if ((basePassed - candPassed) * 100 > policy.maxDropPoints * n) {
        reasons.push(`pass rate dropped by ${-deltaPoints} points (max ${policy.maxDropPoints})`);
    }
    const critical = regressed
        .filter((p) => p.b.tags.includes(policy.criticalTag) || p.c.tags.includes(policy.criticalTag))
        .map((p) => p.b.caseId)
        .sort();
    for (const id of critical) reasons.push(`critical case regressed: ${id}`);

    return {
        decision: reasons.length > 0 ? "fail" : "pass",
        baselineRate: round1((basePassed * 100) / n),
        candidateRate: round1((candPassed * 100) / n),
        deltaPoints,
        regressions: regressed.map((p) => p.b.caseId).sort(),
        reasons,
    };
}

// ---------------------------------------------------------------- test runner (do not change)
const input: { baseline: CaseResult[]; candidate: CaseResult[]; policy: GatePolicy } = JSON.parse(readFileSync(0, "utf8"));
const result: GateResult = regressionGate(input.baseline, input.candidate, input.policy);
console.log(JSON.stringify(result));
