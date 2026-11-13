import { expect, it } from "vitest";
import { THRESHOLDS } from "../../loadtest/k6/lib/pure.js";
import { aggregateStages, bottlenecks, computeN, finishFold, foldLine, newFold, percentile, runValidity, stageAtVus, inWindow, partialStages } from "../../scripts/loadtest/reportPure.mjs";

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

it("breaks exactly at the limit: p95 800 ms read, 1500 ms write, 1.0% errors", () => {
    expect(computeN(aggregateStages(pts(0, "read", 800, 10)), THRESHOLDS)).toEqual({ n: null, breakStage: 0, reason: "read p95 800 ms >= 800" });
    expect(computeN(aggregateStages(pts(0, "write", 1500, 10)), THRESHOLDS).reason).toBe("write p95 1500 ms >= 1500");
    const onePct = aggregateStages([...pts(0, "read", 100, 99), ...pts(0, "read", 100, 1, "error")]);
    expect(computeN(onePct, THRESHOLDS)).toMatchObject({ n: null, breakStage: 0 });
});

// k6 NDJSON lines; the scenario starts at t=0 (first tagged point).
const T0 = Date.parse("2026-11-14T00:00:00Z");
const line = (metric, atMs, value, stage, extra = {}) =>
    JSON.stringify({ metric, type: "Point", data: { time: new Date(T0 + atMs).toISOString(), value, tags: { class: "read", endpoint: "/x", journey: "learner", stage: String(stage), ...extra } } });
const fold = (lines, opts) => {
    const st = newFold();
    lines.forEach((l) => foldLine(st, l, opts));
    return finishFold(st);
};
const stress = { hold: true, maxVus: 100 }; // 2 stages: 0 and 1

it("fold drops the ramp and the tail past the last stage, caps vus at maxVus", () => {
    const { stages } = fold([
        line("http_req_duration", 0, 5, 0), // t0 and ramp
        line("http_req_duration", 9000, 5, 0), // ramp
        line("http_req_duration", 10000, 300, 0), // kept
        line("http_req_duration", 130000, 7, 1), // stage 1 ramp (120 s + 10 s edge is kept; 129 s is not)
        line("http_req_duration", 129000, 7, 1), // ramp
        line("http_req_duration", 250000, 9, 2), // tail: stage 2 never ran
    ], stress);
    expect([...stages.keys()].sort()).toEqual([0, 1]);
    expect(stages.get(0).read).toEqual([300]);
    expect(stages.get(1).read).toEqual([7]);
    const odd = fold([line("http_req_duration", 10000, 1, 0), line("http_req_duration", 140000, 1, 1)], { hold: true, maxVus: 70 });
    expect(odd.stages.get(1).vus).toBe(70);
});

it("fold counts a 429 as limited and not ok, and a retry as 2 latency samples but 1 outcome", () => {
    const { stages } = fold([
        line("http_req_duration", 0, 1, 0), // sets t0 (ramp, dropped)
        line("http_req_duration", 20000, 10, 0),
        line("failed_requests", 20001, 0, 0), // ok request
        line("http_req_duration", 21000, 10, 0),
        line("failed_requests", 21001, 0, 0),
        line("limited", 21001, 1, 0), // 429: also a value-0 failed_requests point
        line("http_req_duration", 22000, 10, 0), // refresh + retry: 2 samples
        line("http_req_duration", 22100, 10, 0),
        line("failed_requests", 22101, 1, 0), // 1 outcome: error
    ], stress);
    expect(stages.get(0)).toMatchObject({ total: 3, errors: 1, limited: 1 });
    expect(stages.get(0).read).toHaveLength(4);
});

it("fold pools every point of a non-stress run into stage 0, ramp included", () => {
    const { stages } = fold([line("http_req_duration", 0, 5, 3), line("http_req_duration", 500000, 6, 9)], { hold: false, maxVus: 5 });
    expect(stages.get(0).read).toEqual([5, 6]);
});

it("with maxVus 70 and both stages passing, N is 70 and its stage index is 1", () => {
    const { stages } = fold([
        line("http_req_duration", 0, 1, 0),
        line("http_req_duration", 20000, 100, 0), line("failed_requests", 20001, 0, 0),
        line("http_req_duration", 140000, 100, 1), line("failed_requests", 140001, 0, 1),
    ], { hold: true, maxVus: 70 });
    expect(computeN(stages, THRESHOLDS)).toEqual({ n: 70, breakStage: null, reason: null });
    expect(stageAtVus(stages, 70)).toBe(1);
    expect(stageAtVus(stages, null)).toBeNull();
});

it("judges validity only inside the k6 window: busy setup ignored, busy test minute counted", () => {
    const st = fold([line("http_req_duration", 0, 1, 0), line("http_req_duration", 180000, 1, 1)], stress);
    const cpuAt = (ms, cpu) => ({ t: T0 + ms, cpu });
    const setup = Array.from({ length: 24 }, (_, i) => cpuAt(-120000 + i * 5000, 90)); // before t0
    const quiet = Array.from({ length: 36 }, (_, i) => cpuAt(i * 5000, 20));
    expect(runValidity(inWindow([...setup, ...quiet], st))).toEqual({ valid: true, worstMinuteCpu: 20 });
    const busy = Array.from({ length: 12 }, (_, i) => cpuAt(60000 + i * 5000, 85));
    expect(runValidity(inWindow([...setup, ...quiet.slice(0, 12), ...busy], st)).valid).toBe(false);
});

it("finishFold skips a stage that only holds value-0 failed_requests points", () => {
    const st = newFold();
    st.zeroPoints.set("3|read /x", 2);
    expect(() => finishFold(st)).not.toThrow();
});

it("a partial last stage can break but never sets N", () => {
    const st = fold([
        line("http_req_duration", 0, 1, 0),
        line("http_req_duration", 10000, 100, 0), line("http_req_duration", 119000, 100, 0),
        line("http_req_duration", 130000, 100, 1), line("http_req_duration", 180000, 100, 1), // 50 of 110 s
    ], stress);
    expect([...partialStages(st)]).toEqual([1]);
    expect(computeN(st.stages, THRESHOLDS, partialStages(st))).toEqual({ n: 50, breakStage: null, reason: null });
    const slow = fold([
        line("http_req_duration", 0, 1, 0),
        line("http_req_duration", 10000, 100, 0), line("http_req_duration", 119000, 100, 0),
        line("http_req_duration", 130000, 5000, 1), line("http_req_duration", 180000, 5000, 1),
    ], stress);
    expect(computeN(slow.stages, THRESHOLDS, partialStages(slow))).toMatchObject({ n: 50, breakStage: 1 });
});
