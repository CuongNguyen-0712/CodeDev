// Pure maths of the run report: no I/O, tested in __tests__/loadtest/reportPure.test.js.
import { STAGE_MS, STAGE_VUS } from "../../loadtest/k6/lib/pure.js";

export function percentile(values, p) {
    if (!values.length) return NaN;
    const s = [...values].sort((x, y) => x - y);
    return s[Math.max(0, Math.ceil((p / 100) * s.length) - 1)];
}

const newStage = (stage, maxVus = Infinity) => ({
    vus: Math.min((stage + 1) * STAGE_VUS, maxVus), read: [], write: [], errors: 0, limited: 0, total: 0,
    byEndpoint: new Map(), limitedBy: new Map(), // keyed "<cls> <endpoint>": the same endpoint name may exist in both classes
});

// A point with a numeric `ms` feeds the latency lists; a point with an `outcome` feeds the request
// counters. One point may carry both (tests), or only one (report.mjs: durations and outcomes come
// from different k6 metrics).
export function addPoint(stages, p, maxVus) {
    let s = stages.get(p.stage);
    if (!s) stages.set(p.stage, (s = newStage(p.stage, maxVus)));
    const key = `${p.cls} ${p.endpoint}`;
    if (typeof p.ms === "number") {
        s[p.cls].push(p.ms);
        if (!s.byEndpoint.has(key)) s.byEndpoint.set(key, []);
        s.byEndpoint.get(key).push(p.ms);
    }
    if (p.outcome) {
        s.total++;
        if (p.outcome === "error") s.errors++;
        if (p.outcome === "limited") {
            s.limited++;
            s.limitedBy.set(key, (s.limitedBy.get(key) ?? 0) + 1);
        }
    }
}

export function aggregateStages(points) {
    const stages = new Map();
    for (const p of points) addPoint(stages, p);
    return stages;
}

// Every stage up to N must hold every threshold; 429 never counts as a failure.
// `partial` (optional Set of stage indexes, see partialStages) may break a stage but never sets N.
export function computeN(stages, t, partial = new Set()) {
    let n = null;
    for (const stage of [...stages.keys()].sort((a, b) => a - b)) {
        const s = stages.get(stage);
        const rp = percentile(s.read, 95);
        const wp = percentile(s.write, 95);
        const rate = s.total ? s.errors / s.total : 0;
        // A stage passes only strictly below each limit (spec: p95 < 800 / < 1500, errors < 1%).
        const op = (v, lim) => (v > lim ? ">" : ">=");
        let reason = null;
        if (rp >= t.readP95) reason = `read p95 ${Math.round(rp)} ms ${op(rp, t.readP95)} ${t.readP95}`;
        else if (wp >= t.writeP95) reason = `write p95 ${Math.round(wp)} ms ${op(wp, t.writeP95)} ${t.writeP95}`;
        else if (rate >= t.errorRate) reason = `error rate ${(rate * 100).toFixed(1)}% ${op(rate, t.errorRate)} ${t.errorRate * 100}%`;
        if (reason) return { n, breakStage: stage, reason };
        if (!partial.has(stage)) n = s.vus;
    }
    return { n, breakStage: null, reason: null };
}

// Index of the stage that ran at `n` VUs (vus is capped at maxVus, so n / STAGE_VUS - 1 is not always an integer).
export const stageAtVus = (stages, n) => (n === null ? null : [...stages].find(([, s]) => s.vus === n)?.[0] ?? null);

export function bottlenecks(stage, t) {
    const out = [];
    for (const [key, ms] of stage.byEndpoint) {
        const i = key.indexOf(" ");
        const cls = key.slice(0, i);
        const p95 = percentile(ms, 95);
        if (p95 > t.bottleneckFactor * (cls === "read" ? t.readP95 : t.writeP95)) out.push({ endpoint: key.slice(i + 1), cls, p95 });
    }
    return out.sort((a, b) => b.p95 - a.p95);
}

