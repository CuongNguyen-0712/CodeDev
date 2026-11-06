// @piece alert-periods: Open, extend or close the rule's alert
if (firing) {
    if (open) open.peak = Math.max(open.peak, longBurn);
    else {
        open = { rule: rule.name, severity: rule.severity, start: t, stop: null, peak: longBurn };
        alerts.push(open);
    }
} else if (open) {
    open.stop = t - 1;
    open = null;
}
