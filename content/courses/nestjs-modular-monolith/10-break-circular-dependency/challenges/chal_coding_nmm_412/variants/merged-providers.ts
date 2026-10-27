import { readFileSync } from "node:fs";

// Break the Circular Dependency. The CodeDev API does not boot since PR #731 ("enrollments: block
// enrolling before prerequisites are completed"):
//   Nest cannot create the EnrollmentModule instance. The module at index [0] of the
//   EnrollmentModule "imports" array is undefined. ... Scope [AppModule -> CourseModule]
// CourseModule imports EnrollmentModule because the catalog shows how many learners each course has.
// PR #731 made EnrollmentModule import CourseModule, because enrolling checks the prerequisites
// of the course. Each module now needs the other one.
//
// Restructure the modules so that the import graph has no cycle and the behaviour stays the same:
// - Enrollments depend on courses, not the other way round: EnrollmentModule may import
//   CourseModule, CourseModule must not import EnrollmentModule (directly or through another module).
// - Keep AppModule, CourseModule (exports CourseService) and EnrollmentModule (exports
//   EnrollmentService), and keep CourseService.catalog(), EnrollmentService.enroll() and
//   EnrollmentService.complete() with their current results and error messages.
// - The learner counts in the catalog must always match the enrollments: one EnrollmentRepository
//   for the whole app.
// You may add classes and modules. forwardRef() does not exist here: the architecture rule forbids it.
// Do not change the module container or the test runner below.

type Course = { id: string; title: string; prerequisites: string[] };
type Enrollment = { userId: string; courseId: string; completed: boolean };
type CatalogEntry = { id: string; title: string; learners: number };

// courses/course.repository.ts
class CourseRepository {
    private readonly courses: Course[] = [
        { id: "ts-basics", title: "TypeScript Basics", prerequisites: [] },
        { id: "nest-intro", title: "NestJS Fundamentals", prerequisites: ["ts-basics"] },
        { id: "nest-arch", title: "NestJS Modular Monolith", prerequisites: ["nest-intro", "sql-basics"] },
        { id: "sql-basics", title: "SQL & Data Modeling", prerequisites: [] },
    ];

    findAll(): Course[] {
        return this.courses.map((course) => ({ ...course, prerequisites: [...course.prerequisites] }));
    }

    findById(id: string): Course | undefined {
        const course = this.courses.find((c) => c.id === id);
        return course && { ...course, prerequisites: [...course.prerequisites] };
    }
}

// enrollments/enrollment.repository.ts
class EnrollmentRepository {
    private readonly rows: Enrollment[] = [
        { userId: "u1", courseId: "ts-basics", completed: true },
        { userId: "u2", courseId: "ts-basics", completed: false },
        { userId: "u3", courseId: "sql-basics", completed: true },
    ];

    find(userId: string, courseId: string): Enrollment | undefined {
        const row = this.rows.find((r) => r.userId === userId && r.courseId === courseId);
        return row && { ...row };
    }

    add(userId: string, courseId: string): void {
        this.rows.push({ userId, courseId, completed: false });
    }

    markCompleted(userId: string, courseId: string): void {
        const row = this.rows.find((r) => r.userId === userId && r.courseId === courseId);
        if (row) row.completed = true;
    }

    countByCourse(courseId: string): number {
        return this.rows.filter((r) => r.courseId === courseId).length;
    }
}

// courses/course.service.ts
class CourseService {
    constructor(
        private readonly courses: CourseRepository,
        private readonly enrollments: EnrollmentService,
    ) {}

    catalog(): CatalogEntry[] {
        return this.courses.findAll().map((course) => ({
            id: course.id,
            title: course.title,
            learners: this.enrollments.countLearners(course.id),
        }));
    }

    getCourse(id: string): Course {
        const course = this.courses.findById(id);
        if (!course) throw new Error(`course ${id} not found`);
        return course;
    }
}

// enrollments/enrollment.service.ts
class EnrollmentService {
    constructor(
        private readonly enrollments: EnrollmentRepository,
        private readonly courses: CourseService,
    ) {}

    countLearners(courseId: string): number {
        return this.enrollments.countByCourse(courseId);
    }

