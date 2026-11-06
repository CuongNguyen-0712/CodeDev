// @piece waiting: Jobs still waiting at the end of the minute
const waiting = qJobs.filter(
    (j) => j.enqueue! < end && (j.complete ?? Infinity) >= end,
);
const oldestAgeSec = waiting.reduce((max, j) => Math.max(max, end - j.enqueue!), 0);
