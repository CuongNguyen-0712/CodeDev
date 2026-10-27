import { readFileSync } from "node:fs";

// On-call alerting for POST /submissions on the CodeDev API (https://api.codedev.test).
// The recorder stores one entry per minute: good and bad submit requests in that minute (minute 0 first).
// notifications() replays a recording and returns what the pager would have sent.

type Minute = { good: number; bad: number };
type Severity = "page" | "ticket";
type Firing = { rule: string; severity: Severity };
type Notification = { rule: string; severity: Severity; start: number; stop: number | null };
type Rule = { name: string; severity: Severity; factor: number; longMinutes: number; shortMinutes: number };

const SLO = 0.995; // 99.5% of eligible submit requests are good, over a rolling 28 days
const MIN_REQUESTS = 100;

const RULES: Rule[] = [
    { name: "burn-1h", severity: "page", factor: 14.4, longMinutes: 60, shortMinutes: 5 },
    { name: "burn-6h", severity: "page", factor: 6, longMinutes: 360, shortMinutes: 30 },
    { name: "burn-3d", severity: "ticket", factor: 1, longMinutes: 4320, shortMinutes: 360 },
];

// Requests in the `length` minutes that end at minute `end` (inclusive), clipped at minute 0.
function windowTotals(minutes: Minute[], end: number, length: number): { bad: number; total: number } {
    let good = 0;
    let bad = 0;
    for (let i = Math.max(0, end - length + 1); i <= end; i++) {
        good += minutes[i].good;
        bad += minutes[i].bad;
    }
    return { bad, total: good + bad };
}

// How many times faster than "exactly on budget" the window spends the error budget, to 2 decimals.
function burnRate(bad: number, total: number): number {
    return Math.round(((bad / total) / (1 - SLO)) * 100) / 100;
}

// The rules that are firing at minute t.
function firingRules(minutes: Minute[], t: number): Firing[] {
    const firing: Firing[] = [];
    for (const rule of RULES) {
        if (t < rule.longMinutes - 1) continue; // the recording does not cover the long window yet
        const long = windowTotals(minutes, t, rule.longMinutes);
        const short = windowTotals(minutes, t, rule.shortMinutes);
        if (long.total < MIN_REQUESTS || short.total < MIN_REQUESTS) continue;
        if (burnRate(long.bad, long.total) > rule.factor) {
            firing.push({ rule: rule.name, severity: rule.severity });
        }
    }
    return firing;
}

// One notification per firing period of a rule: start = first firing minute,
// stop = first minute after it that is not firing (null when still firing at the end).
function notifications(minutes: Minute[]): Notification[] {
    const sent: Notification[] = [];
    const open = new Map<string, Notification>();
    for (let t = 0; t < minutes.length; t++) {
        const now = firingRules(minutes, t);
        for (const f of now) {
            if (!open.has(f.rule)) {
                const n: Notification = { rule: f.rule, severity: f.severity, start: t, stop: null };
                open.set(f.rule, n);
                sent.push(n);
            }
        }
        for (const [rule, n] of open) {
            if (!now.some((f) => f.rule === rule)) {
                n.stop = t;
                open.delete(rule);
            }
        }
    }
    return sent;
}

// ---------------------------------------------------------------- test runner (do not change)
// stdin: { minutes: [[count, good, bad], ...] } - each entry repeats one minute `count` times
const input: { minutes: [number, number, number][] } = JSON.parse(readFileSync(0, "utf8"));
const recording: Minute[] = [];
for (const [count, good, bad] of input.minutes) for (let i = 0; i < count; i++) recording.push({ good, bad });
const clock = (m: number) =>
    `day ${Math.floor(m / 1440) + 1} ${String(Math.floor((m % 1440) / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const sent = notifications(recording);
for (const n of sent) {
    console.log(`${n.severity.toUpperCase()} ${n.rule}: ${clock(n.start)} -> ${n.stop === null ? "still firing" : clock(n.stop)}`);
}
const count = (s: Severity) => sent.filter((n) => n.severity === s).length;
console.log(`${recording.length} minutes replayed: ${count("page")} pages, ${count("ticket")} tickets`);
