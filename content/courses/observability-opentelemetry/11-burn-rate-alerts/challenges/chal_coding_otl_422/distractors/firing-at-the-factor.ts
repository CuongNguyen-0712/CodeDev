// @piece firing-check: Is the rule firing at minute t
let firing = false;
let longBurn = 0;
if (t >= rule.longMinutes - 1) {
    const longBad = sum(bad, t, rule.longMinutes);
    const longTotal = longBad + sum(good, t, rule.longMinutes);
    const shortBad = sum(bad, t, rule.shortMinutes);
    const shortTotal = shortBad + sum(good, t, rule.shortMinutes);
    if (longTotal >= minRequests && shortTotal >= minRequests) {
        longBurn = burnRate(longBad, longTotal, slo);
        firing = longBurn >= rule.factor && burnRate(shortBad, shortTotal, slo) >= rule.factor;
    }
}
