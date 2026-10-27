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
    return null;
}

function nearestRank(sorted: number[], p: number): number | null {
    return null;
}

function queueLag(sloSeconds: number, lines: string[]): Report {
    return { skippedLines: 0, windows: [] };
}

// ---------------------------------------------------------------- test runner (do not change)
const input: { sloSeconds: number; lines: string[] } = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(queueLag(input.sloSeconds, input.lines)));
