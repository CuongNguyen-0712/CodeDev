import { readFileSync } from "node:fs";

// Reference solution (internal).

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
    private rows = new Map<string, Enrollment>();
    private nextId = 1;

    create(input: NewEnrollment): Enrollment {
        for (const row of this.rows.values()) {
            if (row.userId === input.userId && row.courseId === input.courseId) {
                throw new DuplicateEnrollmentError(input.userId, input.courseId);
            }
        }
        const row: Enrollment = { ...input, id: `e${this.nextId++}` };
        this.rows.set(row.id, row);
        return { ...row };
    }

    findById(id: string): Enrollment | null {
        const row = this.rows.get(id);
        return row ? { ...row } : null;
    }

    findByUser(userId: string): Enrollment[] {
        // Map keeps insertion order and sort is stable, so ties stay in creation order.
        return [...this.rows.values()]
            .filter((row) => row.userId === userId)
            .sort((a, b) => Date.parse(a.enrolledAt) - Date.parse(b.enrolledAt))
            .map((row) => ({ ...row }));
    }

    update(id: string, changes: EnrollmentChanges): Enrollment | null {
        const row = this.rows.get(id);
        if (!row) return null;
        const updated: Enrollment = { ...row, ...changes, id: row.id };
        this.rows.set(id, updated);
        return { ...updated };
    }

    delete(id: string): boolean {
        return this.rows.delete(id);
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
