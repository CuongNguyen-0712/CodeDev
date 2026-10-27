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
    const { baseline, candidate, config } = input;
    const problems: string[] = [];
    const byId = (run: EvalRun, label: string): Map<string, CaseResult> => {
        const map = new Map<string, CaseResult>();
        for (const r of run.results) {
            if (map.has(r.caseId)) problems.push(`duplicate case ${r.caseId} in ${label}`);
            else map.set(r.caseId, r);
        }
        return map;
    };
    const base = byId(baseline, "baseline");
    const cand = byId(candidate, "candidate");

    const pairs: { slice: string; before: boolean; after: boolean }[] = [];
    for (const [id, b] of base) {
        const c = cand.get(id);
        if (!c) { pairs.push({ slice: b.slice, before: b.pass, after: false }); continue; }
        if (b.slice !== c.slice) problems.push(`case ${id}: slice ${b.slice} in baseline, ${c.slice} in candidate`);
        pairs.push({ slice: b.slice, before: b.pass, after: c.pass });
    }
    if (problems.length > 0) return { decision: "invalid", reasons: problems };

    const reasons: string[] = [];
    const evaluate = (group: typeof pairs, label: string, limit: number, paired: boolean): GroupStats => {
        const n = group.length;
        const bp = group.filter((p) => p.before).length;
        const cp = group.filter((p) => p.after).length;
        const passToFail = group.filter((p) => p.before && !p.after).length;
        const failToPass = group.filter((p) => !p.before && p.after).length;
        const rate = (passes: number) => (n === 0 ? null : Math.round((1000 * passes) / n) / 10);
        const delta = n === 0 ? null : Math.round((1000 * (cp - bp)) / n) / 10;
        let status: Status = "ok";
        if (n < config.minSampleSize) {
            status = "insufficient data";
            reasons.push(`${label}: insufficient data (n=${n} < ${config.minSampleSize})`);
        } else {
            if (100 * (bp - cp) > limit * n) {
                status = "regressed";
                reasons.push(`${label}: pass rate dropped ${-(delta as number)} pp (limit ${limit})`);
            }
            const m = passToFail + failToPass;
            const critical = m >= 1 ? config.criticalPassToFail[m] : null;
            if (paired && typeof critical === "number" && passToFail >= critical) {
                status = "regressed";
                reasons.push(`${label}: significant regression (${passToFail} pass->fail vs ${failToPass} fail->pass, critical ${critical})`);
            }
        }
        return { n, baseline: rate(bp), candidate: rate(cp), delta, passToFail, failToPass, status };
    };

    const overall = evaluate(pairs, "overall", config.maxOverallDropPp, true);
    const names = [...new Set(pairs.map((p) => p.slice))].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const slices = names.map((name) => ({
        slice: name,
        ...evaluate(pairs.filter((p) => p.slice === name), `slice ${name}`, config.maxSliceDropPp, false),
    }));

    const groups = [overall, ...slices];
    const decision = groups.some((g) => g.status === "regressed")
        ? "fail"
        : groups.some((g) => g.status === "insufficient data")
          ? "review"
          : "pass";
    return { decision, paired: pairs.length, unpaired: base.size + cand.size - 2 * pairs.length, overall, slices, reasons };
}

// ---------------------------------------------------------------- test runner (do not change)
const input: GateInput = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(regressionGate(input)));
