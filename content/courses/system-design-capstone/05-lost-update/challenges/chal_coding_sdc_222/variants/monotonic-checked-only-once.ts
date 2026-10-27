import { readFileSync } from "node:fs";

// Spot the AI Mistake: two progress updates that overwrite each other.
// The request sent to an AI coding assistant was:
//   "Write recordProgress for the CodeDev progress service. Validate the update, keep each lesson's
//    percent monotonic (never lower it), recompute the course percent, save the learner's progress
//    document and publish progress.updated once per real change. Use the ProgressDb interface below.
//    Learners often have a course open on a laptop and a phone at the same time."
// The assistant wrote the function below. Its tests (one request at a time) passed and it was merged.
//
// Since then, support gets tickets like "I finished lesson 2 on my phone while lesson 1 was saving on
// my laptop, and now lesson 1 is back to 0%". Two progress.updated events with the same version show
// up in the event log, and the stored document sometimes holds only one of the two lessons.
//
// Fix recordProgress. Rules the team agreed on:
//   - No accepted update may be lost: the document keeps, for every lesson, the highest percent
//     that was ever applied, and a lesson percent never goes down.
//   - Use the document's version column as a compare-and-set guard: write with saveIfVersion. When
//     the version changed since your load, load again and decide again (the lesson may now be at or
//     above your percent: then the result is "unchanged").
//   - One attempt = exactly one load followed by at most one saveIfVersion (the test schedules count
//     database calls). At most 3 attempts; after the 3rd failed write return rejected CONFLICT.
//   - version goes up by exactly 1 per successful write. Publish exactly one event per successful
//     write, after it, with the version and coursePercent of the document that was written. A
//     rejected or unchanged request publishes nothing.
// Do not change the types, the database, the event bus, the scheduler or the test runner.

type ProgressDoc = { version: number; lessons: Record<string, number>; coursePercent: number };
type ProgressRequest = { name: string; userId: string; courseId: string; lessonId: string; percent: unknown };
type ProgressEvent = {
    type: "progress.updated";
    userId: string;
    courseId: string;
    lessonId: string;
    lessonPercent: number;
    coursePercent: number;
    version: number;
};
type Result =
    | { status: "applied"; version: number; coursePercent: number }
    | { status: "unchanged"; lessonPercent: number }
    | { status: "rejected"; error: "UNKNOWN_LESSON" | "INVALID_PERCENT" | "CONFLICT" };

interface ProgressDb {
    // SELECT version, lessons, course_percent FROM course_progress WHERE user_id = $1 AND course_id = $2
    // Returns a copy; { version: 0, lessons: {}, coursePercent: 0 } when the learner has no row yet.
    load(userId: string, courseId: string): Promise<ProgressDoc>;
    // UPDATE ... SET version = $doc.version, lessons = ..., course_percent = ...  (no WHERE on version)
    save(userId: string, courseId: string, doc: ProgressDoc): Promise<void>;
    // UPDATE ... SET ... WHERE user_id = $1 AND course_id = $2 AND version = $expectedVersion
    // Writes doc exactly as given and returns true only if the stored version still equals expectedVersion.
    saveIfVersion(userId: string, courseId: string, expectedVersion: number, doc: ProgressDoc): Promise<boolean>;
}

interface EventBus {
    publish(event: ProgressEvent): void;
}

const MAX_ATTEMPTS = 3;

function coursePercent(lessons: Record<string, number>, courseLessons: string[]): number {
    const sum = courseLessons.reduce((total, id) => total + (lessons[id] ?? 0), 0);
    return Math.floor(sum / courseLessons.length);
}

// ---------------------------------------------------------------- the fixed code
async function recordProgress(db: ProgressDb, bus: EventBus, courseLessons: string[], req: ProgressRequest): Promise<Result> {
    if (!courseLessons.includes(req.lessonId)) return { status: "rejected", error: "UNKNOWN_LESSON" };
    const percent = req.percent;
    if (typeof percent !== "number" || !Number.isInteger(percent) || percent < 0 || percent > 100) {
        return { status: "rejected", error: "INVALID_PERCENT" };
    }

    let doc = await db.load(req.userId, req.courseId);
    const current = doc.lessons[req.lessonId] ?? 0;
    if (percent <= current) return { status: "unchanged", lessonPercent: current };
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        if (attempt > 1) doc = await db.load(req.userId, req.courseId);

        const lessons = { ...doc.lessons, [req.lessonId]: percent };
        const next: ProgressDoc = { version: doc.version + 1, lessons, coursePercent: coursePercent(lessons, courseLessons) };
        // compare-and-set: only writes if nobody else wrote since our load
        if (!(await db.saveIfVersion(req.userId, req.courseId, doc.version, next))) continue;

        bus.publish({
            type: "progress.updated",
            userId: req.userId,
            courseId: req.courseId,
            lessonId: req.lessonId,
            lessonPercent: percent,
            coursePercent: next.coursePercent,
            version: next.version,
        });
        return { status: "applied", version: next.version, coursePercent: next.coursePercent };
    }
    return { status: "rejected", error: "CONFLICT" };
}

