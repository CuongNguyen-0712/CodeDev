import { readFileSync } from "node:fs";

// Poison Message & Growing Queue. Since 09:02 the grade-submissions queue of CodeDev has grown from
// 200 to 80,000 waiting submissions. The worker logs show the same job failing with a parser error
// every 30 seconds and going back to the head of the queue; nothing behind it is graded.
//
// The queue is FIFO with concurrency 1: the worker may only work on the message at the head, and while
// the head waits for its retry nothing behind it may start. The team's retry policy is now:
//   - at most 3 attempts per message in total, whatever the error;
//   - after a failed attempt that was not the last, retry the same message 30 s later (it stays at the head);
//   - when the 3rd attempt fails, move the message to the dead-letter list with its attempt count, its
//     last error and the time, and go on with the next message.
// Fix workOnce so the worker follows this policy. Do not change the grader or the test runner.

type Message = { id: string; body: string; attempts: number; notBefore: number; lastError: string };
type DeadLetter = { id: string; attempts: number; lastError: string; at: number };
type Worker = { queue: Message[]; dlq: DeadLetter[]; processed: string[] };

const RETRY_DELAY_SECONDS = 30;
const MAX_ATTEMPTS = 3;

// ---------------------------------------------------------------- grader (do not change)
// Grades one submission. Throws when the test report cannot be graded.
// "timeouts": N simulates a sandbox that does not answer on the first N attempts.
type Submission = { learner?: unknown; score?: unknown; timeouts?: number };

function gradeSubmission(body: string, attempt: number): void {
    let sub: Submission;
    try {
        sub = JSON.parse(body) as Submission;
    } catch {
        throw new Error("ParseError: test report is not valid JSON");
    }
    if (typeof sub !== "object" || sub === null || Array.isArray(sub)) throw new Error("ParseError: test report is not an object");
    if ((sub.timeouts ?? 0) >= attempt) throw new Error("GraderTimeout: sandbox did not answer in 10 s");
    if (typeof sub.learner !== "string") throw new Error("ValidationError: learner is missing");
    if (typeof sub.score !== "number") throw new Error("ValidationError: score must be a number");
}

// ---------------------------------------------------------------- consumer
/** Called once per second. Makes at most one delivery attempt, on the message at the head of the queue. */
function workOnce(w: Worker, now: number): void {
    const head = w.queue[0];
    if (!head || head.notBefore > now) return; // FIFO: nothing behind the head may start
    head.attempts += 1;
    try {
        gradeSubmission(head.body, head.attempts);
        w.queue.shift();
        w.processed.push(`${head.id}@${now}`);
    } catch (err) {
        head.lastError = (err as Error).message;
        if (head.attempts >= MAX_ATTEMPTS) {
            // poison: park it with the evidence, alert on DLQ depth, and let the next message run
            w.queue.shift();
            w.dlq.push({ id: head.id, attempts: head.attempts, lastError: head.lastError, at: now });
            return;
        }
        head.notBefore = now + RETRY_DELAY_SECONDS;
    }
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { until, sampleEvery, messages: [{ id, at, body }] }. The clock runs from 0 to `until` seconds.
// Each second: messages arriving at that second join the tail of the queue, then workOnce runs once.
// Output: graded submissions in order (id@second), the dead-letter list, the queue depth sampled every
// `sampleEvery` seconds, and the message left at the head (if any).
type Arrival = { id: string; at: number; body: string };
type Input = { until: number; sampleEvery: number; messages: Arrival[] };

const input = JSON.parse(readFileSync(0, "utf8")) as Input;
const arrivals = [...input.messages].sort((a, b) => a.at - b.at);
const w: Worker = { queue: [], dlq: [], processed: [] };
const depth: number[] = [];
let next = 0;
for (let now = 0; now <= input.until; now++) {
    while (next < arrivals.length && arrivals[next].at <= now) {
        const m = arrivals[next++];
        w.queue.push({ id: m.id, body: m.body, attempts: 0, notBefore: 0, lastError: "" });
    }
    workOnce(w, now);
    if (now % input.sampleEvery === 0) depth.push(w.queue.length);
}
const head = w.queue[0];
console.log(JSON.stringify({
    processed: w.processed.join(" "),
    deadLetters: w.dlq.map((d) => `${d.id} after ${d.attempts} attempts at ${d.at}: ${d.lastError}`),
    depth,
    head: head ? `${head.id} (${head.attempts} attempts, last error: ${head.lastError || "none"})` : "empty",
}, null, 2));
