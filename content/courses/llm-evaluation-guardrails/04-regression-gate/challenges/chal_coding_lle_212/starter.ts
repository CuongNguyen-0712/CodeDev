import { readFileSync } from "node:fs";

// Regression gate for the CodeDev AI grading assistant. CI runs the eval set twice on recorded
// outputs, once with the current prompt (baseline, v6) and once with the change (candidate, v7),
// and this gate decides whether the change may ship.
//
// 1. Pair the runs by caseId. A caseId that appears twice in one run, or a paired case whose
//    slice differs between the runs, makes the input invalid: return
//    { decision: "invalid", reasons } with every problem, in this order and format:
//      duplicates of the baseline in input order:   "duplicate case <id> in baseline"
//      then duplicates of the candidate:             "duplicate case <id> in candidate"
//      then slice mismatches in baseline order:      "case <id>: slice <a> in baseline, <b> in candidate"
//    Cases found in only one run are not compared; count them in `unpaired`.
// 2. For the paired cases overall, and for each slice (sorted by name), compute n, the pass
//    rates (baseline, candidate: Math.round(1000 * passes / n) / 10), the change
//    (delta: Math.round(1000 * (candidatePasses - baselinePasses) / n) / 10; rates and delta
//    are null when n is 0), passToFail and failToPass (cases that flipped).
// 3. A group with n < minSampleSize has status "insufficient data" and is not checked further.
//    Otherwise its pass rate dropped more than the limit when
//    100 * (baselinePasses - candidatePasses) > limit * n   (exact, no rounding);
//    the limit is maxOverallDropPp overall and maxSliceDropPp for a slice.
//    Overall only, the paired rule: with m = passToFail + failToPass, the change is a
//    significant regression when m >= 1, criticalPassToFail[m] is a number and
//    passToFail >= criticalPassToFail[m].
//    Status: "regressed" when a check fires, otherwise "ok".
// 4. reasons: overall first, then slices in name order, using -delta as the drop:
//      "overall: insufficient data (n=<n> < <min>)"
//      "overall: pass rate dropped <drop> pp (limit <limit>)"
//      "overall: significant regression (<b> pass->fail vs <c> fail->pass, critical <k>)"
//      "slice <name>: insufficient data (n=<n> < <min>)"
//      "slice <name>: pass rate dropped <drop> pp (limit <limit>)"
// 5. decision: "fail" when any group regressed, else "review" when any group has
//    insufficient data, else "pass".
// Do not change the types or the test runner.

type CaseResult = { caseId: string; slice: string; pass: boolean };
type EvalRun = { version: string; results: CaseResult[] };
type GateConfig = {
    maxOverallDropPp: number;
    maxSliceDropPp: number;
    minSampleSize: number;
    criticalPassToFail: (number | null)[];
};
type GateInput = { baseline: EvalRun; candidate: EvalRun; config: GateConfig };

type Status = "ok" | "regressed" | "insufficient data";
type GroupStats = {
    n: number;
    baseline: number | null;
    candidate: number | null;
    delta: number | null;
    passToFail: number;
    failToPass: number;
    status: Status;
};
type GateReport =
    | { decision: "invalid"; reasons: string[] }
    | {
          decision: "pass" | "review" | "fail";
          paired: number;
          unpaired: number;
          overall: GroupStats;
          slices: ({ slice: string } & GroupStats)[];
          reasons: string[];
      };

function regressionGate(input: GateInput): GateReport {
    return { decision: "invalid", reasons: [] };
}

// ---------------------------------------------------------------- test runner (do not change)
const input: GateInput = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(regressionGate(input)));
