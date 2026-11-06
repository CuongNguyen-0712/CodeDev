// @piece window-row: Wait and processing times, then the row
const waits = qJobs
    .filter((j) => j.dequeue !== undefined && j.dequeue >= start && j.dequeue < end)
    .map((j) => j.dequeue! - j.enqueue!)
    .sort((a, b) => a - b);
const processing = qJobs
    .filter((j) => j.dequeue !== undefined && j.complete !== undefined && j.complete >= start && j.complete < end)
    .map((j) => j.complete! - j.dequeue!)
    .sort((a, b) => a - b);
windows.push({
    queue,
    minute: new Date(start * 1000).toISOString().slice(0, 16),
    depth: waiting.length,
    oldestAgeSec,
    waitP50Sec: nearestRank(waits, 50),
    waitP95Sec: nearestRank(waits, 95),
    processingP95Sec: nearestRank(processing, 95),
    breach: oldestAgeSec >= sloSeconds,
});
