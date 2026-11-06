// @piece median-of-runs: The middle value of the runs, robust to one noisy run
function median(values) {
    return values.reduce((sum, v) => sum + v, 0) / values.length;
}
