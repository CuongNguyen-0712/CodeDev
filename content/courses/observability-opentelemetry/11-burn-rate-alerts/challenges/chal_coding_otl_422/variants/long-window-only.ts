import { readFileSync } from "node:fs";

// Burn-rate alerts for POST /submissions on the CodeDev API.
// The recording has one entry per minute: good and bad requests in that minute (minute 0 first).
//
// burnRate(bad, total, slo) = Math.round(((bad / total) / (1 - slo)) * 100) / 100
//
// A rule { name, severity, factor, longMinutes, shortMinutes } is firing at minute t when ALL of:
//   - t >= longMinutes - 1 (the recording covers the whole long window)
//   - the long window (minutes t - longMinutes + 1 .. t) and the short window
//     (minutes t - shortMinutes + 1 .. t) each hold at least minRequests requests
//   - burnRate over the long window > factor AND burnRate over the short window > factor
//
// evaluate() returns one alert per firing period of each rule: start = first firing minute,
// stop = first minute after it that is not firing (null when still firing at the end),
// peak = highest long-window burn rate over the firing minutes. Sorted by start, then rule order.
// Throws a RangeError for an invalid slo, minRequests, rule or minute count.

type Minute = { good: number; bad: number };
type Severity = "page" | "ticket";
type Rule = { name: string; severity: Severity; factor: number; longMinutes: number; shortMinutes: number };
type Alert = { rule: string; severity: Severity; start: number; stop: number | null; peak: number };

function burnRate(bad: number, total: number, slo: number): number {
    return Math.round(((bad / total) / (1 - slo)) * 100) / 100;
}

function evaluate(slo: number, minRequests: number, rules: Rule[], minutes: Minute[]): Alert[] {
    if (typeof slo !== "number" || !(slo > 0 && slo < 1)) throw new RangeError("slo must be between 0 and 1");
    if (!Number.isInteger(minRequests) || minRequests < 1) throw new RangeError("minRequests must be a whole number >= 1");
    for (const r of rules) {
        if (typeof r.factor !== "number" || !Number.isFinite(r.factor) || r.factor <= 0) throw new RangeError(`${r.name}: factor`);
        if (!Number.isInteger(r.shortMinutes) || r.shortMinutes < 1) throw new RangeError(`${r.name}: shortMinutes`);
        if (!Number.isInteger(r.longMinutes) || r.longMinutes <= r.shortMinutes) throw new RangeError(`${r.name}: longMinutes`);
    }
    // prefix sums: good[i] = good requests in minutes 0 .. i - 1
    const good = [0];
    const bad = [0];
    for (const m of minutes) {
        if (!Number.isInteger(m.good) || m.good < 0 || !Number.isInteger(m.bad) || m.bad < 0) {
            throw new RangeError("counts must be whole numbers >= 0");
        }
        good.push(good[good.length - 1] + m.good);
        bad.push(bad[bad.length - 1] + m.bad);
    }
    const sum = (p: number[], end: number, length: number) => p[end + 1] - p[end + 1 - length];

    const alerts: Alert[] = [];
    for (const rule of rules) {
        let open: Alert | null = null;
        for (let t = 0; t < minutes.length; t++) {
            let firing = false;
            let longBurn = 0;
            if (t >= rule.longMinutes - 1) {
                const longBad = sum(bad, t, rule.longMinutes);
                const longTotal = longBad + sum(good, t, rule.longMinutes);
                const shortBad = sum(bad, t, rule.shortMinutes);
                const shortTotal = shortBad + sum(good, t, rule.shortMinutes);
                if (longTotal >= minRequests && shortTotal >= minRequests) {
                    longBurn = burnRate(longBad, longTotal, slo);
                    firing = longBurn > rule.factor;
                }
            }
            if (firing) {
                if (open) open.peak = Math.max(open.peak, longBurn);
                else {
                    open = { rule: rule.name, severity: rule.severity, start: t, stop: null, peak: longBurn };
                    alerts.push(open);
                }
            } else if (open) {
                open.stop = t;
                open = null;
            }
        }
    }
    return alerts.sort((a, b) => a.start - b.start); // stable: rule order breaks ties
}

// ---------------------------------------------------------------- test runner (do not change)
// stdin: { slo, minRequests, rules, minutes: [[count, good, bad], ...] } - each entry repeats one minute `count` times
type Input = { slo: number; minRequests: number; rules: Rule[]; minutes: [number, number, number][] };
const input: Input = JSON.parse(readFileSync(0, "utf8"));
const recording: Minute[] = [];
for (const [count, good, bad] of input.minutes) for (let i = 0; i < count; i++) recording.push({ good, bad });
try {
    const alerts = evaluate(input.slo, input.minRequests, input.rules, recording);
    console.log(`${recording.length} minutes, alerts: ${alerts.length}`);
    for (const a of alerts) {
        console.log(`${a.severity} ${a.rule}: ${a.start} -> ${a.stop ?? "still firing"}, peak ${a.peak}x`);
    }
} catch (error) {
    console.log(error instanceof RangeError ? "error RangeError" : `unexpected error: ${String(error)}`);
}
