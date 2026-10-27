// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-nmm-3-3",
    title: "Repositories & the persistence boundary: when an abstraction pays off",
    slug: { _type: "slug", current: "repositories-persistence-boundary" },
    description:
        "A migration inside EnrollmentModule broke the leaderboard, the admin export and the progress page, because three other modules imported its ORM entity and wrote their own queries. Learn the repository as a port owned by the domain module, the PostgreSQL implementation as an adapter, an in-memory implementation for tests, injection tokens for interfaces in NestJS, why ORM entities must not cross module boundaries, and when the abstraction is not worth it.",
    estimatedTime: 20,

    scenario: {
        role: "Backend developer, CodeDev API (EnrollmentModule)",
        problem:
            "PR #1302 replaced the status column of enrollments with cancelled_at (NULL means active), so cancellations keep their date. The migration ran, tsc passed, EnrollmentModule's tests passed. Ten minutes after the deploy, GET /leaderboard/courses answered 500 with \"column e.status does not exist\", the admin CSV export of a course's learners came back empty, and the progress page counted cancelled learners as active. None of those modules had changed in the PR. All three imported EnrollmentEntity from src/enrollments and queried the enrollments table themselves.",
    },

    content: [
        h2("1. The incident: a private change with public consequences"),
        p("EnrollmentModule owns the `enrollments` table (lesson 1.1), and PR #1302 changed it the careful way: a migration, the entity, the repository and the module's tests in one commit. The trouble was elsewhere. Over a year, other modules had found a shortcut to the same data:"),
        code("typescript", `
// src/leaderboard/leaderboard.service.ts
import { EnrollmentEntity } from "../enrollments/enrollment.entity";     // another module's ORM entity

async learnersPerCourse() {
    return this.dataSource.getRepository(EnrollmentEntity)
        .createQueryBuilder("e")
        .select("e.courseId", "courseId").addSelect("COUNT(*)", "learners")
        .where("e.status = :status", { status: "active" })                 // a column name in a string
        .groupBy("e.courseId")
        .getRawMany();
}`, "leaderboard.service.ts"),
        p("No compiler can check the string `\"e.status = :status\"`, and no test in EnrollmentModule runs this query. The entity was meant to describe the table for EnrollmentModule's own repository. Once other modules imported it, the shape of the table became a public API that nobody had agreed to maintain."),

        h2("2. Read the evidence"),
        p("Start with the error, then find everyone who depends on the thing that changed:"),
        code("text", `
[Nest] 41  - 10/22/2026, 10:14:03 AM   ERROR [ExceptionsHandler] column e.status does not exist
QueryFailedError: column e.status does not exist
    at PostgresQueryRunner.query (node_modules/typeorm/driver/postgres/PostgresQueryRunner.js)
    at LeaderboardService.learnersPerCourse (src/leaderboard/leaderboard.service.ts:31:22)`, "API log"),
        code("bash", `
$ grep -rln "enrollment.entity" src --include=*.ts | grep -v "^src/enrollments/"
src/leaderboard/leaderboard.service.ts
src/admin/course-export.service.ts
src/progress/progress-overview.service.ts

$ grep -rn "status" src/admin/course-export.service.ts src/progress/progress-overview.service.ts
src/admin/course-export.service.ts:44:      where: { courseId, status: "active" as any },
src/progress/progress-overview.service.ts:19:  // learners = all enrollments of the course (status checked by EnrollmentModule?)`, "terminal"),
        p("Three modules, three different failures: a raw SQL fragment that crashes, a cast to `any` that silenced the compiler and now matches nothing, and a query that never filtered at all and now counts cancelled learners. The bug is not in any of the three lines. It is that the knowledge \"what makes an enrollment active\" lives in four places instead of one."),

        h2("3. Core idea: the module owns a port, the database is an adapter"),
        p("A **repository** gives the domain code a collection-like way to load and store its objects without knowing how they are stored. In a modular monolith, the important word is **owns**: the repository belongs to the module that owns the table, and it speaks that module's language."),
        bullets([
            "**The port** is an interface written by the domain module, in domain terms: `findByUserAndCourse`, `create`, `save`, `countActiveByCourse`. It takes and returns plain domain types (`Enrollment`), never ORM entities, query builders or connection objects. It lives next to the service that uses it.",
            "**The adapter** implements the port for one technology. `PgEnrollmentRepository` uses TypeORM and PostgreSQL; it is the only file that knows the entity, the column names and that \"active\" now means `cancelled_at IS NULL`. It maps rows to domain objects on the way out.",
            "**A second adapter for tests.** `InMemoryEnrollmentRepository` implements the same port with a `Map`, so the enrollment and progress rules from the last two lessons run in milliseconds without a database.",
            "**Other modules never see either.** EnrollmentModule exports `EnrollmentService` (lesson 1.3), with a method such as `countActiveByCourse()`. The leaderboard asks the service; it does not get the repository, the entity or the table.",
        ]),
        p("With that boundary, PR #1302 would have changed the adapter and nothing else: the port's `countActiveByCourse` keeps its meaning, the adapter's SQL changes from `status = 'active'` to `cancelled_at IS NULL`, and EnrollmentModule's tests cover both."),
        h3("When the abstraction does not pay off"),
        p("A repository interface is a layer, and a layer has a price: one more file per module, mapping code between rows and domain objects, and a fake that must keep behaving like the real thing. It pays off when there is something to protect. It often does not:"),
        bullets([
            "**Simple CRUD.** An admin module for course tags whose service forwards every call to the database (create, rename, delete, list) has no rules to test without the database. An interface, an adapter and a fake would mirror the ORM line for line. Inject the ORM repository or query builder directly and test it against a real PostgreSQL.",
            "**One query builder used everywhere, on purpose.** Some teams standardise on Prisma, Drizzle or Kysely for the whole codebase and run their tests against a real database in a container. Wrapping that client in a repository per module adds code without adding a boundary that anyone needs. The module boundary still applies: only the owning module queries its tables.",
            "**A generic `Repository<T>`.** `findById`, `findAll`, `save`, `delete` for every type is the ORM again, under another name. If the port has no method in domain terms, it is not protecting anything.",
        ]),
        p("The rule of thumb: use a port when the module has **domain rules worth testing without a database** (enrollment, progress) or when its storage is **likely to change behind a stable meaning** (the status column). Skip it for thin CRUD. Either way, never let another module touch the table or the entity."),

        h2("4. Worked example: the enrollment port in NestJS"),
        p("The port and its token live in the domain folder and import nothing from TypeORM:"),
        code("typescript", `
// src/enrollments/enrollment.repository.ts - the port
export type Enrollment = { id: string; userId: string; courseId: string; status: "active" | "cancelled" };

export interface EnrollmentRepository {
    findByUserAndCourse(userId: string, courseId: string): Promise<Enrollment | null>;
    create(userId: string, courseId: string): Promise<Enrollment>;
    save(enrollment: Enrollment): Promise<void>;
    countActiveByCourse(): Promise<Map<string, number>>;
}

export const ENROLLMENT_REPOSITORY = Symbol("ENROLLMENT_REPOSITORY");`, "enrollment.repository.ts"),
        h3("Why the token"),
        p("Nest resolves constructor dependencies from the type metadata TypeScript emits for decorated classes. An interface has no runtime value, so for `constructor(private readonly enrollments: EnrollmentRepository)` the emitted type is `Object`, and Nest fails at startup with \"Nest can't resolve dependencies of the EnrollmentService (?)... the argument Object at index [0]\". A **token** gives the dependency a runtime name: the module registers an implementation under it, and the constructor asks for it with `@Inject()`. Lesson 1.2 used an abstract class instead, which is a type and a token at once; both work. A symbol token keeps the port a pure type and lets you register several implementations of one interface under different tokens."),
        code("typescript", `
// src/enrollments/persistence/pg-enrollment.repository.ts - the adapter (not exported from the module)
@Injectable()
export class PgEnrollmentRepository implements EnrollmentRepository {
    constructor(@InjectRepository(EnrollmentEntity) private readonly rows: Repository<EnrollmentEntity>) {}

    async findByUserAndCourse(userId: string, courseId: string): Promise<Enrollment | null> {
        const row = await this.rows.findOneBy({ userId, courseId });
        return row ? toDomain(row) : null;
    }

    async countActiveByCourse(): Promise<Map<string, number>> {
        const rows = await this.rows.createQueryBuilder("e")
            .select("e.courseId", "courseId").addSelect("COUNT(*)::int", "learners")
            .where("e.cancelledAt IS NULL")                                   // the meaning of "active" lives here
            .groupBy("e.courseId").getRawMany<{ courseId: string; learners: number }>();
        return new Map(rows.map((r) => [r.courseId, r.learners]));
    }
    // create and save: insert / update, then toDomain
}

function toDomain(row: EnrollmentEntity): Enrollment {
    return { id: row.id, userId: row.userId, courseId: row.courseId, status: row.cancelledAt ? "cancelled" : "active" };
}`, "pg-enrollment.repository.ts"),
        code("typescript", `
// src/enrollments/enrollment.module.ts
@Module({
    imports: [TypeOrmModule.forFeature([EnrollmentEntity]), CourseModule],
    controllers: [EnrollmentController],
    providers: [
        EnrollmentService,
        { provide: ENROLLMENT_REPOSITORY, useClass: PgEnrollmentRepository },
    ],
    exports: [EnrollmentService],              // not the token, not the entity
})
export class EnrollmentModule {}

// src/enrollments/enrollment.service.ts
@Injectable()
export class EnrollmentService {
    constructor(
        @Inject(ENROLLMENT_REPOSITORY) private readonly enrollments: EnrollmentRepository,
        private readonly courses: CourseService,
    ) {}

    countActiveByCourse(): Promise<Map<string, number>> {
        return this.enrollments.countActiveByCourse();          // what LeaderboardService calls now
    }
    // enroll(): the rules from lesson 3.1
}`, "enrollment.module.ts"),
        p("The in-memory adapter is small, and it follows the same rules as the database: it returns copies, as rows read from PostgreSQL are, and it refuses a second enrollment for the same learner and course, as the unique constraint does:"),
        code("typescript", `
// src/enrollments/testing/in-memory-enrollment.repository.ts
export class InMemoryEnrollmentRepository implements EnrollmentRepository {
    private readonly rows = new Map<string, Enrollment>();
    private nextId = 1;

    async findByUserAndCourse(userId: string, courseId: string) {
        const row = [...this.rows.values()].find((e) => e.userId === userId && e.courseId === courseId);
        return row ? { ...row } : null;
    }
    async create(userId: string, courseId: string) {
        if (await this.findByUserAndCourse(userId, courseId)) throw new UniqueViolationError("enrollments_user_course_key");
        const row: Enrollment = { id: \`enr_\${this.nextId++}\`, userId, courseId, status: "active" };
        this.rows.set(row.id, row);
        return { ...row };
    }
    async save(enrollment: Enrollment) { this.rows.set(enrollment.id, { ...enrollment }); }
    async countActiveByCourse() { /* count rows with status "active" per courseId */ return new Map<string, number>(); }
}`, "in-memory-enrollment.repository.ts"),
        p("A unit test builds the service by hand with the fake (lesson 1.2). A module test keeps the real wiring and swaps only the adapter, by overriding the token:"),
        code("typescript", `
const moduleRef = await Test.createTestingModule({ imports: [EnrollmentModule] })
    .overrideProvider(ENROLLMENT_REPOSITORY).useValue(new InMemoryEnrollmentRepository())
    .overrideProvider(CourseService).useValue(fakeCourses)
    .compile();
const service = moduleRef.get(EnrollmentService);`, "enrollment.module.spec.ts"),

        challenge("chal_quiz_nmm_331"),

        h2("5. How to verify the boundary"),
        bullets([
            "**One contract suite, two adapters.** Write the repository tests once as a function that receives a factory, and run it against `InMemoryEnrollmentRepository` in every test run and against `PgEnrollmentRepository` with a real PostgreSQL in CI. If the fake and the database disagree (copies, duplicates, the meaning of \"active\"), the suite catches it before a service test passes for the wrong reason.",
            "**No entity outside its module.** The `grep` from section 2 must print nothing. Make it permanent with a lint rule: ESLint `no-restricted-imports` with a pattern such as `**/enrollments/persistence/**` and `**/*.entity`, or a dependency-cruiser rule that forbids imports into another module's folder except its public files.",
            "**The port has no ORM imports.** `grep -n \"typeorm\" src/enrollments/enrollment.repository.ts src/enrollments/enrollment.service.ts` prints nothing: only the adapter and the module file know the ORM.",
            "**Repeat the incident.** Rename the column again in a branch: only files under `src/enrollments/` should need changes, and the contract suite against PostgreSQL should fail until the adapter is updated.",
        ]),

        h2("6. Common mistakes"),
        bullets([
            "**An interface without a token.** It compiles, then the app fails at startup with \"argument Object at index [0]\". Spot it by that error message, or by a constructor parameter typed with an interface and no `@Inject()`.",
            "**A port that returns ORM entities.** `findByUserAndCourse(): Promise<EnrollmentEntity>` hands lazy relations, column names and TypeORM types to every caller; the boundary exists on paper only. Spot it when the port file imports from `typeorm` or from an `.entity` file.",
            "**Exporting the repository or the entity from the module.** `exports: [ENROLLMENT_REPOSITORY]` or `TypeOrmModule` re-exported lets other modules skip the service and its rules. Spot it in the module's `exports` array: services, not repositories.",
            "**A fake that is kinder than the database.** An in-memory repository that returns its stored objects (so mutations stick without `save`) or accepts duplicates makes broken services pass. Spot it with the shared contract suite.",
            "**An abstraction for a module with no rules.** A port, an adapter and a fake for a CRUD module whose service forwards every call. Spot it when every service method is one line and every test checks that a mock was called.",
        ]),

        h2("7. Summary"),
        bullets([
            "The repository is a port owned by the module that owns the table: an interface in domain terms that returns domain objects. The PostgreSQL implementation is an adapter that alone knows the entity and the columns; an in-memory adapter runs the rules in tests.",
            "Interfaces do not exist at runtime, so NestJS needs a token: register `{ provide: ENROLLMENT_REPOSITORY, useClass: PgEnrollmentRepository }`, inject with `@Inject(ENROLLMENT_REPOSITORY)`, swap it with `overrideProvider` in tests, and export the service, never the repository or the entity.",
            "Use the abstraction where there are rules to test or storage likely to change behind a stable meaning; skip it for thin CRUD or when one query builder is used everywhere on purpose. Never let another module query your table.",
        ]),

        h2("Sources"),
        bullets([
            "NestJS documentation: Custom providers, non-class-based provider tokens (docs.nestjs.com/fundamentals/custom-providers)",
            "NestJS documentation: Testing, overriding providers (docs.nestjs.com/fundamentals/testing) and Database, repository pattern (docs.nestjs.com/techniques/database)",
            "Martin Fowler, Patterns of Enterprise Application Architecture: Repository",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Write the contract suite for EnrollmentRepository as a function enrollmentRepositoryContract(makeRepository) with five tests (create then find, a copy is returned, save persists a change, a second create for the same learner and course fails, countActiveByCourse ignores cancelled rows), and run it against the in-memory adapter. Then list which ProgressModule queries would move behind ProgressRepository and which would become calls to EnrollmentService."),
    ],
});