// ---------------------------------------------------------------- database + scheduler (do not change)
// Every database call of a request parks that request at its await. The runner decides which parked
// call the database executes next, like two API instances whose queries reach PostgreSQL in some
// order. A call runs against the stored rows at the moment the runner executes it.
type Parked = { run: () => unknown; resolve: (value: unknown) => void };
const rows = new Map<string, ProgressDoc>();
const parked = new Map<string, Parked>();
const copy = (d: ProgressDoc): ProgressDoc => ({ version: d.version, lessons: { ...d.lessons }, coursePercent: d.coursePercent });

function dbFor(requestName: string): ProgressDb {
    const call = <T>(run: () => T): Promise<T> =>
        new Promise<T>((resolve) => parked.set(requestName, { run, resolve: resolve as (value: unknown) => void }));
    const key = (u: string, c: string): string => `${u} ${c}`;
    return {
        load: (u, c) => call(() => copy(rows.get(key(u, c)) ?? { version: 0, lessons: {}, coursePercent: 0 })),
        save: (u, c, doc) => call(() => void rows.set(key(u, c), copy(doc))),
        saveIfVersion: (u, c, expected, doc) =>
            call(() => {
                const stored = rows.get(key(u, c));
                if ((stored?.version ?? 0) !== expected) return false;
                rows.set(key(u, c), copy(doc));
                return true;
            }),
    };
}

const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

async function step(name: string): Promise<boolean> {
    const p = parked.get(name);
    if (!p) return false;
    parked.delete(name);
    p.resolve(p.run());
    await settle();
    return true;
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { lessons, requests: [{ name, userId, courseId, lessonId, percent }], schedule?: string[] }.
// All requests start together. Each schedule entry executes the parked database call of that request
// (an entry is skipped when that request has no parked call). After the schedule, the remaining calls
// run one at a time, always for the first request in input order that has one.
type Input = { lessons: string[]; requests: ProgressRequest[]; schedule?: string[] };

async function main(): Promise<void> {
    const input: Input = JSON.parse(readFileSync(0, "utf8"));
    const events: ProgressEvent[] = [];
    const bus: EventBus = { publish: (e) => void events.push({ ...e }) };
    const results = new Map<string, Result>();
    for (const req of input.requests) {
        recordProgress(dbFor(req.name), bus, input.lessons, req).then((r) => void results.set(req.name, r));
    }
    await settle();
    for (const name of input.schedule ?? []) await step(name);
    for (let guard = 0; guard < 10_000; guard++) {
        const next = input.requests.find((r) => parked.has(r.name));
        if (!next) break;
        await step(next.name);
    }
    for (const req of input.requests) {
        const r = results.get(req.name);
        const text = !r
            ? "no result"
            : r.status === "applied"
              ? `applied v${r.version} course ${r.coursePercent}`
              : r.status === "unchanged"
                ? `unchanged lesson ${r.lessonPercent}`
                : `rejected ${r.error}`;
        console.log(`${req.name} ${req.userId} ${req.courseId}/${req.lessonId} ${JSON.stringify(req.percent)}: ${text}`);
    }
    console.log(`events: ${events.length}`);
    for (const e of events) {
        console.log(`${e.type} ${e.userId} ${e.courseId} ${e.lessonId} lesson=${e.lessonPercent} course=${e.coursePercent} v=${e.version}`);
    }
    console.log("store:");
    for (const k of [...rows.keys()].sort()) {
        const d = rows.get(k)!;
        const lessons = Object.keys(d.lessons).sort().map((id) => `${JSON.stringify(id)}:${d.lessons[id]}`);
        console.log(`${k} v${d.version} course=${d.coursePercent} {${lessons.join(",")}}`);
    }
}
main();
