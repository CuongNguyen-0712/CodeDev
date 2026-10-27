import { readFileSync } from "node:fs";

// The progress service of CodeDev: validate a progress update, keep each lesson's percent
// monotonic, derive the course percent and publish progress.updated once per real change.
// Write applyProgress. Do not change the types, the store, the event bus or the test runner.

type Course = { lessons: string[]; required?: Record<string, string[]> };
type Catalog = {
    courses: Record<string, Course>;
    enrollments: Record<string, string[]>; // userId -> course ids the learner is enrolled in
    passed: Record<string, string[]>; // userId -> challenge ids the learner has passed
};
type ProgressUpdate = { userId: string; courseId: string; lessonId: string; percent: unknown };
type ProgressDoc = { version: number; lessons: Record<string, number>; coursePercent: number };
type ProgressEvent = {
    type: "progress.updated";
    userId: string;
    courseId: string;
    lessonId: string;
    lessonPercent: number;
    coursePercent: number;
    version: number;
};
type ErrorCode = "INVALID_PERCENT" | "UNKNOWN_COURSE" | "LESSON_NOT_IN_COURSE" | "NOT_ENROLLED" | "CHALLENGES_NOT_PASSED";
type ApplyResult =
    | { status: "applied"; lessonPercent: number; coursePercent: number; version: number }
    | { status: "unchanged"; lessonPercent: number }
    | { status: "rejected"; error: ErrorCode };

// ---------------------------------------------------------------- infrastructure (do not change)
// ProgressStore: one progress document per (learner, course), like one row in PostgreSQL.
// get() returns a copy (version 0, no lessons, course 0 when the learner has no document yet).
class ProgressStore {
    private docs = new Map<string, ProgressDoc>();
    get(userId: string, courseId: string): ProgressDoc {
        const doc = this.docs.get(`${userId} ${courseId}`) ?? { version: 0, lessons: {}, coursePercent: 0 };
        return { version: doc.version, lessons: { ...doc.lessons }, coursePercent: doc.coursePercent };
    }
    put(userId: string, courseId: string, doc: ProgressDoc): void {
        this.docs.set(`${userId} ${courseId}`, { version: doc.version, lessons: { ...doc.lessons }, coursePercent: doc.coursePercent });
    }
    dump(): string[] {
        return [...this.docs.entries()]
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(([key, doc]) => {
                const lessons = Object.keys(doc.lessons).sort().map((id) => `${JSON.stringify(id)}:${doc.lessons[id]}`);
                return `${key} v${doc.version} course=${doc.coursePercent} {${lessons.join(",")}}`;
            });
    }
}

class EventBus {
    events: ProgressEvent[] = [];
    publish(event: ProgressEvent): void {
        this.events.push({ ...event });
    }
}

// ---------------------------------------------------------------- your code
function applyProgress(update: ProgressUpdate, catalog: Catalog, store: ProgressStore, bus: EventBus): ApplyResult {
    // Rules, in this order (the first failing check decides the error):
    //   1. percent is a JSON integer from 0 to 100                  else INVALID_PERCENT
    //   2. the course exists in catalog.courses                     else UNKNOWN_COURSE
    //   3. the lesson is one of the course's lessons                else LESSON_NOT_IN_COURSE
    //   4. the learner is enrolled in the course                    else NOT_ENROLLED
    //   5. percent 100 only when every required challenge of the
    //      lesson is in catalog.passed[userId]                       else CHALLENGES_NOT_PASSED
    // Then: percent not above the stored lesson percent -> unchanged (no write, no event).
    // Otherwise write the lesson percent, recompute coursePercent (floor of the average over ALL
    // lessons of the course, missing lessons count as 0), add 1 to version, store the document and
    // publish exactly one progress.updated event with the new values.
    return { status: "rejected", error: "INVALID_PERCENT" };
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { catalog, updates: ProgressUpdate[], quiet?: boolean }. Prints one line per update, the
// published events and the stored documents. With quiet: true (large inputs) it prints counts instead
// of the per-update lines and the events.
type Input = { catalog: Catalog; updates: ProgressUpdate[]; quiet?: boolean };

const input: Input = JSON.parse(readFileSync(0, "utf8"));
const store = new ProgressStore();
const bus = new EventBus();
const counts = new Map<string, number>();
input.updates.forEach((u, i) => {
    const r = applyProgress(u, input.catalog, store, bus);
    const outcome =
        r.status === "applied"
            ? `applied v${r.version} lesson ${r.lessonPercent} course ${r.coursePercent}`
            : r.status === "unchanged"
              ? `unchanged lesson ${r.lessonPercent}`
              : `rejected ${r.error}`;
    const key = r.status === "rejected" ? `rejected ${r.error}` : r.status;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (!input.quiet) console.log(`#${i + 1} ${u.userId} ${u.courseId}/${u.lessonId} ${JSON.stringify(u.percent)} -> ${outcome}`);
});
if (input.quiet) {
    for (const key of [...counts.keys()].sort()) console.log(`${key}: ${counts.get(key)}`);
}
console.log(`events: ${bus.events.length}`);
if (!input.quiet) {
    for (const e of bus.events) {
        console.log(`${e.type} ${e.userId} ${e.courseId} ${e.lessonId} lesson=${e.lessonPercent} course=${e.coursePercent} v=${e.version}`);
    }
}
console.log("store:");
for (const line of store.dump()) console.log(line);