    enroll(userId: string, courseId: string): void {
        const course = this.courses.getCourse(courseId);
        if (this.enrollments.find(userId, courseId)) throw new Error(`${userId} is already enrolled in ${courseId}`);
        for (const required of course.prerequisites) {
            if (!this.enrollments.find(userId, required)?.completed) {
                throw new Error(`${courseId} requires ${required} to be completed first`);
            }
        }
        this.enrollments.add(userId, courseId);
    }

    complete(userId: string, courseId: string): void {
        if (!this.enrollments.find(userId, courseId)) throw new Error(`${userId} is not enrolled in ${courseId}`);
        this.enrollments.markCompleted(userId, courseId);
    }
}

// Modules (what @Module({ ... }) says in courses/course.module.ts, enrollments/enrollment.module.ts, app.module.ts)
class CourseModule {}
class EnrollmentModule {}
class AppModule {}

// Everything moved into CourseModule: no module cycle any more, but the services still need each other.
Module(CourseModule, {
    providers: [
        CourseRepository,
        EnrollmentRepository,
        { provide: CourseService, inject: [CourseRepository, EnrollmentService] },
        { provide: EnrollmentService, inject: [EnrollmentRepository, CourseService] },
    ],
    exports: [CourseService, EnrollmentService],
});
Module(EnrollmentModule, { imports: [CourseModule] });
Module(AppModule, { imports: [CourseModule, EnrollmentModule] });

// ------------------------------------------------------------ module container (do not change)
// A small stand-in for @nestjs/core that follows the same rules for modules and providers:
// - Module(target, { imports, providers, exports }) plays the role of the @Module() decorator.
// - A provider is a class without dependencies, or { provide: Class, inject: [...] } with the
//   classes its constructor needs, in constructor order (Nest reads them from the parameter types).
// - A provider can inject a provider of its own module, or a provider that one of the modules it
//   imports exports. Anything else fails like Nest's "can't resolve dependencies" error.
// - exports lists provider classes of the module itself.
// - Each module creates one instance of each of its providers (singletons). The same class listed
//   in the providers of two modules gives two separate instances, as in Nest.
// - The import graph must not have a cycle, and providers must not need each other in a cycle.
//   There is no forwardRef(): the architecture rule of this codebase forbids it.
type Class = new (...args: any[]) => object;
type Provider = Class | { provide: Class; inject: Class[] };
type ModuleMetadata = { imports?: Class[]; providers?: Provider[]; exports?: Class[] };
type ProviderRecord = { inject: Class[]; instance?: object; resolving?: boolean };
type ModuleRef = { name: string; imports: ModuleRef[]; providers: Map<Class, ProviderRecord>; exports: Set<Class> };

function Module(target: Class, metadata: ModuleMetadata): void {
    Object.defineProperty(target, "moduleMetadata", { value: metadata });
}

