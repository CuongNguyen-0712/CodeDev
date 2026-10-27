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
    return 0;
}

function evaluate(slo: number, minRequests: number, rules: Rule[], minutes: Minute[]): Alert[] {
    return [];
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
