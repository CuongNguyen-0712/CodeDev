import { readFileSync } from "node:fs";

// CodeDev enrollments: access to a premium course lasts 30 days from the moment the learner enrolls.
// The old EnrollmentService did `new PgEnrollmentRepository()` and `new Date()` inside its methods,
// so it could only be tested against a real database, and its tests failed when the nightly run
// crossed midnight. Write it again so that everything it depends on comes in through the constructor.
//
// new EnrollmentService(repo, clock):
//   keep both and use them for everything. Never create a repository and never read the current
//   time with new Date() or Date.now(): the time is clock.now(). (new Date(milliseconds) to build
//   a date from a number is fine.) Read enrollments from repo every time: other code (an admin tool)
//   can change the repository between two calls, so do not keep your own copy.
//
// enroll(userId, courseId): Enrollment
//   - userId or courseId empty or only spaces: throw an Error and save nothing.
//   - the learner already has access to the course (see hasAccess): return that enrollment
//     unchanged and save nothing.
//   - otherwise (no enrollment, or an expired one): save and return a new enrollment with
//     enrolledAt = now and expiresAt = now + ACCESS_DAYS days, both as toISOString() strings.
//
// hasAccess(userId, courseId): boolean
//   true when the repository has an enrollment for the pair and now is before expiresAt.
//   At exactly expiresAt, access has ended.
//
// daysLeft(userId, courseId): number
//   0 without access; otherwise the time until expiresAt in days, rounded up to a whole day
//   (30 right after enrolling, still 30 one hour later, 1 when less than a day is left).
//
// Plain TypeScript, no Nest: the test runner calls the constructor itself, the way a unit test does,
// so EnrollmentRepository and Clock can stay interfaces here.
// Do not change the types, the constants or the test runner.

type Enrollment = { userId: string; courseId: string; enrolledAt: string; expiresAt: string };

interface EnrollmentRepository {
    findOne(userId: string, courseId: string): Enrollment | undefined;
    save(enrollment: Enrollment): void; // inserts, or replaces the enrollment with the same userId and courseId
}

interface Clock {
    now(): Date;
}

const ACCESS_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

class EnrollmentService {
    constructor(
        private readonly repo: EnrollmentRepository,
        private readonly clock: Clock,
    ) {}

    enroll(userId: string, courseId: string): Enrollment {
        if (userId.trim() === "" || courseId.trim() === "") {
            throw new Error("userId and courseId are required");
        }
        const current = this.repo.findOne(userId, courseId);
        const now = this.clock.now();
        if (current && now.getTime() < Date.parse(current.expiresAt)) return current;
        const enrollment: Enrollment = {
            userId,
            courseId,
            enrolledAt: now.toISOString(),
            expiresAt: new Date(now.getTime() + ACCESS_DAYS * DAY_MS).toISOString(),
        };
        this.repo.save(enrollment);
        return enrollment;
    }

    hasAccess(userId: string, courseId: string): boolean {
        return this.daysLeft(userId, courseId) > 0;
    }

    daysLeft(userId: string, courseId: string): number {
        const current = this.repo.findOne(userId, courseId);
        if (!current) return 0;
        const remaining = Date.parse(current.expiresAt) - this.clock.now().getTime();
        return remaining > 0 ? Math.floor(remaining / DAY_MS) : 0;
    }
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { now, existing, operations }. The runner builds the service with an in-memory repository
// that already holds the "existing" enrollments, and a fixed clock that starts at "now" and moves
// only on "advance". "revoke" deletes an enrollment straight from the repository, like an admin tool.
// Output: one line per enroll / hasAccess / daysLeft call, and how many times save() was called.
type Operation =
    | { op: "enroll" | "hasAccess" | "daysLeft" | "revoke"; userId: string; courseId: string }
    | { op: "advance"; hours: number };

type Input = { now: string; existing: Enrollment[]; operations: Operation[] };

class InMemoryEnrollmentRepository implements EnrollmentRepository {
    readonly rows = new Map<string, Enrollment>();
    saves = 0;
    findOne(userId: string, courseId: string): Enrollment | undefined {
        const row = this.rows.get(`${userId}|${courseId}`);
        return row ? { ...row } : undefined;
    }
    save(enrollment: Enrollment): void {
        this.saves++;
        this.rows.set(`${enrollment.userId}|${enrollment.courseId}`, { ...enrollment });
    }
}

class FixedClock implements Clock {
    private time: number;
    constructor(iso: string) {
        this.time = Date.parse(iso);
    }
    now(): Date {
        return new Date(this.time);
    }
    advance(hours: number): void {
        this.time += hours * 60 * 60 * 1000;
    }
}

const input: Input = JSON.parse(readFileSync(0, "utf8"));
const repo = new InMemoryEnrollmentRepository();
for (const e of input.existing) repo.rows.set(`${e.userId}|${e.courseId}`, { ...e });
const clock = new FixedClock(input.now);
const service = new EnrollmentService(repo, clock);

const results: string[] = [];
for (const o of input.operations) {
    if (o.op === "advance") {
        clock.advance(o.hours);
        continue;
    }
    const pair = `${o.userId}/${o.courseId}`;
    if (o.op === "revoke") {
        repo.rows.delete(`${o.userId}|${o.courseId}`);
    } else if (o.op === "enroll") {
        try {
            const e = service.enroll(o.userId, o.courseId);
            results.push(`enroll ${pair}: ${e.enrolledAt} -> ${e.expiresAt}`);
        } catch {
            results.push(`enroll ${pair}: error`);
        }
    } else if (o.op === "hasAccess") {
        results.push(`access ${pair}: ${service.hasAccess(o.userId, o.courseId)}`);
    } else {
        results.push(`days ${pair}: ${service.daysLeft(o.userId, o.courseId)}`);
    }
}
console.log(JSON.stringify({ results, saves: repo.saves }));
