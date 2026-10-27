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
    const { userId, courseId, lessonId, percent } = update;
    if (typeof percent !== "number" || !Number.isInteger(percent) || percent < 0 || percent > 100) {
        return { status: "rejected", error: "INVALID_PERCENT" };
    }
    const course = Object.hasOwn(catalog.courses, courseId) ? catalog.courses[courseId] : undefined;
    if (!course) return { status: "rejected", error: "UNKNOWN_COURSE" };
    if (!course.lessons.includes(lessonId)) return { status: "rejected", error: "LESSON_NOT_IN_COURSE" };
    if (!(catalog.enrollments[userId] ?? []).includes(courseId)) return { status: "rejected", error: "NOT_ENROLLED" };
    if (percent === 100) {
        const passed = catalog.passed[userId] ?? [];
        const required = course.required?.[lessonId] ?? [];
        if (!required.every((id) => passed.includes(id))) return { status: "rejected", error: "CHALLENGES_NOT_PASSED" };
    }

    const doc = store.get(userId, courseId);
    const current = doc.lessons[lessonId] ?? 0;
    if (percent <= current) return { status: "unchanged", lessonPercent: current };

    doc.lessons[lessonId] = percent;
    const started = Object.values(doc.lessons);
    doc.coursePercent = Math.floor(started.reduce((a, b) => a + b, 0) / started.length);
    doc.version += 1;
    store.put(userId, courseId, doc);
    bus.publish({
        type: "progress.updated",
        userId,
        courseId,
        lessonId,
        lessonPercent: percent,
        coursePercent: doc.coursePercent,
        version: doc.version,
    });
    return { status: "applied", lessonPercent: percent, coursePercent: doc.coursePercent, version: doc.version };
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
