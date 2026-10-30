import { readFileSync } from "node:fs";

// CodeDev backend: CoursesModule and EnrollmentsModule, rebuilt in plain TypeScript (the runner has
// no npm packages). MODULES below plays the role of the @Module() decorators, and the test runner at
// the bottom is a tiny Nest-style container: it checks module boundaries (lesson 3), then creates
// every provider through constructor injection.
//
// Two rules make the services call each other:
//   - archiving a course is refused while the course has active enrollments (CourseService.archive);
//   - enrolling is refused when the course is not published (EnrollmentService.enroll).
// Without forwardRef the app did not boot: "Nest can't resolve dependencies of ...". A teammate added
// forwardRef on CourseService. The app boots and enrolling works, but archiving crashes with a TypeError.
//
// Fix the design so that neither the provider graph nor the module import graph has a cycle
// (a forwardRef dependency still counts as an edge), and every rule still holds:
//   enroll(userId, courseId, at): NotFound if the course does not exist, CourseNotPublished if it is
//     not published, AlreadyEnrolled if the learner has an active enrollment; otherwise it saves an
//     active enrollment (enrolledAt = at; a cancelled one becomes active again) and returns "enrolled".
//   cancel(userId, courseId): NotFound unless the learner has an active enrollment; otherwise it marks
//     it cancelled and returns "cancelled".
//   archive(courseId): NotFound if the course does not exist, HasActiveEnrollments if it has at least
//     one active enrollment; otherwise it saves the course with published false and archived true and
//     returns "archived".
// Prerequisites are lesson 7's job and are not checked here.
//
// You may change the services, MODULES and ROUTES and add providers and modules (ROUTES says which
// provider handles each operation, like the controller that injects it). Keep the providers
// CourseRepository and EnrollmentRepository with their methods: the runner seeds them.
// Do not change the types, forwardRef, DomainError, the repositories or the test runner.

type Course = { id: string; title: string; prerequisiteIds: string[]; published: boolean; archived: boolean };
type Enrollment = { userId: string; courseId: string; enrolledAt: number; status: "active" | "cancelled" };
type DomainErrorKind = "NotFound" | "AlreadyEnrolled" | "CourseNotPublished" | "HasActiveEnrollments";

type ForwardRef = { forwardRef: string };
const forwardRef = (token: string): ForwardRef => ({ forwardRef: token });
// create receives the resolved deps in order; a forwardRef dep arrives as a function that returns it.
type ProviderDef = { token: string; deps: (string | ForwardRef)[]; create: (...deps: any[]) => object };
type ModuleDef = { name: string; providers: ProviderDef[]; imports: string[]; exports: string[] };

class DomainError extends Error {
    constructor(readonly kind: DomainErrorKind) {
        super(kind);
    }
}

class CourseRepository {
    private readonly rows = new Map<string, Course>();
    find(id: string): Course | undefined {
        const row = this.rows.get(id);
        return row && { ...row };
    }
    save(course: Course): void {
        this.rows.set(course.id, { ...course });
    }
}

class EnrollmentRepository {
    private readonly rows = new Map<string, Enrollment>();
    find(userId: string, courseId: string): Enrollment | undefined {
        const row = this.rows.get(`${userId}:${courseId}`);
        return row && { ...row };
    }
    save(enrollment: Enrollment): void {
        this.rows.set(`${enrollment.userId}:${enrollment.courseId}`, { ...enrollment });
    }
    listByCourse(courseId: string): Enrollment[] {
        return [...this.rows.values()].filter((e) => e.courseId === courseId).map((e) => ({ ...e }));
    }
}

// ---- CoursesModule
class CourseService {
    private readonly enrollments: EnrollmentService;

    constructor(enrollments: () => EnrollmentService, private readonly courses: CourseRepository) {
        this.enrollments = enrollments(); // forwardRef: the container hands us a getter
    }

    get(courseId: string): Course {
        const course = this.courses.find(courseId);
        if (!course) throw new DomainError("NotFound");
        return course;
    }

    archive(courseId: string): string {
        const course = this.get(courseId);
        if (this.enrollments.countActive(courseId) > 0) throw new DomainError("HasActiveEnrollments");
        this.courses.save({ ...course, published: false, archived: true });
        return "archived";
    }
}

// ---- EnrollmentsModule
class EnrollmentService {
    constructor(private readonly courses: CourseService, private readonly enrollments: EnrollmentRepository) {}

    enroll(userId: string, courseId: string, at: number): string {
        const course = this.courses.get(courseId);
        if (!course.published) throw new DomainError("CourseNotPublished");
        if (this.enrollments.find(userId, courseId)?.status === "active") throw new DomainError("AlreadyEnrolled");
        this.enrollments.save({ userId, courseId, enrolledAt: at, status: "active" });
        return "enrolled";
    }

    cancel(userId: string, courseId: string): string {
        const enrollment = this.enrollments.find(userId, courseId);
        if (!enrollment || enrollment.status !== "active") throw new DomainError("NotFound");
        this.enrollments.save({ ...enrollment, status: "cancelled" });
        return "cancelled";
    }

