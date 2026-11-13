import { expect, it } from "vitest";
import { THRESHOLDS } from "../../loadtest/k6/lib/pure.js";
import { aggregateStages, bottlenecks, computeN, percentile, runValidity } from "../../scripts/loadtest/reportPure.mjs";

const pts = (stage, cls, ms, n, outcome = "ok") => Array.from({ length: n }, () => ({ stage, cls, endpoint: "/x", ms, outcome }));

it("finds N at the last stage that holds every threshold", () => {
    const stages = aggregateStages([
        ...pts(0, "read", 200, 100), ...pts(0, "write", 400, 20),
        ...pts(1, "read", 500, 100), ...pts(1, "write", 900, 20),
        ...pts(2, "read", 950, 100), ...pts(2, "write", 900, 20),
    ]);
    expect(computeN(stages, THRESHOLDS)).toEqual({ n: 100, breakStage: 2, reason: "read p95 950 ms > 800" });
});
it("breaks on errors but not on 429", () => {
    const limitedOnly = aggregateStages([...pts(0, "read", 100, 90), ...pts(0, "read", 100, 10, "limited")]);
    expect(computeN(limitedOnly, THRESHOLDS).n).toBe(50);
    const errors = aggregateStages([...pts(0, "read", 100, 98), ...pts(0, "read", 100, 2, "error")]);
    expect(computeN(errors, THRESHOLDS)).toMatchObject({ n: null, breakStage: 0 });
});
it("flags endpoints over twice their class threshold", () => {
    const [stage] = aggregateStages([...pts(0, "read", 1700, 10), ...pts(0, "write", 1000, 10)]).values();
    expect(bottlenecks(stage, THRESHOLDS)).toEqual([{ endpoint: "/x", cls: "read", p95: 1700 }]);
});
it("marks a run invalid when the load machine was busy", () => {
    const busy = Array.from({ length: 12 }, (_, i) => ({ t: i * 5000, cpu: 85 }));
    expect(runValidity(busy)).toEqual({ valid: false, worstMinuteCpu: 85 });
});
it("uses nearest-rank percentiles and counts outcome-only points without latency", () => {
    expect(percentile([5, 1, 3, 2, 4], 50)).toBe(3);
    const [s] = aggregateStages([{ stage: 0, cls: "read", endpoint: "/x", ms: 10, outcome: null }, { stage: 0, cls: "read", endpoint: "/x", ms: null, outcome: "error" }]).values();
    expect(s).toMatchObject({ total: 1, errors: 1 });
    expect(s.read).toEqual([10]);
});
