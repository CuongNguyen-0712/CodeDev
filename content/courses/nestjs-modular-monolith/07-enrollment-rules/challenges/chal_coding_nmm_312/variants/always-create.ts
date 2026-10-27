import { readFileSync } from "node:fs";

// EnrollmentService.enroll(userId, courseId) for the CodeDev API (POST /enrollments).
// In the real API the service gets its repositories from NestJS by constructor injection and they are backed by
// PostgreSQL. Here they are in-memory fakes with the same methods. Like rows read from a database, every object a
// repository returns is a copy: changing it changes nothing until you pass it to save().
//
// Rules, checked in this order:
//   1. the course must exist                                   -> throw new CourseNotFoundError(courseId)
//   2. an ACTIVE enrollment of this user in this course exists -> return it, outcome "existing"
//      (idempotent: a retried or double-clicked request gets the same answer, whatever changed since)
//   3. the course must be published                            -> throw new CourseNotPublishedError(courseId)
//   4. every prerequisite course must be completed by the user -> throw new PrerequisitesMissingError(courseId, missing)
//      with ALL the missing ones, in the order of course.prerequisites
//   5. a premium course needs an entitlement for this user     -> throw new EntitlementRequiredError(courseId)
//   6. a CANCELLED enrollment exists -> set its status to "active", save it, return it, outcome "reactivated"
//      (same id: there is never a second row for one user and one course)
//   7. otherwise create one with enrollments.create(userId, courseId), outcome "created"
//
// Do not change the types, the error classes, the repositories or the test runner.

type Course = { id: string; published: boolean; premium: boolean; prerequisites: string[] };
type EnrollmentStatus = "active" | "cancelled";
type Enrollment = { id: string; userId: string; courseId: string; status: EnrollmentStatus };
type EnrollResult = { outcome: "created" | "existing" | "reactivated"; enrollment: Enrollment };

class DomainError extends Error {
    code: string;
    constructor(code: string, message: string) {
        super(message);
        this.code = code;
    }
}
class CourseNotFoundError extends DomainError {
    constructor(courseId: string) {
        super("course_not_found", `Course ${courseId} does not exist`);
    }
}
class CourseNotPublishedError extends DomainError {
    constructor(courseId: string) {
        super("course_not_published", `Course ${courseId} is not open for enrollment`);
    }
}
class PrerequisitesMissingError extends DomainError {
    missing: string[];
    constructor(courseId: string, missing: string[]) {
        super("prerequisites_missing", `Complete ${missing.join(", ")} before enrolling in ${courseId}`);
        this.missing = missing;
    }
}
class EntitlementRequiredError extends DomainError {
    constructor(courseId: string) {
        super("entitlement_required", `Course ${courseId} needs a purchase or a subscription`);
    }
}

interface CourseRepository {
    findById(courseId: string): Course | undefined;
}
interface EnrollmentRepository {
    findByUserAndCourse(userId: string, courseId: string): Enrollment | undefined;
    create(userId: string, courseId: string): Enrollment;
    save(enrollment: Enrollment): void;
}
interface CompletionReader {
    hasCompleted(userId: string, courseId: string): boolean;
}
interface EntitlementReader {
    hasEntitlement(userId: string, courseId: string): boolean;
}

class EnrollmentService {
    private readonly courses: CourseRepository;
    private readonly enrollments: EnrollmentRepository;
    private readonly completions: CompletionReader;
    private readonly entitlements: EntitlementReader;

    constructor(
        courses: CourseRepository,
        enrollments: EnrollmentRepository,
        completions: CompletionReader,
        entitlements: EntitlementReader,
    ) {
        this.courses = courses;
        this.enrollments = enrollments;
        this.completions = completions;
        this.entitlements = entitlements;
    }

