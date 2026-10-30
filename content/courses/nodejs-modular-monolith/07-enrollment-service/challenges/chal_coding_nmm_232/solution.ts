import { readFileSync } from "node:fs";

// CodeDev EnrollmentsModule: the enrollment rules live in EnrollmentService, not in the controller.
// The service receives its repositories and a clock through the constructor, so it can be tested
// with in-memory fakes and a fake clock (the test runner below builds them).
//
// enroll(userId, courseId) checks, in this order, and throws a DomainError at the first rule that fails:
//   1. the course does not exist                      -> DomainError("NotFound")
//   2. the course exists but is not published         -> DomainError("CourseNotPublished")
//   3. the learner is already enrolled in the course  -> DomainError("AlreadyEnrolled")
//   4. some prerequisites are not completed           -> DomainError("PrerequisiteMissing", { missing })
//      missing = every prerequisite id the learner has NOT completed, in the order of
//      course.prerequisiteIds. Completed means ProgressRepository.hasCompletedCourse returns true;
//      being enrolled in a prerequisite does not count.
// When every check passes, save { userId, courseId, enrolledAt } with enrolledAt = clock.now().toISOString()
// and return it. A failed enroll must not save anything.
//
// Write enroll. Do not change the types, DomainError, the interfaces or the test runner.

type Course = { id: string; title: string; prerequisiteIds: string[]; published: boolean };
type Enrollment = { userId: string; courseId: string; enrolledAt: string };

type DomainErrorKind = "NotFound" | "AlreadyEnrolled" | "PrerequisiteMissing" | "CourseNotPublished" | "ValidationFailed";

class DomainError extends Error {
    constructor(readonly kind: DomainErrorKind, readonly details: Record<string, unknown> = {}) {
        super(kind);
    }
}

interface CourseRepository {
    findById(courseId: string): Course | undefined;
}
interface EnrollmentRepository {
    find(userId: string, courseId: string): Enrollment | undefined;
    save(enrollment: Enrollment): void;
}
interface ProgressRepository {
    hasCompletedCourse(userId: string, courseId: string): boolean;
}
interface Clock {
    now(): Date;
}

class EnrollmentService {
    constructor(
        private readonly courses: CourseRepository,
        private readonly enrollments: EnrollmentRepository,
        private readonly progress: ProgressRepository,
        private readonly clock: Clock,
    ) {}

    enroll(userId: string, courseId: string): Enrollment {
        const course = this.courses.findById(courseId);
        if (!course) throw new DomainError("NotFound");
        if (!course.published) throw new DomainError("CourseNotPublished");
        if (this.enrollments.find(userId, courseId)) throw new DomainError("AlreadyEnrolled");
        const missing = course.prerequisiteIds.filter((id) => !this.progress.hasCompletedCourse(userId, id));
        if (missing.length > 0) throw new DomainError("PrerequisiteMissing", { missing });
        const enrollment = { userId, courseId, enrolledAt: this.clock.now().toISOString() };
        this.enrollments.save(enrollment);
        return enrollment;
    }
}

// ---- test runner (do not change)
type Op =
    | { op: "enroll"; userId: string; courseId: string }
    | { op: "complete"; userId: string; courseId: string }
    | { op: "advance"; seconds: number };
type Input = {
    now: string;
    courses: Course[];
    enrollments: Enrollment[];
    completions: { userId: string; courseId: string }[];
    ops: Op[];
};

const input: Input = JSON.parse(readFileSync(0, "utf8"));
const saved: Enrollment[] = input.enrollments.map((e) => ({ ...e }));
const done = new Set(input.completions.map((c) => `${c.userId}|${c.courseId}`));
let nowMs = Date.parse(input.now);
const service = new EnrollmentService(
    { findById: (id) => input.courses.find((c) => c.id === id) },
    {
        find: (u, c) => saved.find((e) => e.userId === u && e.courseId === c),
        save: (e) => { saved.push({ ...e }); },
    },
    { hasCompletedCourse: (u, c) => done.has(`${u}|${c}`) },
    { now: () => new Date(nowMs) },
);
const results: unknown[] = [];
for (const op of input.ops) {
    if (op.op === "advance") nowMs += op.seconds * 1000;
    else if (op.op === "complete") done.add(`${op.userId}|${op.courseId}`);
    else {
        try {
            results.push({ enrolled: service.enroll(op.userId, op.courseId) });
        } catch (e) {
            results.push(e instanceof DomainError ? { error: e.kind, ...e.details } : { crash: String(e) });
        }
    }
}
console.log(JSON.stringify({ results, enrollments: saved }));
