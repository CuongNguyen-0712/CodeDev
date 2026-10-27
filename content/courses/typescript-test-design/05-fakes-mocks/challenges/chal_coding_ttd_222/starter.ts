import { readFileSync } from "node:fs";

// CodeDev enrollments: a fake repository for fast service tests.
//
// EnrollmentService (below) is tested against PostgresEnrollmentRepository in CI, which needs a
// database and takes minutes. Write FakeEnrollmentRepository, an in-memory implementation of the
// same EnrollmentRepository interface that keeps the same contract as the real one:
//   create(input)     stores a copy of the row with a new id "e1", "e2", ... (a counter that is never
//                     reused, even after a delete) and returns a copy. Like the unique constraint
//                     enrollments_user_course_key, a second row with the same (userId, courseId) -
//                     whatever its status - is refused: throw new DuplicateEnrollmentError(userId, courseId).
//   findById(id)      a copy of the row, or null.
//   findByUser(userId) copies of that user's rows, oldest enrolledAt first; rows with the same
//                     enrolledAt in creation order. [] when there are none.
//   update(id, changes) applies status and/or progress (an empty object changes nothing) and returns a
//                     copy of the updated row, or null when the id does not exist.
//   delete(id)        idempotent: true when a row was removed, false when there was none. Never throws.
// "A copy" means a caller that changes a returned object (or the object it passed to create) must not
// change what the repository stores - just like a row read from PostgreSQL.
// The real repository is async; this exercise uses a synchronous interface to keep the runner small.
// Do not change the types, the interface, DuplicateEnrollmentError, the service or the test runner.

type EnrollmentStatus = "active" | "completed" | "cancelled";
type Enrollment = {
    id: string;
    userId: string;
    courseId: string;
    status: EnrollmentStatus;
    progress: number;
    enrolledAt: string;
};
type NewEnrollment = Omit<Enrollment, "id">;
type EnrollmentChanges = Partial<Pick<Enrollment, "status" | "progress">>;

interface EnrollmentRepository {
    create(input: NewEnrollment): Enrollment;
    findById(id: string): Enrollment | null;
    findByUser(userId: string): Enrollment[];
    update(id: string, changes: EnrollmentChanges): Enrollment | null;
    delete(id: string): boolean;
}

class DuplicateEnrollmentError extends Error {
    constructor(userId: string, courseId: string) {
        super(`duplicate key value violates unique constraint "enrollments_user_course_key" (${userId}, ${courseId})`);
        this.name = "DuplicateEnrollmentError";
    }
}

class FakeEnrollmentRepository implements EnrollmentRepository {
    create(input: NewEnrollment): Enrollment {
        return { ...input, id: "" };
    }

    findById(id: string): Enrollment | null {
        return null;
    }

    findByUser(userId: string): Enrollment[] {
        return [];
    }

    update(id: string, changes: EnrollmentChanges): Enrollment | null {
        return null;
    }

    delete(id: string): boolean {
        return false;
    }
}

// ---------------------------------------------------------------- service under test (do not change)
// The same EnrollmentService runs in production against PostgresEnrollmentRepository.
type EnrollResult = { ok: true; enrollment: Enrollment } | { ok: false; error: "already_enrolled" };

class EnrollmentService {
    private repo: EnrollmentRepository;
    private clock: { now(): Date };

    constructor(repo: EnrollmentRepository, clock: { now(): Date }) {
        this.repo = repo;
        this.clock = clock;
    }

    enroll(userId: string, courseId: string): EnrollResult {
        try {
            const enrollment = this.repo.create({
                userId, courseId, status: "active", progress: 0, enrolledAt: this.clock.now().toISOString(),
            });
            return { ok: true, enrollment };
        } catch (error) {
            if (error instanceof DuplicateEnrollmentError) return { ok: false, error: "already_enrolled" };
            throw error;
        }
    }

    recordProgress(id: string, progress: number): Enrollment | null {
        const current = this.repo.findById(id);
        if (!current || current.status === "cancelled") return null;
        const value = Math.max(current.progress, Math.min(100, Math.round(progress)));
        return this.repo.update(id, { progress: value, status: value === 100 ? "completed" : current.status });
    }

    cancel(id: string): Enrollment | null {
        return this.repo.update(id, { status: "cancelled" });
    }

    leave(id: string): boolean {
        return this.repo.delete(id);
    }

    dashboard(userId: string): string[] {
        return this.repo.findByUser(userId)
            .filter((e) => e.status !== "cancelled")
            .map((e) => `${e.courseId} ${e.progress}% ${e.status}`);
    }
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: a list of steps run in order against one EnrollmentService that uses your fake.
//   { "op": "enroll", "user", "course", "at" }  the fake clock reads "at" during this step
//   { "op": "progress", "id", "value" } | { "op": "cancel", "id" } | { "op": "leave", "id" }
//   { "op": "dashboard", "user" }
//   { "op": "tamper", "id" }  a caller changes every object the repository gave it, then reads again
type Step = { op: string; user?: string; course?: string; at?: string; id?: string; value?: number };

const steps: Step[] = JSON.parse(readFileSync(0, "utf8"));
const repo = new FakeEnrollmentRepository();
let now = new Date("2026-10-01T00:00:00Z");
const service = new EnrollmentService(repo, { now: () => new Date(now.getTime()) });
const show = (e: Enrollment | null): string => (e ? `${e.id} ${e.courseId} ${e.progress}% ${e.status}` : "not found");

for (const s of steps) {
    let line: string;
    try {
        switch (s.op) {
            case "enroll": {
                now = new Date(s.at!);
                const r = service.enroll(s.user!, s.course!);
                line = r.ok ? `${r.enrollment.id} ${r.enrollment.enrolledAt}` : r.error;
                if (r.ok) r.enrollment.progress = 55; // the caller edits its copy
                break;
            }
            case "progress": line = show(service.recordProgress(s.id!, s.value!)); break;
            case "cancel": line = show(service.cancel(s.id!)); break;
            case "leave": line = String(service.leave(s.id!)); break;
            case "dashboard": line = service.dashboard(s.user!).join(", ") || "(empty)"; break;
            case "tamper": {
                const one = repo.findById(s.id!);
                if (!one) { line = "not found"; break; }
                one.progress = 999;
                for (const e of repo.findByUser(one.userId)) e.status = "cancelled";
                const changed = repo.update(s.id!, {});
                if (changed) changed.courseId = "tampered";
                line = show(repo.findById(s.id!));
                break;
            }
            default: line = "unknown step";
        }
    } catch (error) {
        line = `threw ${error instanceof Error ? error.name : String(error)}`;
    }
    console.log(`${s.op} ${s.id ?? `${s.user ?? ""}${s.course ? ` ${s.course}` : ""}`}: ${line}`);
}
