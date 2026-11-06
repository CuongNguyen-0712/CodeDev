// @piece group-status: Decide the group's status and reasons
let status: Status = "ok";
if (n < config.minSampleSize) {
    status = "insufficient data";
    reasons.push(`${label}: insufficient data (n=${n} < ${config.minSampleSize})`);
} else {
    if (100 * (bp - cp) >= limit * n) {
        status = "regressed";
        reasons.push(`${label}: pass rate dropped ${-(delta as number)} pp (limit ${limit})`);
    }
    const m = passToFail + failToPass;
    const critical = m >= 1 ? config.criticalPassToFail[m] : null;
    if (paired && typeof critical === "number" && passToFail >= critical) {
        status = "regressed";
        reasons.push(`${label}: significant regression (${passToFail} pass->fail vs ${failToPass} fail->pass, critical ${critical})`);
    }
}
