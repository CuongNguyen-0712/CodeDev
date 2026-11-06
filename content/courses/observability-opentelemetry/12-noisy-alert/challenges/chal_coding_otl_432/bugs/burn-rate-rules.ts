// @piece burn-rate-rules: Decide which alert rules fire at minute t
// The rules that are firing at minute t.
function firingRules(minutes: Minute[], t: number): Firing[] {
    const now = windowTotals(minutes, t, 1);
    if (now.total > 0 && now.bad / now.total > 0.01) {
        return [{ rule: "submit-errors-1m", severity: "page" }]; // page when more than 1% of this minute failed
    }
    return [];
}
