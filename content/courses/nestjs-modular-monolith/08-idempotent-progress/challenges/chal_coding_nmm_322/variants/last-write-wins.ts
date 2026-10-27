import { readFileSync } from "node:fs";

// ProgressService.record(event) for the CodeDev API (POST /progress/events).
// The mobile app sends one event while a learner reads or watches a lesson. It keeps unsent events in an offline queue
// and retries on a timeout, so the same event can arrive twice (same eventId) and an older event can arrive after a
// newer one. In the real API the stores are PostgreSQL tables; here they are in-memory fakes with the same methods.
//
// Rules:
//   invalid    eventId and userId are non-empty strings, courseId is in the catalog, lessonId is one of that course's
//              lessons, percent is an integer from 0 to 100. Otherwise return { status: "invalid" }: nothing changes and
//              the eventId is NOT remembered.
//   duplicate  the eventId was already recorded -> { status: "duplicate" }, nothing changes.
//   stale      percent is not higher than the stored percent of that lesson -> the stored value stays,
//              { status: "stale", lessonPercent, coursePercent }.
//   applied    otherwise store percent for the lesson -> { status: "applied", lessonPercent, coursePercent, courseCompleted }.
//   Every valid event (applied or stale) records its eventId.
//   coursePercent = Math.floor(sum of the stored percents of every lesson of the course / number of lessons);
//   a lesson with no stored progress counts as 0.
//   When an event moves coursePercent from below 100 to 100, publish exactly one
//   { type: "course.completed", userId, courseId } and return courseCompleted: true; otherwise courseCompleted: false.
//
// Do not change the types, the stores or the test runner.

type ProgressEvent = { eventId: string; userId: string; courseId: string; lessonId: string; percent: number };
type CourseCompleted = { type: "course.completed"; userId: string; courseId: string };
type RecordResult =
    | { status: "applied"; lessonPercent: number; coursePercent: number; courseCompleted: boolean }
    | { status: "stale"; lessonPercent: number; coursePercent: number }
    | { status: "duplicate" }
    | { status: "invalid" };

interface CourseCatalog {
    lessonIds(courseId: string): string[] | undefined;
}
interface LessonProgressRepository {
    get(userId: string, courseId: string, lessonId: string): number | undefined;
    set(userId: string, courseId: string, lessonId: string, percent: number): void;
}
interface ProcessedEventStore {
    has(eventId: string): boolean;
    add(eventId: string): void;
}
interface EventBus {
    publish(event: CourseCompleted): void;
}

class ProgressService {
    private readonly catalog: CourseCatalog;
    private readonly progress: LessonProgressRepository;
    private readonly processed: ProcessedEventStore;
    private readonly bus: EventBus;

    constructor(catalog: CourseCatalog, progress: LessonProgressRepository, processed: ProcessedEventStore, bus: EventBus) {
        this.catalog = catalog;
        this.progress = progress;
        this.processed = processed;
        this.bus = bus;
    }

    record(event: ProgressEvent): RecordResult {
        const { eventId, userId, courseId, lessonId, percent } = event;
        if (typeof eventId !== "string" || eventId === "" || typeof userId !== "string" || userId === "") {
            return { status: "invalid" };
        }
        const lessons = typeof courseId === "string" ? this.catalog.lessonIds(courseId) : undefined;
        if (!lessons || !lessons.includes(lessonId)) return { status: "invalid" };
        if (!Number.isInteger(percent) || percent < 0 || percent > 100) return { status: "invalid" };

        if (this.processed.has(eventId)) return { status: "duplicate" };
        this.processed.add(eventId);

        const before = this.coursePercent(userId, courseId, lessons);
        
        this.progress.set(userId, courseId, lessonId, percent);
        const after = this.coursePercent(userId, courseId, lessons);
        const courseCompleted = before < 100 && after === 100;
        if (courseCompleted) this.bus.publish({ type: "course.completed", userId, courseId });
        return { status: "applied", lessonPercent: percent, coursePercent: after, courseCompleted };
    }

    private coursePercent(userId: string, courseId: string, lessons: string[]): number {
        let sum = 0;
        for (const id of lessons) sum += this.progress.get(userId, courseId, id) ?? 0;
        return Math.floor(sum / lessons.length);
    }
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { "courses": { courseId: lessonId[] }, "progress"?: [userId, courseId, lessonId, percent][],
//          "processed"?: eventId[], "events": ProgressEvent[], "summary"?: true }
// Prints one line per event, the published events, and the stored progress per learner and course.
// With "summary": true it prints only the count per status, the published events and a checksum of the progress.
type Test = {
    courses: Record<string, string[]>;
    progress?: [string, string, string, number][];
    processed?: string[];
    events: ProgressEvent[];
    summary?: boolean;
};

class InMemoryLessonProgressRepository implements LessonProgressRepository {
    readonly rows = new Map<string, number>();
    get(userId: string, courseId: string, lessonId: string): number | undefined {
        return this.rows.get(`${userId}|${courseId}|${lessonId}`);
    }
    set(userId: string, courseId: string, lessonId: string, percent: number): void {
        this.rows.set(`${userId}|${courseId}|${lessonId}`, percent);
    }
}

const test: Test = JSON.parse(readFileSync(0, "utf8"));
const repo = new InMemoryLessonProgressRepository();
for (const [u, c, l, p] of test.progress ?? []) repo.set(u, c, l, p);
const seen = new Set<string>(test.processed ?? []);
const published: CourseCompleted[] = [];
const service = new ProgressService(
    { lessonIds: (courseId) => (Object.prototype.hasOwnProperty.call(test.courses, courseId) ? [...test.courses[courseId]] : undefined) },
    repo,
    { has: (id) => seen.has(id), add: (id) => void seen.add(id) },
    { publish: (e) => void published.push({ ...e }) },
);

const counts: Record<string, number> = {};
for (const event of test.events) {
    const r = service.record(event);
    counts[r.status] = (counts[r.status] ?? 0) + 1;
    if (test.summary) continue;
    let line: string = r.status;
    if (r.status === "applied") line += `: lesson ${r.lessonPercent}%, course ${r.coursePercent}%${r.courseCompleted ? ", course completed" : ""}`;
    if (r.status === "stale") line += `: lesson stays ${r.lessonPercent}%, course ${r.coursePercent}%`;
    console.log(`${event.eventId} ${event.userId} ${event.courseId}/${event.lessonId} ${JSON.stringify(event.percent)} -> ${line}`);
}
const keys = [...repo.rows.keys()].sort();
if (test.summary) {
    let checksum = 0;
    for (const p of repo.rows.values()) checksum += p;
    console.log(Object.keys(counts).sort().map((s) => `${s}: ${counts[s]}`).join("; "));
    console.log(`published: ${published.length}; stored lessons: ${keys.length}; sum of percents: ${checksum}`);
} else {
    console.log(`published: ${published.map((e) => `${e.type} ${e.userId} ${e.courseId}`).join(", ") || "none"}`);
    const groups = new Map<string, string[]>();
    for (const k of keys) {
        const [u, c, l] = k.split("|");
        const g = `${u} ${c}`;
        groups.set(g, [...(groups.get(g) ?? []), `${l}=${repo.rows.get(k)}`]);
    }
    for (const [g, parts] of groups) console.log(`${g}: ${parts.join(" ")}`);
}