function bootstrap(root: Class) {
    const refs = new Map<Class, ModuleRef>();
    const order: ModuleRef[] = [];
    const constructed = new Map<string, number>();

    const scan = (target: Class, scope: Class[]): ModuleRef => {
        const done = refs.get(target);
        if (done) return done;
        const metadata = (target as unknown as { moduleMetadata?: ModuleMetadata }).moduleMetadata;
        if (!metadata) throw new Error(`${target.name} is not a module: describe it with Module(${target.name}, { ... })`);
        const path = [...scope, target];
        const imports = (metadata.imports ?? []).map((imported, index) => {
            const start = path.indexOf(imported);
            if (start >= 0) {
                const cycle = [...path.slice(start), imported].map((m) => m.name).join(" -> ");
                throw new Error(`Nest cannot create the ${target.name} instance. The module at index [${index}] of the ${target.name} "imports" array closes a cycle: ${cycle}. Scope [${scope.map((m) => m.name).join(" -> ")}]`);
            }
            return scan(imported, path);
        });
        const providers = new Map<Class, ProviderRecord>();
        for (const provider of metadata.providers ?? []) {
            if ("provide" in provider) providers.set(provider.provide, { inject: provider.inject });
            else providers.set(provider, { inject: [] });
        }
        for (const exported of metadata.exports ?? []) {
            if (!providers.has(exported)) {
                throw new Error(`Nest cannot export a provider/module that is not a part of the currently processed module (${target.name}). Please verify whether the exported ${exported.name} is available in this particular context.`);
            }
        }
        const ref: ModuleRef = { name: target.name, imports, providers, exports: new Set(metadata.exports ?? []) };
        refs.set(target, ref);
        order.push(ref);
        return ref;
    };

    const instantiate = (ref: ModuleRef, token: Class, chain: string[]): object => {
        const record = ref.providers.get(token) as ProviderRecord;
        if (record.instance) return record.instance;
        if (record.resolving) {
            const cycle = [...chain.slice(chain.indexOf(token.name)), token.name].join(" -> ");
            throw new Error(`A circular dependency has been detected between providers: ${cycle}.`);
        }
        record.resolving = true;
        const args = record.inject.map((dependency, index) => {
            if (ref.providers.has(dependency)) return instantiate(ref, dependency, [...chain, token.name]);
            const owner = ref.imports.find((imported) => imported.exports.has(dependency));
            if (owner) return instantiate(owner, dependency, [...chain, token.name]);
            const signature = record.inject.map((d, i) => (i === index ? "?" : d.name)).join(", ");
            throw new Error(`Nest can't resolve dependencies of the ${token.name} (${signature}). Please make sure that the argument ${dependency.name} at index [${index}] is available in the ${ref.name} context.`);
        });
        record.instance = new token(...args);
        record.resolving = false;
        constructed.set(token.name, (constructed.get(token.name) ?? 0) + 1);
        return record.instance;
    };

    scan(root, []);
    for (const ref of order) for (const token of ref.providers.keys()) instantiate(ref, token, []);

    return {
        modules: order.map((ref) => ref.name),
        instances: (name: string): number => constructed.get(name) ?? 0,
        get<T>(token: new (...args: any[]) => T): T {
            for (const ref of order) {
                const record = ref.providers.get(token as unknown as Class);
                if (record?.instance) return record.instance as T;
            }
            throw new Error(`Nest could not find ${token.name} element (this provider does not exist in the current context)`);
        },
    };
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: a list of operations. The runner boots AppModule, prints the order in which CourseModule,
// EnrollmentModule and AppModule were initialised, then runs each operation and prints one line:
//   "catalog"                      -> every course as "<id> <learners>"
//   "enroll <userId> <courseId>"   -> "ok" or "error <message>"
//   "complete <userId> <courseId>" -> "ok" or "error <message>"
//   "bulk <n> <courseId>"          -> enrolls users b1..bn: "ok <n>" or the first error
//   "instances"                    -> how many instances of each repository and service were created
function main(): void {
    const operations: string[] = JSON.parse(readFileSync(0, "utf8"));
    let app: ReturnType<typeof bootstrap>;
    try {
        app = bootstrap(AppModule);
    } catch (error) {
        console.log(`boot: error ${(error as Error).message}`);
        return;
    }
    const watched = ["CourseModule", "EnrollmentModule", "AppModule"];
    console.log(`boot: ok, init order ${app.modules.filter((name) => watched.includes(name)).join(" -> ")}`);
    const courses = app.get(CourseService);
    const enrollments = app.get(EnrollmentService);
    for (const operation of operations) {
        const [command, first, second] = operation.trim().split(/\s+/);
        let result: string;
        try {
            if (command === "catalog") {
                result = courses.catalog().map((entry) => `${entry.id} ${entry.learners}`).join(", ");
            } else if ((command === "enroll" || command === "complete") && first && second) {
                if (command === "enroll") enrollments.enroll(first, second);
                else enrollments.complete(first, second);
                result = "ok";
            } else if (command === "bulk" && Number.isInteger(Number(first)) && second) {
                for (let i = 1; i <= Number(first); i++) enrollments.enroll(`b${i}`, second);
                result = `ok ${Number(first)}`;
            } else if (command === "instances") {
                result = ["CourseRepository", "EnrollmentRepository", "CourseService", "EnrollmentService"]
                    .map((name) => `${name} ${app.instances(name)}`).join(", ");
            } else {
                result = `error unknown operation "${operation}"`;
            }
        } catch (error) {
            result = `error ${(error as Error).message}`;
        }
        console.log(`${operation}: ${result}`);
    }
}
main();