// Invalid when the load machine itself was busy: any 1-minute window with mean host CPU > 80%.
// A trailing window of under 3 samples is ignored (a cool-down blip) unless it is the only one.
export function runValidity(hostSamples) {
    if (!hostSamples.length) return { valid: true, worstMinuteCpu: 0 };
    const t0 = hostSamples[0].t;
    const wins = new Map();
    for (const { t, cpu } of hostSamples) {
        const k = Math.floor((t - t0) / 60000);
        if (!wins.has(k)) wins.set(k, []);
        wins.get(k).push(cpu);
    }
    let list = [...wins.values()];
    const full = list.filter((w) => w.length >= 3);
    if (full.length) list = full;
    const worst = Math.max(...list.map((w) => w.reduce((a, b) => a + b, 0) / w.length));
    return { valid: worst <= 80, worstMinuteCpu: Math.round(worst * 10) / 10 };
}

// Folds one k6 NDJSON line into `st` ({ stages, journeys, zeroPoints, t0 }, see newFold). Only stress
// (`hold`) drops the ramp (first RAMP_MS of each stage) and the tail: the run ends at S x STAGE_MS,
// but VUs finish their iteration (gracefulStop) and keep sending requests tagged stage S, a level
// that never ran. Non-stress profiles pool everything into stage 0.
// Samples taken while k6 was measuring: setup and VU initialisation before the first tagged point are not the test.
export const inWindow = (samples, st) => (st.t0 === null ? samples : samples.filter((x) => x.t >= st.t0 && x.t <= st.tEnd));

export const RAMP_MS = 10000;
export const HOLD_MS = STAGE_MS - RAMP_MS;
export const newFold = () => ({ stages: new Map(), journeys: {}, zeroPoints: new Map(), t0: null, tEnd: null, cover: new Map() });

// Hold coverage per stage = span between its first and last kept point (stress only). Under 90% of the hold
// window means the run ended inside the stage (k6 abort): its numbers are real but it is no steady level.
export const holdCoverage = (st, stage) => {
    const c = st.cover.get(stage);
    return c ? Math.min(1, (c.last - c.first) / HOLD_MS) : 1;
};
export const partialStages = (st) => new Set([...st.cover.keys()].filter((k) => holdCoverage(st, k) < 0.9));

export function foldLine(st, line, { hold, maxVus }) {
    const { metric, type, data } = JSON.parse(line);
    if (type !== "Point") return;
    const tags = data.tags ?? {};
    if (tags.stage === undefined || !tags.class) return; // setup traffic carries no stage tag
    const time = Date.parse(data.time);
    st.t0 ??= time; // scenario start ~ first tagged point
    const stage = hold ? Number(tags.stage) : 0;
    if (hold && (stage >= Math.ceil(maxVus / STAGE_VUS) || time - st.t0 - stage * STAGE_MS < RAMP_MS)) return;
    st.tEnd = Math.max(st.tEnd ?? time, time); // last kept point
    if (hold) {
        const c = st.cover.get(stage) ?? { first: time, last: time };
        st.cover.set(stage, { first: Math.min(c.first, time), last: Math.max(c.last, time) });
    }
    const base = { stage, cls: tags.class, endpoint: tags.endpoint };
    const cap = hold ? maxVus : undefined;
    if (metric === "http_req_duration") addPoint(st.stages, { ...base, ms: data.value, outcome: null }, cap);
    else if (metric === "limited") addPoint(st.stages, { ...base, ms: null, outcome: "limited" }, cap);
    else if (metric === "failed_requests") {
        st.journeys[tags.journey] = (st.journeys[tags.journey] ?? 0) + 1;
        if (data.value) addPoint(st.stages, { ...base, ms: null, outcome: "error" }, cap);
        else {
            const k = `${stage}|${base.cls} ${base.endpoint}`;
            st.zeroPoints.set(k, (st.zeroPoints.get(k) ?? 0) + 1);
        }
    }
}

// One failed_requests point exists per request: the value-0 ones minus the 429s (already counted as "limited") are "ok".
export function finishFold(st) {
    for (const [k, v0] of st.zeroPoints) {
        const i = k.indexOf("|");
        const s = st.stages.get(Number(k.slice(0, i)));
        if (!s) continue; // a stage that only has value-0 points has no latency or errors to report
        s.total += Math.max(0, v0 - (s.limitedBy.get(k.slice(i + 1)) ?? 0));
    }
    return st;
}
