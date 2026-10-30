import { readFileSync } from "node:fs";

// CodeDev ProgressModule: "lesson completed" events reach ProgressService from the web app, the mobile
// app and a queue. Clients retry and the queue redelivers, so the same event can arrive twice, and
// events can arrive out of order. Progress must never go backwards.
//
// completeLesson(event) returns a ProgressView:
//   1. event.eventId was already processed successfully -> return the view stored for that eventId,
//      exactly as it was, and change nothing.
//   2. the course does not exist, or event.lessonId is not one of its lessons -> throw DomainError("NotFound").
//      A failed event changes nothing and is not stored as processed.
//   3. otherwise add the lesson to the learner's completed lessons for that course (a lesson counts once,
//      however many events mention it), and build the view:
//        completedLessons = number of distinct completed lessons of the course
//        percent          = Math.floor(completedLessons * 100 / number of lessons in the course)
//        completedAt      = clock.now().toISOString() the first time percent reaches 100; once set it
//                           never changes; null before that
//      Save the record, store the view for event.eventId, and return it.
// One record per (userId, courseId); a learner who has no record yet starts with no completed lessons.
// The repositories return copies: a record you change is only kept if you save it.
//
// Write completeLesson. Do not change the types, DomainError, the interfaces or the test runner.

type LessonCompleted = { eventId: string; userId: string; courseId: string; lessonId: string };
type ProgressRecord = { userId: string; courseId: string; completedLessonIds: string[]; completedAt: string | null };
type ProgressView = { userId: string; courseId: string; completedLessons: number; percent: number; completedAt: string | null };

type DomainErrorKind = "NotFound" | "AlreadyEnrolled" | "PrerequisiteMissing" | "CourseNotPublished" | "ValidationFailed";

class DomainError extends Error {
    constructor(readonly kind: DomainErrorKind, readonly details: Record<string, unknown> = {}) {
        super(kind);
    }
}

interface CourseRepository {
    // lesson ids of the course in syllabus order, or undefined when the course does not exist
    lessonIdsOf(courseId: string): string[] | undefined;
}
interface ProgressRepository {
    find(userId: string, courseId: string): ProgressRecord | undefined;
    save(record: ProgressRecord): void;
}
interface ProcessedEventRepository {
    find(eventId: string): ProgressView | undefined;
    save(eventId: string, view: ProgressView): void;
}
interface Clock {
    now(): Date;
}

class ProgressService {
    constructor(
        private readonly courses: CourseRepository,
        private readonly progress: ProgressRepository,
        private readonly processed: ProcessedEventRepository,
        private readonly clock: Clock,
    ) {}

    completeLesson(event: LessonCompleted): ProgressView {
        const stored = this.processed.find(event.eventId);
        if (stored) return stored;
        const lessonIds = this.courses.lessonIdsOf(event.courseId);
        if (!lessonIds || !lessonIds.includes(event.lessonId)) throw new DomainError("NotFound");
        const record: ProgressRecord = this.progress.find(event.userId, event.courseId)
            ?? { userId: event.userId, courseId: event.courseId, completedLessonIds: [], completedAt: null };
        record.completedLessonIds.push(event.lessonId);
        const completedLessons = record.completedLessonIds.length;
        const percent = Math.floor((completedLessons * 100) / lessonIds.length);
        if (percent === 100 && record.completedAt === null) record.completedAt = this.clock.now().toISOString();
        this.progress.save(record);
        const view = { userId: event.userId, courseId: event.courseId, completedLessons, percent, completedAt: record.completedAt };
        this.processed.save(event.eventId, view);
        return view;
    }
}

// ---- test runner (do not change)
type Op = ({ op: "event" } & LessonCompleted) | { op: "advance"; seconds: number };
type Input = { now: string; courses: Record<string, string[]>; ops: Op[] };

const input: Input = JSON.parse(readFileSync(0, "utf8"));
const copy = <T>(value: T): T => structuredClone(value);
const records = new Map<string, ProgressRecord>();
const views = new Map<string, ProgressView>();
let nowMs = Date.parse(input.now);
const service = new ProgressService(
    { lessonIdsOf: (id) => (Object.hasOwn(input.courses, id) ? copy(input.courses[id]) : undefined) },
    {
        find: (u, c) => copy(records.get(`${u}|${c}`)),
        save: (r) => { records.set(`${r.userId}|${r.courseId}`, copy(r)); },
    },
    { find: (id) => copy(views.get(id)), save: (id, v) => { views.set(id, copy(v)); } },
    { now: () => new Date(nowMs) },
);
const results: unknown[] = [];
for (const op of input.ops) {
    if (op.op === "advance") {
        nowMs += op.seconds * 1000;
        continue;
    }
    const { op: _, ...event } = op;
    try {
        results.push(service.completeLesson(event));
    } catch (e) {
        results.push(e instanceof DomainError ? { error: e.kind, ...e.details } : { crash: String(e) });
    }
}
console.log(JSON.stringify(results));
