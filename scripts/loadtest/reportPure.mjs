// Pure maths of the run report: no I/O, tested in __tests__/loadtest/reportPure.test.js.
import { STAGE_VUS } from "../../loadtest/k6/lib/pure.js";

export function percentile(values, p) {
    if (!values.length) return NaN;
    const s = [...values].sort((x, y) => x - y);
    return s[Math.max(0, Math.ceil((p / 100) * s.length) - 1)];
}

const newStage = (stage) => ({
    vus: (stage + 1) * STAGE_VUS, read: [], write: [], errors: 0, limited: 0, total: 0,
    byEndpoint: new Map(), limitedBy: new Map(), // keyed "<cls> <endpoint>": the same endpoint name may exist in both classes
});

// A point with a numeric `ms` feeds the latency lists; a point with an `outcome` feeds the request
// counters. One point may carry both (tests), or only one (report.mjs: durations and outcomes come
// from different k6 metrics).
export function addPoint(stages, p) {
    let s = stages.get(p.stage);
    if (!s) stages.set(p.stage, (s = newStage(p.stage)));
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
export function computeN(stages, t) {
    let n = null;
    for (const stage of [...stages.keys()].sort((a, b) => a - b)) {
        const s = stages.get(stage);
        const rp = percentile(s.read, 95);
        const wp = percentile(s.write, 95);
        const rate = s.total ? s.errors / s.total : 0;
        let reason = null;
        if (rp > t.readP95) reason = `read p95 ${Math.round(rp)} ms > ${t.readP95}`;
        else if (wp > t.writeP95) reason = `write p95 ${Math.round(wp)} ms > ${t.writeP95}`;
        else if (rate > t.errorRate) reason = `error rate ${(rate * 100).toFixed(1)}% > ${t.errorRate * 100}%`;
        if (reason) return { n, breakStage: stage, reason };
        n = s.vus;
    }
    return { n, breakStage: null, reason: null };
}

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
