import { readFileSync } from "node:fs";

// CodeDev queue lag report, built from the worker event log.
//
// Each log line is "<timestamp> <type> <queue> <jobId>", fields separated by whitespace:
//   timestamp  UTC, whole seconds, exactly YYYY-MM-DDTHH:MM:SSZ, and a real date and time
//   type       enqueue | dequeue | complete
// Any other line (wrong number of fields, unknown type, bad timestamp, empty) is skipped and counted.
//
// A job is identified by queue + jobId. Lines can arrive out of order and can be duplicated:
// for each job keep the EARLIEST enqueue, the earliest dequeue and the earliest complete.
// A job with no enqueue line was enqueued before the log starts: ignore it entirely.
//
// Report one window per queue per UTC minute, for every queue named in a well-formed line and every
// minute from the minute of the earliest well-formed line to the minute of the latest one (all queues
// share this range). Window [start, end) with end = start + 60 s:
//   depth            jobs waiting at `end`: enqueued before end, with no dequeue and no complete before end
//   oldestAgeSec     largest (end - enqueue) among those jobs, in seconds; 0 when depth is 0
//   waitP50Sec       nearest-rank p50 of (dequeue - enqueue) for jobs dequeued in [start, end); null if none
//   waitP95Sec       same, p95
//   processingP95Sec nearest-rank p95 of (complete - dequeue) for jobs completed in [start, end)
//                    that have a dequeue; null if none
//   breach           oldestAgeSec > sloSeconds
// Nearest-rank pth percentile of n sorted values: the value at 1-based rank ceil(p / 100 * n).
// Sort windows by queue name (ascending, plain string comparison), then by minute.
//
// Write parseLine, nearestRank and queueLag (add helpers if you like). Do not change the types or the test runner.

type EventType = "enqueue" | "dequeue" | "complete";

interface LogEvent {
    at: number; // epoch seconds
    type: EventType;
    queue: string;
    jobId: string;
}

interface Window {
    queue: string;
    minute: string; // "YYYY-MM-DDTHH:MM"
    depth: number;
    oldestAgeSec: number;
    waitP50Sec: number | null;
    waitP95Sec: number | null;
    processingP95Sec: number | null;
    breach: boolean;
}

interface Report {
    skippedLines: number;
    windows: Window[];
}

const TYPES = new Set(["enqueue", "dequeue", "complete"]);

function parseLine(line: string): LogEvent | null {
    const fields = line.trim().split(/\s+/);
    if (fields.length !== 4) return null;
    const [ts, type, queue, jobId] = fields;
    if (!TYPES.has(type)) return null;
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(ts)) return null;
    const ms = Date.parse(ts);
    // Date.parse rolls "02-30" over to March: a real time must print back as the same text
    if (Number.isNaN(ms) || new Date(ms).toISOString() !== ts.replace("Z", ".000Z")) return null;
    return { at: ms / 1000, type: type as EventType, queue, jobId };
}

function nearestRank(sorted: number[], p: number): number | null {
    if (sorted.length === 0) return null;
    return sorted[Math.ceil((p / 100) * sorted.length) - 1];
}

function queueLag(sloSeconds: number, lines: string[]): Report {
    let skippedLines = 0;
    const jobs = new Map<string, { queue: string; enqueue?: number; dequeue?: number; complete?: number }>();
    const queues = new Set<string>();
    let first = Infinity;
    let last = -Infinity;
    for (const line of lines) {
        const e = parseLine(line);
        if (!e) {
            skippedLines++;
            continue;
        }
        queues.add(e.queue);
        first = Math.min(first, e.at);
        last = Math.max(last, e.at);
        const key = `${e.queue}\u0000${e.jobId}`;
        const job = jobs.get(key) ?? { queue: e.queue };
        const seen = job[e.type];
        job[e.type] = e.at; // keep what the log says last
        jobs.set(key, job);
    }
    const windows: Window[] = [];
    if (queues.size === 0) return { skippedLines, windows };
    const firstMinute = Math.floor(first / 60) * 60;
    const lastMinute = Math.floor(last / 60) * 60;
    const known = [...jobs.values()].filter((j) => j.enqueue !== undefined);
    for (const queue of [...queues].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
        const qJobs = known.filter((j) => j.queue === queue);
        for (let start = firstMinute; start <= lastMinute; start += 60) {
            const end = start + 60;
            const waiting = qJobs.filter(
                (j) => j.enqueue! < end && (j.dequeue ?? Infinity) >= end && (j.complete ?? Infinity) >= end,
            );
            const oldestAgeSec = waiting.reduce((max, j) => Math.max(max, end - j.enqueue!), 0);
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
                breach: oldestAgeSec > sloSeconds,
            });
        }
    }
    return { skippedLines, windows };
}

// ---------------------------------------------------------------- test runner (do not change)
const input: { sloSeconds: number; lines: string[] } = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(queueLag(input.sloSeconds, input.lines)));
