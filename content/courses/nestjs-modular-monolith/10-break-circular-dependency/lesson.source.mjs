// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-nmm-4-1",
    title: "Break the circular dependency between courses and enrollments",
    slug: { _type: "slug", current: "break-circular-dependency-courses-enrollments" },
    description:
        "A release that added a prerequisite check never started: the new pods crashed on boot with \"Nest cannot create the EnrollmentModule instance\", because CourseModule and EnrollmentModule now imported each other. Work through the incident like the on-call engineer: read the boot log, the PR diff, the dependency graph and the timeline, form a hypothesis, rule out the build tool and forwardRef(), choose a structure in which dependencies point one way, and prove it with a boot test and a cycle check in CI.",
    estimatedTime: 30,

    scenario: {
        role: "Backend developer on call, CodeDev learning platform",
        problem:
            "Monday 09:31. The deploy of release 2026.10.26-2 of https://api.codedev.test stalls: every new pod exits a second after it starts, Kubernetes reports CrashLoopBackOff, and the old pods keep serving traffic. The release contains one feature, PR #731 \"enrollments: block enrolling before prerequisites are completed\", and CI was green: lint, tsc and 214 unit tests. The boot log says Nest cannot create the EnrollmentModule instance.",
    },

    content: [
        h2("1. The incident"),
        p("This is the course scenario. Every lesson so far has added a boundary: modules by domain, providers injected through constructors, exports that say what another module may use. This incident is what happens when two of those boundaries start to lean on each other. Nothing is broken in production yet, because the old pods still serve, but the release is blocked and the next fix cannot ship until the app boots again."),
        p("The feature itself is small and correct. Before PR #731 anyone could enroll in **NestJS Modular Monolith** without finishing **NestJS Fundamentals**. The PR makes `EnrollmentService.enroll()` read the course, walk its `prerequisites` and refuse the enrollment if one of them is not completed. To read the course it needs `CourseService`, which lives in `CourseModule`."),
        p("As in the other incident lessons, resist the urge to fix it first. The evidence also tells you what the fix must keep, and how you will know it worked."),

        h2("2. The evidence pack"),
        p("The on-call engineer collected four pieces of evidence in the first fifteen minutes. The quiz refers to them by letter."),
        h3("A. The boot log of a crashing pod"),
        code("text", `
$ kubectl logs deploy/api --previous
[Nest] 1  - 10/26/2026, 9:31:42 AM     LOG [NestFactory] Starting Nest application...
[Nest] 1  - 10/26/2026, 9:31:42 AM   ERROR [ExceptionHandler] Nest cannot create the EnrollmentModule instance.
The module at index [0] of the EnrollmentModule "imports" array is undefined.

Potential causes:
- A circular dependency between modules. Use forwardRef() to avoid it. Read more: https://docs.nestjs.com/fundamentals/circular-dependency
- The module at index [0] is of type "undefined". Check your import statements and the type of the module.

Scope [AppModule -> CourseModule]`, "release 2026.10.26-2, every new pod"),
        h3("B. The PR that added the second import"),
        code("text", `
--- a/src/enrollments/enrollment.module.ts
+++ b/src/enrollments/enrollment.module.ts
 import { Module } from "@nestjs/common";
+import { CourseModule } from "../courses/course.module";
 import { EnrollmentRepository } from "./enrollment.repository";
 import { EnrollmentService } from "./enrollment.service";

 @Module({
+  imports: [CourseModule],
   providers: [EnrollmentRepository, EnrollmentService],
   exports: [EnrollmentService],
 })
 export class EnrollmentModule {}

--- a/src/enrollments/enrollment.service.ts
+++ b/src/enrollments/enrollment.service.ts
 @Injectable()
 export class EnrollmentService {
-  constructor(private readonly enrollments: EnrollmentRepository) {}
+  constructor(
+    private readonly enrollments: EnrollmentRepository,
+    private readonly courses: CourseService,
+  ) {}

   async enroll(userId: string, courseId: string): Promise<void> {
+    const course = await this.courses.getCourse(courseId);
+    for (const required of course.prerequisites) {
+      const done = await this.enrollments.find(userId, required);
+      if (!done?.completedAt) throw new PrerequisiteNotMetError(courseId, required);
+    }
     ...`, "PR #731 \"enrollments: block enrolling before prerequisites are completed\""),
        h3("C. The dependency graph"),
        code("text", `
$ npx madge --circular --extensions ts src/
Processed 64 files

Found 2 circular dependencies!

1) courses/course.module.ts > enrollments/enrollment.module.ts
2) courses/course.service.ts > enrollments/enrollment.service.ts

Module imports (from the @Module decorators):
AppModule        -> CourseModule, EnrollmentModule
CourseModule     -> EnrollmentModule    (since PR #702, catalog learner counts)
EnrollmentModule -> CourseModule        (since PR #731, prerequisite check)

Calls across the two modules:
CourseService.catalog()     -> EnrollmentService.countLearners(courseId)   read
EnrollmentService.enroll()  -> CourseService.getCourse(courseId)           read`, "graph listing, main at 9:40"),
        h3("D. The timeline"),
        code("text", `
Oct 21 15:02  PR #702 merged: the catalog shows how many learners each course has.
              CourseModule imports EnrollmentModule. Deploy OK.
Oct 26 09:12  PR #731 merged: prerequisite check. CI green: lint, tsc, 214 unit tests
              (services built with new and fake repositories).
Oct 26 09:31  Deploy 2026.10.26-2 starts. New pods exit on boot (log A): CrashLoopBackOff.
              Old pods keep serving.
Oct 26 09:38  Hotfix attempt on staging: imports: [forwardRef(() => CourseModule)] in
              EnrollmentModule. New boot error:
              Nest can't resolve dependencies of the EnrollmentService (EnrollmentRepository, ?).
              Please make sure that the argument dependency at index [1] is available in the
              EnrollmentModule context.
Oct 26 09:44  Hotfix abandoned. Release 2026.10.26-2 rolled back and paused.`, "incident channel, summarised"),

        h2("3. Reading the evidence"),
        p("Write one line per piece for what it **shows**, not for what you expect:"),
        bullets([
            "**A** fails while Nest *scans* modules, before any provider is created. `Scope [AppModule -> CourseModule]` is the path Nest followed: it was reading the imports of `CourseModule`, got to `EnrollmentModule`, and found that the first entry of `EnrollmentModule`'s `imports` is `undefined`.",
            "**B** adds exactly that entry: `imports: [CourseModule]` at index 0, and a constructor parameter of type `CourseService`.",
            "**C** shows a cycle at two levels: the module files import each other, and the service files import each other. It also shows what crosses the boundary: two **reads**, a learner count one way and course data the other way.",
            "**D** shows that the cycle went unnoticed by CI: no test ever built the real module graph. It also shows that a half `forwardRef()` did not fix the boot; it moved the error from the module to the constructor parameter.",
        ]),

        h2("4. Hypothesis: two modules that need each other"),
        p("Why is `CourseModule` `undefined`, when it is clearly exported from `course.module.ts`? Follow how Node loads the files, one `import` at a time:"),
        numbered([
            "`app.module.ts` imports `course.module.ts`. Node starts running that file.",
            "Its first line imports `enrollment.module.ts`, so Node pauses `course.module.ts` and runs `enrollment.module.ts`.",
            "That file imports `course.module.ts`. Node sees the file is already loading and hands back what it has so far: nothing, because `export class CourseModule` has not run yet.",
            "`@Module({ imports: [CourseModule] })` is evaluated with `CourseModule === undefined`. The decorator stores `[undefined]`.",
            "Later, Nest scans the modules and reports \"the module at index [0] of the EnrollmentModule imports array is undefined\".",
        ]),
        p("The same thing happens to the constructor parameter types that Nest reads to inject `CourseService`, which is why the staging hotfix in D still failed with `?` at index [1]: `forwardRef()` on the import fixed the first `undefined`, not the second. The hypothesis that explains all four pieces: **since PR #731, CourseModule and EnrollmentModule depend on each other, at the module level and at the service level.** The error is the runtime's way of saying that one of the two has to exist first, and neither can."),
        h3("Rule out the tempting wrong ones"),
        bullets([
            "**\"It is the build tool.\"** Switching to SWC or webpack, or reordering the imports in `app.module.ts`, changes which side is loaded first, so the error names the other module. madge (C) finds the cycle in the source files, before any build. The cycle is in the design.",
            "**\"forwardRef() fixes it.\"** With `forwardRef()` on both modules and both constructor parameters, the app boots. The two features still need each other: neither can be tested, reasoned about or extracted alone, and the next import added to either side can bring the error back in a new form. Nest's documentation says circular dependencies should be avoided where possible; `forwardRef()` is the escape hatch for when they cannot be. This codebase forbids it in its architecture rules.",
            "**\"Merge the two modules.\"** One `CatalogModule` with both services boots no better: the services still inject each other, and Nest now reports a circular dependency between providers. Merging is right only when the two features are really one domain that always changes together, and that is a design decision, not an incident fix.",
        ]),

        h2("5. Core idea: dependencies point one way"),
        p("A modular monolith stays changeable because you can read its modules as a graph with no loops: a module depends only on modules **below** it, so you can understand, test and replace it by looking down, never up. A cycle turns two modules into one tangled unit with two names."),
        p("To break a cycle, first decide which direction is the **domain** direction. An enrollment refers to a course; a course exists without any enrollment. So `EnrollmentModule -> CourseModule` is the edge to keep, and `CourseModule -> EnrollmentModule` (added for a learner count) is the one to remove. Then pick the smallest structural change that removes it:"),
        bullets([
            "**Move the shared data down.** The learner count is a read of enrollment data. Put the owner of that data in a module below both features (`EnrollmentDataModule` with the repository, or a narrow read service such as `EnrollmentCounts` if only the count should be visible). `CourseModule` imports it; `EnrollmentModule` imports it and `CourseModule`.",
            "**Compose above.** If the catalog is a screen that combines courses and enrollments, a `CatalogModule` above both can import them and build the view. `CourseModule` then knows nothing about learners.",
            "**Events for reactions, not for reads.** When one module has to react to something that happens in another (\"when an enrollment is created, refresh the course's stats\"), `@nestjs/event-emitter` lets the lower module publish and the higher one listen. Do not use events to fetch data you need to answer a request.",
        ]),
        callout("info", "When not to restructure",
            "Do not extract a module for every call. If two modules call each other in many places and always change together, they are probably one domain: merge them on purpose and make the services stop calling each other. And do not create a SharedModule that everything imports and that slowly collects every provider: it hides the cycle inside one module instead of removing it."),

        h2("6. Worked example: the data moves down"),
        p("The smallest change for this incident keeps every endpoint and every error message the same. Only the place where the count comes from changes:"),
        code("typescript", `
// src/enrollments/enrollment-data.module.ts (new): owns the enrollment data, imports nothing
@Module({
  providers: [EnrollmentRepository],
  exports: [EnrollmentRepository],
})
export class EnrollmentDataModule {}

// src/courses/course.module.ts: no longer imports EnrollmentModule
@Module({
  imports: [EnrollmentDataModule],
  providers: [CourseRepository, CourseService],
  exports: [CourseService],
})
export class CourseModule {}

// src/courses/course.service.ts
@Injectable()
export class CourseService {
  constructor(
    private readonly courses: CourseRepository,
    private readonly enrollments: EnrollmentRepository,
  ) {}

  async catalog(): Promise<CatalogEntry[]> {
    const courses = await this.courses.findAll();
    return Promise.all(courses.map(async (course) => ({
      id: course.id,
      title: course.title,
      learners: await this.enrollments.countByCourse(course.id),
    })));
  }
}

// src/enrollments/enrollment.module.ts: the domain direction stays
@Module({
  imports: [CourseModule, EnrollmentDataModule],
  providers: [EnrollmentService],
  exports: [EnrollmentService],
})
export class EnrollmentModule {}`, "after the fix"),
        p("The graph is now `EnrollmentDataModule <- CourseModule <- EnrollmentModule <- AppModule`. Note what moved **out** of `EnrollmentModule`: the repository. It is listed in the providers of exactly one module, so Nest creates one instance and every importer receives the same one. Had the fix listed `EnrollmentRepository` in the providers of `CourseModule` as well, Nest would have created a second instance for that module, because providers are singletons per module, not per class."),

        challenge("chal_quiz_nmm_411"),

        h2("7. The challenge: a module container in one file"),
        p("The code runner has no NestJS, so the challenge file ships a small module container (about a hundred lines, marked do not change) that follows Nest's rules for this case:"),
        bullets([
            "**`Module(Class, { imports, providers, exports })`** plays the role of the `@Module()` decorator. A provider is a class, or `{ provide: Class, inject: [...] }` with the classes its constructor needs, in order (Nest reads them from the parameter types).",
            "**Visibility.** A provider can inject a provider of its own module, or one that an imported module exports. Anything else fails with Nest's \"can't resolve dependencies\" message, naming the module.",
            "**Singletons per module.** Each module creates one instance of each provider it lists. The same class in two modules gives two instances.",
            "**Cycles.** An import cycle stops the boot with the path of the cycle; providers that need each other stop it with the provider path. There is no `forwardRef()`.",
            "**The test runner** boots `AppModule`, prints the order in which `CourseModule`, `EnrollmentModule` and `AppModule` were initialised, then runs operations: the catalog with learner counts, enrollments with prerequisite checks, completions.",
        ]),
        p("Run the starter first: you will see log A again, in the container's words. Then restructure the modules so the graph has no cycle and every operation gives the same result as before."),
        challenge("chal_coding_nmm_412"),

        h2("8. How to verify the fix"),
        p("\"It boots on my machine\" is not enough: the PR's own CI was green. Add the checks that would have failed on PR #731:"),
        bullets([
            "**A boot test.** One test that compiles the real `AppModule`. On PR #731 it fails with log A; after the fix it passes. It costs a second and catches every wiring error: cycles, missing exports, missing imports.",
            "**A cycle check in CI.** `npx madge --circular --extensions ts src/` exits with a non-zero code when it finds a cycle. `import/no-cycle` from eslint-plugin-import does the same in the linter.",
            "**The behaviour.** The tests of the catalog and of the prerequisite rule still pass, unchanged: the fix moved code, it did not change answers.",
            "**Staging, then production.** New pods reach Ready; `GET /courses` shows the same learner counts as before the release; enrolling in a course without its prerequisite returns the same error response as before the release.",
        ]),
        code("typescript", `
// test/app.boot.spec.ts
import { Test } from "@nestjs/testing";
import { AppModule } from "../src/app.module";

it("boots the whole module graph", async () => {
  // Runs in the CI job that has the test database (lesson 4.3): compile() creates every provider.
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  expect(moduleRef.get(CourseService)).toBeDefined();
  await moduleRef.close();
});`, "app.boot.spec.ts"),
        code("bash", `
# .github/workflows/ci.yml, one more step
npx madge --circular --extensions ts src/   # exit code 1 on PR #731`, "ci step"),

        h2("9. Common mistakes when breaking a cycle"),
        bullets([
            "**Calling it fixed when it boots.** `forwardRef()` makes the error disappear and keeps the cycle. Spot it: `forwardRef` in a diff, or madge still reporting the pair of files.",
            "**Copying a provider into a second module.** It boots and looks right until data changes: two repository instances, two caches, two counts. Spot it: the same class in the `providers` of two modules; a test that writes through one service and reads through the other.",
            "**Exporting less than you import.** A new lower module without `exports` boots into \"can't resolve dependencies of the CourseService (CourseRepository, ?)\". Spot it: the module name in the message is the importer, the `?` is the provider that is not exported to it.",
            "**Moving the cycle instead of removing it.** A new `EnrollmentStatsModule` that imports `EnrollmentModule` again makes a cycle of three. Spot it: follow the arrows from the new module; every path must end at a module that imports nothing from above.",
            "**Testing only with fakes.** Unit tests that build services with `new` never see the module graph. Spot it: no test in the suite imports `AppModule`.",
        ]),

        h2("10. Summary"),
        numbered([
            "\"The module at index [n] is undefined\" and \"can't resolve dependencies ... (?)\" on boot usually mean two files import each other: one of them is still loading when the other uses it.",
            "Break the cycle in the design: keep the domain direction (enrollments depend on courses) and move the read that points the other way into a module below both, or compose above. forwardRef() and copied providers only hide it.",
            "Prove it with a boot test of AppModule and a cycle check in CI; both would have failed on the PR that caused the incident.",
        ]),

        h2("Sources"),
        bullets([
            "NestJS documentation: Modules - https://docs.nestjs.com/modules",
            "NestJS documentation: Circular dependency - https://docs.nestjs.com/fundamentals/circular-dependency",
            "madge: finding circular dependencies (npx madge --circular)",
        ]),
        callout("tip", "Self-practice (not graded): draw the dependency graph before/after",
            "Draw two graphs of this incident: the module graph before the fix (AppModule, CourseModule, EnrollmentModule, with the arrows from C) and after it (with EnrollmentDataModule). Mark each arrow with the call that needs it (\"learner count\", \"prerequisite check\"). Then draw the graph of your own project, or run madge --image graph.svg src/ on it, and circle every pair of modules with arrows both ways. For each pair, write which direction is the domain direction and which read you would move."),
    ],
});
