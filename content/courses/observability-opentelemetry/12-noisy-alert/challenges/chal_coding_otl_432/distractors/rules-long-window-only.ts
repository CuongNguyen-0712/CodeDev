// @piece burn-rate-rules: Decide which alert rules fire at minute t
type Rule = { name: string; severity: Severity; factor: number; longMinutes: number; shortMinutes: number };
const MIN_REQUESTS = 100;

const RULES: Rule[] = [
    { name: "burn-1h", severity: "page", factor: 14.4, longMinutes: 60, shortMinutes: 5 },
    { name: "burn-6h", severity: "page", factor: 6, longMinutes: 360, shortMinutes: 30 },
    { name: "burn-3d", severity: "ticket", factor: 1, longMinutes: 4320, shortMinutes: 360 },
];

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