    enroll(userId: string, courseId: string): EnrollResult {
        const course = this.courses.findById(courseId);
        if (!course) throw new CourseNotFoundError(courseId);

        const current = this.enrollments.findByUserAndCourse(userId, courseId);

        if (!course.published) throw new CourseNotPublishedError(courseId);

        const missing = course.prerequisites.filter((id) => !this.completions.hasCompleted(userId, id));
        if (missing.length > 0) throw new PrerequisitesMissingError(courseId, missing);

        if (course.premium && !this.entitlements.hasEntitlement(userId, courseId)) {
            throw new EntitlementRequiredError(courseId);
        }

        if (current) {
            const reactivated: Enrollment = { ...current, status: "active" };
            this.enrollments.save(reactivated);
            return { outcome: "reactivated", enrollment: reactivated };
        }
        return { outcome: "created", enrollment: this.enrollments.create(userId, courseId) };
    }
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { "courses": Course[], "completions": [userId, courseId][], "entitlements": [userId, courseId][],
//          "enrollments": Enrollment[], "operations": [{ "op": "enroll" | "cancel", "userId", "courseId" }],
//          "summary"?: true }
// "cancel" is done by the runner directly on the repository (another endpoint owns it).
// Prints one line per operation, then every enrollment row ordered by id. With "summary": true it prints only
// how many operations ended with each outcome or error code, and the number of active and cancelled rows.
type Pair = [string, string];
type Operation = { op: "enroll" | "cancel"; userId: string; courseId: string };
type Test = {
    courses: Course[];
    completions: Pair[];
    entitlements: Pair[];
    enrollments: Enrollment[];
    operations: Operation[];
    summary?: boolean;
};

class InMemoryCourseRepository implements CourseRepository {
    private readonly rows = new Map<string, Course>();
    constructor(courses: Course[]) {
        for (const c of courses) this.rows.set(c.id, { ...c, prerequisites: [...c.prerequisites] });
    }
    findById(courseId: string): Course | undefined {
        const c = this.rows.get(courseId);
        return c ? { ...c, prerequisites: [...c.prerequisites] } : undefined;
    }
}

class InMemoryEnrollmentRepository implements EnrollmentRepository {
    readonly rows = new Map<string, Enrollment>();
    private nextId: number;
    constructor(seed: Enrollment[]) {
        for (const e of seed) this.rows.set(e.id, { ...e });
        this.nextId = seed.length + 1;
    }
    findByUserAndCourse(userId: string, courseId: string): Enrollment | undefined {
        for (const e of this.rows.values()) if (e.userId === userId && e.courseId === courseId) return { ...e };
        return undefined;
    }
    create(userId: string, courseId: string): Enrollment {
        const e: Enrollment = { id: `enr_${String(this.nextId++).padStart(3, "0")}`, userId, courseId, status: "active" };
        this.rows.set(e.id, e);
        return { ...e };
    }
    save(enrollment: Enrollment): void {
        if (!this.rows.has(enrollment.id)) throw new Error(`save: no enrollment ${enrollment.id}`);
        this.rows.set(enrollment.id, { ...enrollment });
    }
}

const pairSet = (pairs: Pair[]) => new Set(pairs.map(([u, c]) => `${u}|${c}`));

const test: Test = JSON.parse(readFileSync(0, "utf8"));
const completed = pairSet(test.completions);
const entitled = pairSet(test.entitlements);
const repo = new InMemoryEnrollmentRepository(test.enrollments);
const service = new EnrollmentService(
    new InMemoryCourseRepository(test.courses),
    repo,
    { hasCompleted: (u, c) => completed.has(`${u}|${c}`) },
    { hasEntitlement: (u, c) => entitled.has(`${u}|${c}`) },
);

const counts = new Map<string, number>();
for (const op of test.operations) {
    let line: string;
    let kind: string;
    if (op.op === "cancel") {
        const e = [...repo.rows.values()].find((r) => r.userId === op.userId && r.courseId === op.courseId);
        if (e && e.status === "active") {
            e.status = "cancelled";
            line = kind = "cancelled";
            line += ` ${e.id}`;
        } else line = kind = "nothing to cancel";
    } else {
        try {
            const { outcome, enrollment } = service.enroll(op.userId, op.courseId);
            kind = outcome;
            line = `${outcome} ${enrollment.id} ${enrollment.status}`;
        } catch (error) {
            if (error instanceof DomainError) {
                line = kind = `error ${error.code}`;
                if (error instanceof PrerequisitesMissingError) line += ` [${error.missing.join(", ")}]`;
            } else {
                kind = "unexpected error";
                line = `unexpected error: ${error instanceof Error ? error.message : String(error)}`;
            }
        }
    }
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
    if (!test.summary) console.log(`${op.op} ${op.userId} ${op.courseId} -> ${line}`);
}
const rows = [...repo.rows.values()].sort((a, b) => a.id.localeCompare(b.id));
if (test.summary) {
    const parts = [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, n]) => `${k}: ${n}`);
    const active = rows.filter((r) => r.status === "active").length;
    console.log(`${test.operations.length} operations; ${parts.join("; ")}`);
    console.log(`rows: ${rows.length} (${active} active, ${rows.length - active} cancelled)`);
} else {
    console.log("enrollments:");
    for (const r of rows) console.log(`${r.id} ${r.userId} ${r.courseId} ${r.status}`);
}