    countActive(courseId: string): number {
        return this.enrollments.listByCourse(courseId).filter((e) => e.status === "active").length;
    }
}

const MODULES: ModuleDef[] = [
    {
        name: "CoursesModule",
        imports: ["EnrollmentsModule"],
        exports: ["CourseService"],
        providers: [
            { token: "CourseRepository", deps: [], create: () => new CourseRepository() },
            {
                token: "CourseService",
                deps: [forwardRef("EnrollmentService"), "CourseRepository"],
                create: (enrollments, courses) => new CourseService(enrollments, courses),
            },
        ],
    },
    {
        name: "EnrollmentsModule",
        imports: ["CoursesModule"],
        exports: ["EnrollmentService"],
        providers: [
            { token: "EnrollmentRepository", deps: [], create: () => new EnrollmentRepository() },
            {
                token: "EnrollmentService",
                deps: ["CourseService", "EnrollmentRepository"],
                create: (courses, enrollments) => new EnrollmentService(courses, enrollments),
            },
        ],
    },
];

const ROUTES: Record<"enroll" | "cancel" | "archive", string> = {
    enroll: "EnrollmentService",
    cancel: "EnrollmentService",
    archive: "CourseService",
};

// ---------------------------------------------------------------- test runner (do not change)
const tokenOf = (dep: string | ForwardRef): string => (typeof dep === "string" ? dep : dep.forwardRef);
const providers = MODULES.flatMap((m) => m.providers.map((p) => ({ ...p, module: m })));
const byToken = new Map(providers.map((p) => [p.token, p]));

function findCycle(nodes: string[], next: (node: string) => string[]): string[] | null {
    const state = new Map<string, "open" | "done">();
    const path: string[] = [];
    const visit = (node: string): string[] | null => {
        if (state.get(node) === "open") return [...path.slice(path.indexOf(node)), node];
        if (state.get(node) === "done") return null;
        state.set(node, "open");
        path.push(node);
        for (const n of next(node)) {
            const cycle = visit(n);
            if (cycle) return cycle;
        }
        path.pop();
        state.set(node, "done");
        return null;
    };
    for (const node of nodes) {
        const cycle = visit(node);
        if (cycle) return cycle;
    }
    return null;
}

function boot(): Map<string, object> {
    for (const p of providers) {
        for (const dep of p.deps.map(tokenOf)) {
            const owner = byToken.get(dep)?.module;
            if (!owner) throw new Error(`${p.token} depends on ${dep}, which no module provides`);
            if (owner !== p.module && !(p.module.imports.includes(owner.name) && owner.exports.includes(dep)))
                throw new Error(`${p.module.name} cannot inject ${dep}: ${owner.name} must export it and ${p.module.name} must import ${owner.name}`);
        }
    }
    const instances = new Map<string, object>();
    const resolving: string[] = [];
    const resolve = (token: string): object => {
        const existing = instances.get(token);
        if (existing) return existing;
        const p = byToken.get(token)!;
        resolving.push(token);
        const args = p.deps.map((dep, i) => {
            if (typeof dep !== "string") return () => instances.get(dep.forwardRef);
            if (resolving.includes(dep)) {
                const shown = p.deps.map((d, j) => (j === i ? "?" : tokenOf(d))).join(", ");
                const cycle = [...resolving.slice(resolving.indexOf(dep)), dep].join(" -> ");
                throw new Error(`Nest can't resolve dependencies of the ${token} (${shown}): ${cycle}`);
            }
            return resolve(dep);
        });
        resolving.pop();
        const instance = p.create(...args);
        instances.set(token, instance);
        return instance;
    };
    for (const p of providers) resolve(p.token);
    return instances;
}

type Op = { op: "enroll" | "cancel" | "archive"; userId?: string; courseId: string; at?: number };
const input: { courses: Course[]; enrollments?: Enrollment[]; ops: Op[]; inspect?: boolean } = JSON.parse(readFileSync(0, "utf8"));
const out: Record<string, unknown> = {};
try {
    const app = boot();
    const courseRepository = app.get("CourseRepository") as CourseRepository;
    const enrollmentRepository = app.get("EnrollmentRepository") as EnrollmentRepository;
    for (const c of input.courses) courseRepository.save({ ...c, prerequisiteIds: [], archived: false });
    for (const e of input.enrollments ?? []) enrollmentRepository.save(e);
    out.boot = "ok";
    out.results = input.ops.map((op) => {
        const handler: any = app.get(ROUTES[op.op]);
        try {
            if (op.op === "enroll") return handler.enroll(op.userId, op.courseId, op.at);
            if (op.op === "cancel") return handler.cancel(op.userId, op.courseId);
            return handler.archive(op.courseId);
        } catch (e) {
            return e instanceof DomainError ? e.kind : (e as Error).name;
        }
    });
} catch (e) {
    out.boot = (e as Error).message;
}
if (input.inspect) {
    out.providerCycle = findCycle(providers.map((p) => p.token), (t) => (byToken.get(t)?.deps ?? []).map(tokenOf));
    out.moduleCycle = findCycle(MODULES.map((m) => m.name), (n) => MODULES.find((m) => m.name === n)?.imports ?? []);
}
console.log(JSON.stringify(out));
