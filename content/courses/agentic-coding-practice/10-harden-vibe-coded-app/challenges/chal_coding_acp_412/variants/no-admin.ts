import { readFileSync } from "node:fs";

// Spot the AI Mistake: an admin API without an owner check.
// The request sent to the coding agent on Friday evening was:
//   "Add an edit endpoint for courses in the course studio. Only instructors can edit.
//    Keep it simple, the demo is on Monday."
// The agent wrote updateCourse() below and three tests: the owner edits her own course (200),
// an anonymous request gets 401, a learner gets 403. They pass, the demo went well, it was merged.
//
// On Monday instructor Binh changed the title of a course that belongs to instructor Ana, and Ana's
// course "Indexes in Practice" disappeared from her dashboard after a request from Binh whose body
// contained "ownerId".
//
// Fix updateCourse so that it follows the policy in the challenge description.
// Do not change the fixtures or the test runner.

type Role = "learner" | "instructor" | "admin";
type User = { id: string; role: Role };
type Course = { id: string; ownerId: string; title: string; description: string; price: number; createdAt: string };
type ApiRequest = { user: User | null; params: { id: string }; body: unknown };
type ApiResponse = { status: number; body: Record<string, unknown> };

// The only fields an instructor may change with PATCH; id, ownerId and createdAt are never editable here.
const EDITABLE = new Set(["title", "description", "price"]);

// PATCH /api/courses/:id - the course studio's "Save" button.
function updateCourse(req: ApiRequest, courses: Map<string, Course>): ApiResponse {
    if (!req.user) return { status: 401, body: { error: "unauthenticated" } };
    if (req.user.role !== "instructor" && req.user.role !== "admin") {
        return { status: 403, body: { error: "forbidden" } };
    }
    const body = req.body;
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
        return { status: 400, body: { error: "invalid_body" } };
    }
    const course = courses.get(req.params.id);
    if (!course || course.ownerId !== req.user.id) {
        return { status: 404, body: { error: "not_found" } };
    }

    const changes = body as Record<string, unknown>;
    for (const [field, value] of Object.entries(changes)) {
        if (!EDITABLE.has(field)) return { status: 400, body: { error: "field_not_editable", field } };
        if (field === "title" && (typeof value !== "string" || value.trim() === "")) return invalid(field);
        if (field === "description" && typeof value !== "string") return invalid(field);
        if (field === "price" && (typeof value !== "number" || !Number.isInteger(value) || value < 0)) return invalid(field);
    }
    const updated = { ...course, ...changes } as Course;
    courses.set(course.id, updated);
    return { status: 200, body: updated };
}

function invalid(field: string): ApiResponse {
    return { status: 400, body: { error: "invalid_field", field } };
}

// ---------------------------------------------------------------- fixtures (do not change)
// Sessions as the auth middleware resolves them: session token -> user.
const SESSIONS = new Map<string, User>([
    ["sess_ana", { id: "u_ana", role: "instructor" }],
    ["sess_binh", { id: "u_binh", role: "instructor" }],
    ["sess_lan", { id: "u_lan", role: "learner" }],
    ["sess_admin", { id: "u_admin", role: "admin" }],
]);

function seedCourses(): Map<string, Course> {
    const rows: Course[] = [
        { id: "c_101", ownerId: "u_ana", title: "SQL for Beginners", description: "Tables, SELECT and WHERE.", price: 99000, createdAt: "2026-09-01" },
        { id: "c_102", ownerId: "u_ana", title: "Indexes in Practice", description: "B-trees and query plans.", price: 149000, createdAt: "2026-09-15" },
        { id: "c_201", ownerId: "u_binh", title: "Docker Basics", description: "Images and containers.", price: 0, createdAt: "2026-10-02" },
    ];
    return new Map(rows.map((c) => [c.id, c]));
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: a list of requests { "session": "sess_binh" | null, "courseId": "c_101", "body": { ... } }.
// An unknown or missing session is an anonymous request. Prints one line per request, then the store.
type Step = { session?: string | null; courseId: string; body?: unknown };
const SHOWN = ["id", "ownerId", "title", "description", "price", "createdAt"];

function main(): void {
    const steps: Step[] = JSON.parse(readFileSync(0, "utf8"));
    const courses = seedCourses();
    steps.forEach((step, i) => {
        const user = SESSIONS.get(step.session ?? "") ?? null;
        const body = "body" in step ? step.body : {};
        const res = updateCourse({ user, params: { id: step.courseId }, body }, courses);
        const detail = res.status === 200 ? "ok" : `${String(res.body.error)}${res.body.field ? ` (${String(res.body.field)})` : ""}`;
        console.log(`#${i + 1} PATCH /api/courses/${step.courseId} as ${user ? user.id : "anonymous"}: ${res.status} ${detail}`);
    });
    for (const key of [...courses.keys()].sort()) {
        const c = courses.get(key) as Course;
        const extra = Object.keys(c).filter((k) => !SHOWN.includes(k));
        console.log(
            `${key}: id=${c.id} owner=${c.ownerId} title=${JSON.stringify(c.title)} description=${JSON.stringify(c.description)} ` +
                `price=${c.price} createdAt=${c.createdAt}${extra.length ? ` extra=${extra.join(",")}` : ""}`,
        );
    }
}
main();
