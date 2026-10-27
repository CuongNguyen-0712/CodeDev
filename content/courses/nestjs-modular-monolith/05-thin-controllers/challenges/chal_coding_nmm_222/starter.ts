import { readFileSync } from "node:fs";

// Thin controllers for the CodeDev API. In the NestJS app these are @Get/@Post handlers with @Query, @Body,
// @Param and @Req; the code runner has no NestJS, so a request is a plain object and so is the response.
// The service below is already written and tested: do not change it, the types or the test runner.

const LEVELS = ["beginner", "intermediate", "advanced"] as const;
type Level = (typeof LEVELS)[number];

type CourseRecord = {
    id: string;
    title: string;
    level: Level;
    priceVnd: number;
    published: boolean;
    internalNotes: string;
    authorPayoutPercent: number;
};
type EnrollmentRecord = { id: string; userId: string; courseId: string; status: "active"; createdAt: string; paymentRef: string | null };
type UserRecord = {
    id: string;
    email: string;
    displayName: string;
    avatarUrl: string | null;
    passwordHash: string;
    internalNotes: string;
    role: "learner" | "admin";
    createdAt: string;
};

type HttpRequest = { params: Record<string, string>; query: Record<string, string>; body: unknown; user: { id: string } };
type HttpResponse = { status: number; headers: Record<string, string>; body: unknown };

// ---------------------------------------------------------------- the service (already written, do not change)
class CatalogService {
    readonly calls: string[] = [];
    private nextEnrollment = 5001;

    constructor(private readonly courses: CourseRecord[], private readonly users: UserRecord[]) {}

    listCourses(input: { page: number; limit: number; level?: Level }): { items: CourseRecord[]; total: number } {
        this.calls.push(`listCourses(page=${input.page}, limit=${input.limit}, level=${input.level ?? "-"})`);
        const visible = this.courses.filter((c) => c.published && (input.level === undefined || c.level === input.level));
        const start = (input.page - 1) * input.limit;
        return { items: visible.slice(start, start + input.limit), total: visible.length };
    }

    enroll(input: { userId: string; courseId: string }): EnrollmentRecord {
        this.calls.push(`enroll(userId=${input.userId}, courseId=${input.courseId})`);
        const id = `e_${this.nextEnrollment++}`;
        return { id, userId: input.userId, courseId: input.courseId, status: "active", createdAt: "2026-10-26T09:00:00.000Z", paymentRef: `pay_int_${id}` };
    }

    getProfile(userId: string): UserRecord | null {
        this.calls.push(`getProfile(${userId})`);
        return this.users.find((u) => u.id === userId) ?? null;
    }
}

// ---------------------------------------------------------------- your controller
// Each handler maps the request, calls the service once, and maps the result. No business rules here:
// filtering, paging and enrolling are the service's job.
//
// GET /courses -> listCourses(req)
//   req.query values are strings. A key that is absent uses its default; any other value is checked:
//   page   default 1;  must be digits only (/^[0-9]+$/) and at least 1, else 400 "page must be a positive integer"
//   limit  default 20; must be digits only and at least 1, else 400 "limit must be a positive integer";
//          a limit above 50 becomes 50
//   level  optional;   must be exactly "beginner", "intermediate" or "advanced",
//          else 400 "level must be one of: beginner, intermediate, advanced"
//   Check page, then limit, then level; the first failure is the response. A 400 never calls the service.
//   200, headers { "X-Total-Count": String(total) },
//   body { items: [{ id, title, level, priceVnd }], page, limit, total } (page and limit as used)
//
// POST /enrollments -> enroll(req)
//   req.body must be an object (not null, not an array) whose courseId is a string,
//   else 400 "courseId is required". The learner is req.user.id - never a userId from the body.
//   201, headers { Location: "/enrollments/<id>" }, body { id, courseId, status, createdAt }
//
// GET /users/:id/profile -> getProfile(req)
//   req.params.id; when the service returns null: 404, headers {}, body { error: "user not found" }
//   200, headers {}, body { id, displayName, avatarUrl, joinedAt } (joinedAt = the user's createdAt)
//
// Every 400 is: headers {}, body { error: "<message>" }. Response bodies contain exactly the listed
// fields: never passwordHash, email, role, internalNotes, paymentRef, published or authorPayoutPercent.
class CodeDevController {
    constructor(private readonly service: CatalogService) {}

    listCourses(req: HttpRequest): HttpResponse {
        return { status: 501, headers: {}, body: null };
    }

    enroll(req: HttpRequest): HttpResponse {
        return { status: 501, headers: {}, body: null };
    }

    getProfile(req: HttpRequest): HttpResponse {
        return { status: 501, headers: {}, body: null };
    }
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { "courses"?: CourseRecord[], "generateCourses"?: n, "users"?: UserRecord[], "requests": [...] }.
// A request is { "route": "listCourses" | "enroll" | "getProfile", "query"?, "params"?, "body"?, "user"? }
// (user defaults to { "id": "u_1" }). For each request the runner prints the request, the response
// (status, headers, body - JSON keys sorted) and the service calls your handler made.
type RequestSpec = { route: "listCourses" | "enroll" | "getProfile"; query?: Record<string, string>; params?: Record<string, string>; body?: unknown; user?: { id: string } };
type Test = { courses?: CourseRecord[]; generateCourses?: number; users?: UserRecord[]; requests: RequestSpec[] };

function canon(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canon).join(",")}]`;
    if (value !== null && typeof value === "object") {
        const o = value as Record<string, unknown>;
        return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canon(o[k])}`).join(",")}}`;
    }
    return value === undefined ? "undefined" : JSON.stringify(value);
}

function generateCourses(n: number): CourseRecord[] {
    return Array.from({ length: n }, (_, i) => ({
        id: `c_${i + 1}`,
        title: `Course ${i + 1}`,
        level: LEVELS[i % 3],
        priceVnd: ((i * 7919) % 50) * 10000,
        published: i % 7 !== 3,
        internalNotes: `review notes ${i + 1}`,
        authorPayoutPercent: 70,
    }));
}

const test: Test = JSON.parse(readFileSync(0, "utf8"));
const service = new CatalogService(test.courses ?? generateCourses(test.generateCourses ?? 0), test.users ?? []);
const controller = new CodeDevController(service);
test.requests.forEach((r, i) => {
    const req: HttpRequest = { params: r.params ?? {}, query: r.query ?? {}, body: r.body, user: r.user ?? { id: "u_1" } };
    let line: string;
    if (r.route === "listCourses") {
        const qs = Object.entries(req.query).map(([k, v]) => `${k}=${v}`).join("&");
        line = `GET /courses${qs ? `?${qs}` : ""}`;
    } else if (r.route === "enroll") {
        line = `POST /enrollments (user ${req.user.id}) ${JSON.stringify(req.body)}`;
    } else {
        line = `GET /users/${req.params.id}/profile`;
    }
    service.calls.length = 0;
    let out: string;
    try {
        const res = controller[r.route](req);
        out = `${res.status} headers=${canon(res.headers)} body=${canon(res.body)}`;
    } catch (error) {
        out = `threw ${error instanceof Error ? error.message : String(error)}`;
    }
    console.log(`#${i + 1} ${line}`);
    console.log(`   -> ${out}`);
    console.log(`   service: ${service.calls.length ? service.calls.join("; ") : "(not called)"}`);
});
