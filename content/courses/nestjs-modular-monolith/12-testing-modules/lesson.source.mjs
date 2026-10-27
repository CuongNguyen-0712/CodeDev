// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-nmm-4-3",
    title: "Testing modules: unit tests with fakes, integration tests with the testing module",
    slug: { _type: "slug", current: "testing-modules-unit-fakes-integration-testing-module" },
    description:
        "The API had 214 green unit tests and still shipped a release that could not boot, a validation hole that made an admin, and a duplicate enrollment. Learn what each level of test can and cannot see: unit tests with fakes passed to constructors, Test.createTestingModule with overrideProvider for the module wiring, integration tests against a real PostgreSQL in CI with Testcontainers, and an e2e test of one route with supertest - and how to choose the cheapest test that would have caught each incident.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer, CodeDev learning platform",
        problem:
            "At the incident review for the boot failure and the profile update that granted admin rights, the engineering lead asks one question: \"Our CI ran 214 tests on both PRs and all of them passed. Which test would have failed?\" You own the answer: a test plan for the CodeDev API that says which level of test catches which kind of bug, and what each level costs in CI.",
    },

    content: [
        h2("1. The incident: 214 green tests"),
        p("Every service in the CodeDev API has unit tests, and they are good tests: fast, readable, written with fakes passed to constructors as in lesson 1.2. Yet the last month produced four incidents. Lay them next to the kinds of test you could write:"),
        code("text", `
Incident                                          unit    testing  integration  e2e
                                                  fakes   module   PostgreSQL   HTTP
Progress went from 80% back to 40% (3.2)          yes     yes      yes          yes
A learner enrolled twice in one course (3.1)      no      no       yes          yes*
The release could not boot: module cycle (4.1)   no      yes      yes**        yes
isAdmin written through PATCH /profile (4.2)      no      no       no           yes

*  only with two concurrent requests   ** only if it compiles the module graph`, "which test would have failed?"),
        p("The progress rule lives entirely in one service method, so a unit test sees it. The other three bugs live **between** pieces: in the module graph, in the database constraint, in the global pipe configured in `main.ts`. A unit test replaces exactly those pieces with fakes, so it cannot see them. That is not a flaw of unit tests; it is the price of their speed. The answer to the lead's question is to know what each level can see, and to buy the expensive levels only where the cheap ones are blind."),

        h2("2. Core idea: four levels, four questions"),
        bullets([
            "**Unit test with fakes:** \"Does this rule give the right answer?\" Builds one class with `new`, passes fakes to its constructor. Milliseconds. Blind to wiring, SQL, HTTP.",
            "**Testing module** (`Test.createTestingModule`): \"Do these modules wire together?\" Builds the real module graph with Nest's container, swaps the edges you choose with `overrideProvider`. Catches cycles, missing exports and imports, wrong tokens. Still no database.",
            "**Integration test against PostgreSQL:** \"Does my repository do what the database will really do?\" Runs real SQL, migrations, unique indexes, transactions and locks. Seconds per file.",
            "**End-to-end test over HTTP** (supertest): \"Does this route behave for a client?\" Runs the app with its global pipes, guards and filters: status codes, validation messages, serialization.",
        ]),
        p("Keep most tests at the bottom: rules change often and unit tests are cheap to keep. Add one testing-module test per module plus one that boots `AppModule`, integration tests for each repository method that relies on the database (constraints, transactions, queries with joins), and a few e2e tests per route for the contract a client depends on: the happy path, validation, authorization."),
        callout("info", "When not to go up a level",
            "Do not start a PostgreSQL container to test a pure function, and do not test a pricing rule through HTTP: a failure there tells you less and takes longer to find. Go up a level only for a question the level below cannot answer. The other way round, do not mock what you do not own: a fake TypeORM query builder that returns what you expect proves nothing about the SQL."),

        h2("3. Unit tests: fakes through the constructor"),
        p("Because `EnrollmentService` receives its dependencies in the constructor, a test can hand it anything with the same methods. No Nest, no database:"),
        code("typescript", `
// enrollments/enrollment.service.spec.ts
class InMemoryEnrollmentRepository {
  private rows: Enrollment[] = [];
  async find(userId: string, courseId: string) { return this.rows.find((r) => r.userId === userId && r.courseId === courseId); }
  async add(userId: string, courseId: string) { this.rows.push({ userId, courseId, completedAt: null }); }
  async markCompleted(userId: string, courseId: string) { const r = await this.find(userId, courseId); if (r) r.completedAt = new Date(0); }
}

const courses: Pick<CourseService, "getCourse"> = {
  getCourse: async (id) => ({ id, title: id, prerequisites: id === "nest-intro" ? ["ts-basics"] : [] }),
};

it("refuses an enrollment until the prerequisite is completed", async () => {
  const repo = new InMemoryEnrollmentRepository();
  const service = new EnrollmentService(repo as unknown as EnrollmentRepository, courses as CourseService);

  await repo.add("u1", "ts-basics");
  await expect(service.enroll("u1", "nest-intro")).rejects.toThrow(PrerequisiteNotMetError);

  await repo.markCompleted("u1", "ts-basics");
  await expect(service.enroll("u1", "nest-intro")).resolves.toBeUndefined();
});`, "enrollment.service.spec.ts"),
        p("This is the right test for the prerequisite rule: every branch can be reached in a few lines, and it runs in milliseconds. It also shows its limits plainly: the fake has no unique index, and the test built the service with `new`, so it says nothing about `EnrollmentModule`."),

        h2("4. The testing module: real wiring, chosen fakes"),
        p("`Test.createTestingModule()` takes the same metadata as `@Module()` and builds it with Nest's real container. `overrideProvider(token)` replaces one provider **wherever it is declared** in that graph, so you keep the wiring and swap only the edge to the outside world:"),
        code("typescript", `
// enrollments/enrollment.module.spec.ts
import { Test } from "@nestjs/testing";

it("wires EnrollmentModule with CourseModule and enforces prerequisites", async () => {
  const moduleRef = await Test.createTestingModule({ imports: [EnrollmentModule] })
    .overrideProvider(EnrollmentRepository).useValue(new InMemoryEnrollmentRepository())
    .overrideProvider(CourseRepository).useValue(new InMemoryCourseRepository(seedCourses))
    .compile();

  const enrollments = moduleRef.get(EnrollmentService);
  await expect(enrollments.enroll("u1", "nest-intro")).rejects.toThrow(PrerequisiteNotMetError);
  await moduleRef.close();
});

// test/app.boot.spec.ts - the test that would have failed on PR #731
it("boots the whole module graph", async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DataSource).useValue(fakeDataSource)
    .compile();
  await moduleRef.close();
});`, "testing-module tests"),
        p("The first test fails if `EnrollmentModule` stops importing `CourseModule`, if `CourseModule` stops exporting `CourseService`, or if a cycle appears, because `compile()` resolves every constructor exactly as the running app would. Use `useValue` for a ready object, `useClass` for a fake class Nest should construct, and `useFactory` when the fake needs other providers. Override the edges (repositories, HTTP clients, clocks, mailers), never the class you are testing."),
        p("Overrides only reach dependencies that come from the container. A service that creates its own repository with `new` inside its constructor cannot be overridden, which is one more reason constructor injection is the rule in this course."),

        challenge("chal_quiz_nmm_431"),

        h2("5. Integration tests: a real PostgreSQL in CI"),
        p("The last line of defence against the duplicate enrollment of lesson 3.1 is a unique index on `(user_id, course_id)`, and an in-memory fake has no unique index. Only a real database can show that two concurrent enrollments end with one row. Testcontainers starts a throwaway PostgreSQL in Docker for the test file, so every developer and every CI run gets the same clean database:"),
        code("typescript", `
// enrollments/enrollment.repository.int-spec.ts
import { PostgreSqlContainer, StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { DataSource } from "typeorm";

let container: StartedPostgreSqlContainer;
let dataSource: DataSource;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:17-alpine").start();
  dataSource = new DataSource({
    type: "postgres",
    url: container.getConnectionUri(),
    entities: [CourseEntity, EnrollmentEntity],
    migrations: ["src/migrations/*.ts"],     // the same migrations production runs
  });
  await dataSource.initialize();
  await dataSource.runMigrations();
}, 60_000);

afterAll(async () => {
  await dataSource.destroy();
  await container.stop();
});

beforeEach(() => dataSource.query("TRUNCATE enrollments RESTART IDENTITY CASCADE"));

it("keeps one enrollment when the same learner enrolls twice at once", async () => {
  const repo = new EnrollmentRepository(dataSource);
  const results = await Promise.allSettled([repo.add("u1", "nest-intro"), repo.add("u1", "nest-intro")]);

  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(await repo.countByCourse("nest-intro")).toBe(1);
});`, "enrollment.repository.int-spec.ts"),
        p("Run migrations, not `synchronize: true`: the test should see the schema production has. Start one container per test file (or per CI job) and truncate between tests, because starting PostgreSQL takes a few seconds. If your CI cannot run Docker inside a job, a `postgres` service container in the CI configuration gives the same database; the tests only need a connection URL."),

        h2("6. An e2e test for one route with supertest"),
        p("The isAdmin hole of lesson 4.2 was invisible to every test that called the service directly, because the defence lives in the global `ValidationPipe` set up in `main.ts`. An e2e test sends real HTTP to the app and therefore needs the same setup. Put it in one function that both `main.ts` and the tests call:"),
        code("typescript", `
// src/configure-app.ts - used by main.ts and by every e2e test
export function configureApp(app: INestApplication): void {
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
}

// test/users.e2e-spec.ts
import request from "supertest";

describe("PATCH /users/me/profile", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: (ctx: ExecutionContext) => { ctx.switchToHttp().getRequest().user = { id: "u1" }; return true; } })
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(() => app.close());

  it("updates the display name", () =>
    request(app.getHttpServer()).patch("/users/me/profile").send({ displayName: "Minh" }).expect(200));

  it("rejects a field that is not in the DTO", () =>
    request(app.getHttpServer())
      .patch("/users/me/profile")
      .send({ displayName: "Minh", isAdmin: true })
      .expect(400)
      .expect(({ body }) => expect(body.message).toContain("property isAdmin should not exist")));
});`, "users.e2e-spec.ts"),
        p("This test runs against the integration database from section 5, so it also proves that the update reaches the table with only the allowed columns. Keep e2e tests few and focused on the contract: one happy path, the validation and authorization failures a client must handle, and the status codes of the domain errors from lesson 2.3."),

        h2("7. How to verify your tests"),
        bullets([
            "**Watch each new test fail once.** Revert the fix (or comment out the line it protects) and run it: a test that never failed may not be testing anything. The boot test must fail on PR #731; the e2e test must fail without `forbidNonWhitelisted`.",
            "**Name the level in the file name** (`.spec.ts`, `.int-spec.ts`, `.e2e-spec.ts`) and run them as separate CI steps, fastest first, so a broken rule fails in seconds and a broken container setup does not hide it.",
            "**Measure the cost.** Unit tests in seconds, integration and e2e in a minute or two. If the slow levels grow, move rules down into unit tests instead of skipping the slow job.",
            "**Check the plan against the incidents.** For each row of the table in section 1, point at the test that would now fail. That is the answer to the lead's question.",
        ]),

        h2("8. Common mistakes"),
        bullets([
            "**Counting tests instead of asking what they can see.** Spot it: a large suite in which no test imports `AppModule` or opens a database connection.",
            "**Overriding the class under test, or everything around it.** A testing module where every provider is a fake is a slow unit test. Spot it: `overrideProvider(EnrollmentService)` in a test of EnrollmentService.",
            "**e2e tests without the app's global setup.** Pipes, filters and prefixes from `main.ts` are missing, so validation tests pass for the wrong reason or fail mysteriously. Spot it: `useGlobalPipes` appears in `main.ts` but not in the test setup; extract `configureApp()`.",
            "**Sharing database state between tests.** A test passes alone and fails in the suite. Spot it: no truncate or transaction rollback between tests; results depend on the order.",
            "**Fakes that are smarter or dumber than the real thing.** An in-memory repository without the unique index lets the duplicate-enrollment bug pass. Spot it: a rule that relies on a database constraint is only tested with a fake.",
        ]),

        h2("9. Summary"),
        numbered([
            "Unit tests with constructor fakes prove rules quickly; they cannot see the module graph, the database or the HTTP setup.",
            "Test.createTestingModule with overrideProvider checks the real wiring with chosen fakes; a boot test of AppModule catches cycles and missing exports. Integration tests against PostgreSQL (Testcontainers) check constraints and SQL; supertest e2e tests check the route a client sees.",
            "Choose the cheapest level that can see the bug, and watch every new test fail once before you trust it.",
        ]),

        h2("Sources"),
        bullets([
            "NestJS documentation: Testing (Test.createTestingModule, overrideProvider, end-to-end testing) - https://docs.nestjs.com/fundamentals/testing",
            "Testcontainers for Node.js: PostgreSQL module - node.testcontainers.org/modules/postgresql",
            "supertest - github.com/ladjs/supertest",
        ]),
        callout("tip", "Self-practice (not graded): build your test plan",
            "Take the table from section 1 and add the last five bugs of a project you work on. For each one, mark the cheapest level that would have caught it and write the name of that test. Then count how many of your existing tests sit at each level, and add the one missing test that would have caught the most expensive bug."),
    ],
});
