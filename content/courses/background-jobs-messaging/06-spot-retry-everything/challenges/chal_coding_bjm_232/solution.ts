import { readFileSync } from "node:fs";

// Spot the AI Mistake: retrying errors that can never succeed. The request sent to an AI coding
// assistant was:
//   "The course export worker fails now and then and instructors have to click Export again.
//    Make the export worker reliable."
// The assistant wrapped the export in a retry loop with exponential backoff that honours Retry-After.
// Its tests (a reports API that times out, answers 503 or 429, then recovers) passed and it was merged.
//
// A week later the export queue is always behind and the on-call engineer hears about broken exports
// from instructors, minutes after they happen. An export with a malformed course id, a course the
// reports API does not know (404) or a missing template file is attempted 10 times over 2.5 minutes
// before anyone is alerted, while valid exports wait behind it.
//
// Fix runExportJob so that only errors that can go away on their own are retried:
//   - retryable: TimeoutError, a connection reset (an Error with code "ECONNRESET"), HttpError 5xx,
//     HttpError 408 and HttpError 429 (wait retryAfterMs when it is set, as today);
//   - permanent: ValidationError, HttpError 4xx other than 408 and 429, a missing file (an Error with
//     code "ENOENT"). A permanent error fails the job at once: no sleep, no further attempt, alert now.
// Keep everything else as it is: up to 10 attempts, the backoff, the alert, the result.
// Do not change the error classes, the Deps type or anything below the "do not change" line.

// ---------------------------------------------------------------- errors thrown by the clients (do not change)
class ValidationError extends Error {
    override name = "ValidationError";
}
class TimeoutError extends Error {
    override name = "TimeoutError";
}
class HttpError extends Error {
    override name = "HttpError";
    constructor(
        readonly status: number,
        message: string,
        readonly retryAfterMs?: number,
    ) {
        super(message);
    }
}
/** Node.js style system error: fs and net set `code` ("ENOENT", "ECONNRESET", ...). */
type SystemError = Error & { code?: string };

type ExportJob = { id: string; courseId: string; format: string };
type ExportResult = { status: "done" | "failed"; error?: string };
type Deps = {
    /** Throws ValidationError when the course id is malformed. */
    validateCourseId(courseId: string): Promise<void>;
    /** GET https://reports.codedev.test/courses/:id/progress (HttpError, TimeoutError, ECONNRESET). */
    fetchProgress(courseId: string): Promise<string[]>;
    /** fs.readFile("templates/<format>.hbs"): throws an Error with code "ENOENT" when it is missing. */
    readTemplate(format: string): Promise<string>;
    /** PUT to object storage (HttpError, TimeoutError). */
    upload(key: string, body: string): Promise<void>;
    sleep(ms: number): Promise<void>;
    alert(message: string): void;
};

// ---------------------------------------------------------------- the export worker (written by the assistant)
const MAX_ATTEMPTS = 10;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30_000;

function describe(error: unknown): string {
    return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

async function exportCourse(job: ExportJob, deps: Deps): Promise<void> {
    await deps.validateCourseId(job.courseId);
    const rows = await deps.fetchProgress(job.courseId);
    const template = await deps.readTemplate(job.format);
    await deps.upload(`exports/${job.id}.${job.format}`, `${template}\n${rows.join("\n")}`);
}

/** Could the same request succeed later? Permanent errors fail the job at once. */
function isRetryable(error: unknown): boolean {
    if (error instanceof ValidationError) return false;
    if (error instanceof HttpError) return error.status >= 500 || error.status === 408 || error.status === 429;
    if (error instanceof TimeoutError) return true;
    const code = (error as SystemError).code;
    return code !== "ENOENT"; // ECONNRESET and unknown errors stay retryable
}

/** Retries failed exports with exponential backoff so a flaky dependency does not fail the export. */
async function runExportJob(job: ExportJob, deps: Deps): Promise<ExportResult> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            await exportCourse(job, deps);
            return { status: "done" };
        } catch (error) {
            lastError = error;
            if (attempt === MAX_ATTEMPTS || !isRetryable(error)) break;
            const retryAfterMs = error instanceof HttpError ? error.retryAfterMs : undefined;
            await deps.sleep(retryAfterMs ?? Math.min(BASE_DELAY_MS * 2 ** (attempt - 1), MAX_DELAY_MS));
        }
    }
    deps.alert(`export ${job.id} failed: ${describe(lastError)}`);
    return { status: "failed", error: describe(lastError) };
}

// ---------------------------------------------------------------- fake clients and test runner (do not change)
// Input: a list of jobs, each with a script of what happens on each attempt (the last entry repeats):
//   "ok", "reports:timeout", "reports:reset", "reports:<status>" or "reports:<status>:<retryAfterSeconds>",
//   "template:missing", "storage:timeout", "storage:<status>".
// A timeout costs 10 s of fake time, sleep(ms) costs ms; everything else is instant. Jobs run one after
// the other. For each job: status, attempts, worker time used, when the alert was sent, and the error.
type Input = Array<ExportJob & { script: string[] }>;

let clock = 0;
let attempts = 0;
let script: string[] = [];
let alerts: number[] = [];

const outcome = (): string => script[Math.min(attempts - 1, script.length - 1)] ?? "ok";

function fail(service: "reports" | "storage", what: string): never {
    const name = service === "reports" ? "reports API" : "object storage";
    if (what === "timeout") {
        clock += 10_000;
        throw new TimeoutError(`${name} did not answer within 10000 ms`);
    }
    if (what === "reset") {
        const error: SystemError = new Error(`read ECONNRESET (${name})`);
        error.code = "ECONNRESET";
        throw error;
    }
    const [status, retryAfter] = what.split(":").map(Number);
    throw new HttpError(status, `${name} answered ${status}`, retryAfter === undefined ? undefined : retryAfter * 1000);
}

const deps: Deps = {
    async validateCourseId(courseId) {
        attempts++;
        if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(courseId)) throw new ValidationError(`"${courseId}" is not a valid course id`);
    },
    async fetchProgress(courseId) {
        const step = outcome();
        if (step.startsWith("reports:")) fail("reports", step.slice("reports:".length));
        return [`${courseId},u_anna,12/12`, `${courseId},u_binh,7/12`];
    },
    async readTemplate(format) {
        if (outcome() === "template:missing") {
            const error: SystemError = new Error(`ENOENT: no such file or directory, open 'templates/${format}.hbs'`);
            error.code = "ENOENT";
            throw error;
        }
        return "course,user,progress";
    },
    async upload() {
        const step = outcome();
        if (step.startsWith("storage:")) fail("storage", step.slice("storage:".length));
    },
    async sleep(ms) {
        clock += ms;
    },
    alert() {
        alerts.push(clock);
    },
};

async function main(): Promise<void> {
    const jobs: Input = JSON.parse(readFileSync(0, "utf8"));
    let totalAttempts = 0;
    let totalTime = 0;
    for (const job of jobs) {
        clock = 0;
        attempts = 0;
        alerts = [];
        script = job.script;
        const result = await runExportJob({ id: job.id, courseId: job.courseId, format: job.format }, deps);
        const alert = alerts.length === 0 ? "no alert" : `alert at ${alerts.join(", ")} ms`;
        const line = `${job.id}: ${result.status} after ${attempts} attempt(s) in ${clock} ms`;
        console.log(result.status === "done" ? `${line}, ${alert}` : `${line}, ${alert}: ${result.error}`);
        totalAttempts += attempts;
        totalTime += clock;
    }
    console.log(`total: ${totalAttempts} attempts, ${totalTime} ms of worker time`);
}
main();
