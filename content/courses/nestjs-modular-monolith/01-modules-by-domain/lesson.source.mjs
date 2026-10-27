// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-nmm-1-1",
    title: "How to split a NestJS API into modules by domain",
    slug: { _type: "slug", current: "split-nestjs-api-into-modules-by-domain" },
    description:
        "A pricing change for enrollments made course progress jump to 117% and sent completion certificates to learners who had not finished, because the whole CodeDev API lived in one AppModule with a 1,400-line AppService and both features shared one helper. Learn to split a NestJS API into modules by domain instead of by technical layer, to decide what each module owns (its providers, its routes and its tables), to find the boundaries from the data each use case writes, and to recognise when one module is still enough.",
    estimatedTime: 20,

    scenario: {
        role: "Backend developer, CodeDev learning platform",
        problem:
            "On Wednesday the business team asked for enrollment prices to count only paid lessons, because free preview lessons should not cost points. The pull request changed one line in src/app.service.ts, a 1,412-line file that holds every rule of the CodeDev API: courses, enrollments, progress and users. It passed review and the price quote tests. On Thursday morning support had 40 tickets: course progress at https://app.codedev.test showed 117%, and learners who had finished 12 of 14 lessons received a completion certificate by e-mail.",
    },

    content: [
        h2("1. The incident: a price change that issued certificates"),
        p("Here is the bug report, as it reached the backend team:"),
        code("text", `
BUG-3107  Progress above 100%, certificates sent early            Severity: critical
Steps:    complete 12 of the 14 lessons of "SQL & Data Modeling" (course 42)
Expected: GET /courses/42/progress -> {"percent":86,"completed":false}
Actual:   GET /courses/42/progress -> {"percent":100,"completed":true}
          learners who finished all 14 lessons see {"percent":117}
          certificate e-mail sent to 212 learners since yesterday
Since:    release 2026.10.21 (only change: PR #1184
          "Enrollment price: count paid lessons only")`, "bug report"),
        p("And this is the whole diff of PR #1184:"),
        code("typescript", `
// src/app.service.ts  (line 212 of 1,412)
 private countLessons(course: Course): number {
-    return course.lessons.length;
+    return course.lessons.filter((lesson) => !lesson.isPreview).length;   // previews are free
 }`, "PR #1184"),
        p("The author needed the price of course 42 to be 12 paid lessons times the price per lesson, not 14. The change was correct for pricing. What the author could not see, 650 lines further down, was the progress calculation:"),
        code("typescript", `
// src/app.service.ts  (line 861 of 1,412)
const done = await this.progressRepo.findCompleted(userId, courseId);   // includes the 2 previews
const percent = Math.round((done.length / this.countLessons(course)) * 100);   // 14 / 12 -> 117
const completed = percent >= 100;                                              // 12 / 12 -> true`, "app.service.ts"),
        p("Nobody was careless. The structure made the mistake easy: one class served four areas of the product, one private helper served two of them with different meanings (\"lessons you pay for\" and \"lessons you must finish\"), and the only thing connecting pricing and progress was that they happened to live in the same file. This lesson is about drawing boundaries in a NestJS API so that a pricing change cannot reach progress, and so that anything two areas do share is shared on purpose."),

        h2("2. Read the evidence: what AppModule actually contains"),
        p("Before you move any code, measure what is there. The module definition is short, which is part of the problem:"),
        code("typescript", `
// src/app.module.ts
@Module({
    imports: [DatabaseModule],
    controllers: [AppController],    // 46 routes: courses, enrollments, progress, users
    providers: [AppService],         // 1,412 lines, 9 repositories in its constructor
})
export class AppModule {}`, "app.module.ts"),
        p("Then ask the helper that broke who uses it, and ask git who changes the file:"),
        code("bash", `
$ grep -n "countLessons(" src/app.service.ts
212:  private countLessons(course: Course): number {
388:      const price = course.pricePerLesson * this.countLessons(course);
861:      const percent = Math.round((done.length / this.countLessons(course)) * 100);
1104:     if (this.countLessons(course) > 40) tags.push("long-course");

$ git log --since="3 months ago" --format="%an" -- src/app.service.ts | sort | uniq -c
     21 an.nguyen       (enrollments, pricing)
     17 minh.tran       (progress, certificates)
     14 linh.pham       (course catalog)
     11 bao.le          (users, leaderboard)`, "terminal"),
        p("Three callers with three different meanings, and four people who change the file for four different reasons. Finally, skim the class and write down what each region does:"),
        code("text", `
lines    1-120   imports, constructor with 9 injected repositories
lines  121-340   helpers: countLessons, formatPoints, toSlug, isAdmin, ...
lines  341-610   enrollments: quote a price, enroll, cancel, refund points
lines  611-940   progress: complete a lesson, percent, certificates
lines  941-1180  courses: list, detail, search, tags
lines 1181-1412  users: profile, streaks, leaderboard`, "app.service.ts outline"),
        p("Four areas, each with its own data and its own rules, in one provider. Every change is reviewed as \"a change to AppService\", every test of progress has to build a service that also needs the enrollment, course and user repositories, and a reviewer has no way to see from the diff which areas a line can reach."),

        h2("3. The core idea: one module per domain"),
        p("A NestJS module is a class with the `@Module()` decorator that groups **providers** (services, repositories, anything Nest creates and injects), **controllers** (routes), the modules it **imports** and the providers it **exports** to others. Nest builds the application as a graph of modules, starting from the root `AppModule`. Nothing forces you to have more than one, which is how the CodeDev API ended up with exactly one."),
        p("Split the API by **domain**: an area of the product with its own data, its own rules and its own reason to change. For CodeDev that gives four modules:"),
        bullets([
            "**CourseModule**: the catalog. Courses, lessons and their order, which lessons are previews, search and tags. Owns the `courses` and `lessons` tables.",
            "**EnrollmentModule**: who may study what. Price quotes, enrolling, cancelling, refunds. Owns the `enrollments` table and the pricing rules.",
            "**ProgressModule**: what a learner has done. Completing a lesson, the progress percentage, completion and certificates. Owns the `lesson_progress` table.",
            "**UserModule**: who the learner is. Profiles, streaks, the leaderboard. Owns the `users` table.",
        ]),
        h3("What a module owns"),
        p("A module is the owner of three things, and only the owner touches them directly:"),
        bullets([
            "**Its providers.** `EnrollmentService`, the pricing function and the enrollment repository live in `src/enrollments/`. Other modules can use only what EnrollmentModule chooses to export (lesson 1.3), never its repository or its helpers.",
            "**Its routes.** `POST /enrollments` and `GET /enrollments/quote` are declared in EnrollmentModule's controller. When a route misbehaves, its module tells you where to look.",
            "**Its data.** Only EnrollmentModule reads and writes the `enrollments` table. When ProgressModule needs to know whether a learner is enrolled, it asks `EnrollmentService`, it does not run its own query. One owner per table means one place to change when the table changes.",
        ]),
        h3("Why not split by technical layer"),
        p("The first split many teams try is by file type:"),
        code("text", `
src/
  controllers/controllers.module.ts    every controller
  services/services.module.ts          every service
  repositories/repositories.module.ts  every repository`, "split by layer"),
        p("It looks organised, but it does not change what went wrong. Pricing and progress are still neighbours inside `ServicesModule` and can still share private helpers. A pricing change still touches three modules, because each layer holds a slice of it. And the module graph says only \"controllers use services, services use repositories\", which was true of the 1,412-line file too. A boundary is useful when it separates things that change for **different reasons**. Layers separate things that change **together**."),
        h3("How to find the boundaries"),
        p("Do not start from the code; start from what the API does and which data each operation writes. Write one line per use case:"),
        code("text", `
use case                         writes              reads                    owner
GET  /courses, /courses/:id      -                   courses, lessons         CourseModule
GET  /enrollments/quote          -                   courses, lessons         EnrollmentModule
POST /enrollments                enrollments         courses, users           EnrollmentModule
POST /lessons/:id/complete       lesson_progress     enrollments, lessons     ProgressModule
GET  /courses/:id/progress       -                   lesson_progress, lessons ProgressModule
GET  /users/me                   -                   users                    UserModule`, "use cases"),
        p("Group the use cases by the table they **write**: each group is a candidate module and it owns that table. The **reads** column shows the dependencies between modules: EnrollmentModule and ProgressModule both need lesson data, so both will depend on CourseModule and ask it through an exported service. If two candidate modules write the same table, they are probably one domain; if one module writes five unrelated tables, it is probably more than one."),
        callout("info", "When one module is enough",
            "A modular monolith is still one process, one deploy and one database: modules are boundaries in the code, not network calls. They are cheap, but not free: every module adds a file, an exports list and decisions about who may call whom. An API with a handful of routes over one or two tables, a prototype whose domain is still changing every week, or a small internal tool is fine as a single module. Split when you can name the domains, when two areas keep colliding in the same file or the same review, or when you want to test one area without setting up the others. Do not split by line count alone, and do not create a module per table."),

        challenge("chal_quiz_nmm_111"),

        h2("4. Worked example: the CodeDev API, split by domain"),
        p("The target layout keeps everything a domain needs in its own folder. A folder is not a boundary by itself; the `@Module()` in it is:"),
        code("text", `
src/
  app.module.ts                  imports the four domain modules, nothing else
  courses/
    course.module.ts
    course.controller.ts         GET /courses, GET /courses/:id
    course.service.ts            exported: getOutline(courseId)
    course.repository.ts         courses, lessons tables
  enrollments/
    enrollment.module.ts
    enrollment.controller.ts     GET /enrollments/quote, POST /enrollments
    enrollment.service.ts
    enrollment.repository.ts     enrollments table
    pricing.ts                   pure function: quotePrice(outline)
  progress/
    progress.module.ts
    progress.controller.ts       POST /lessons/:id/complete, GET /courses/:id/progress
    progress.service.ts
    progress.repository.ts       lesson_progress table
  users/
    user.module.ts, user.controller.ts, user.service.ts, user.repository.ts`, "folder layout"),
        p("CourseModule owns the catalog and exports one service. Other modules get lesson data through it, as a plain outline, not through its repository:"),
        code("typescript", `
// src/courses/course.service.ts
import { Injectable, NotFoundException } from "@nestjs/common";
import { CourseRepository } from "./course.repository";

export type LessonSummary = { id: string; isPreview: boolean };
export type CourseOutline = { id: string; pointsPerLesson: number; lessons: LessonSummary[] };

@Injectable()
export class CourseService {
    constructor(private readonly courses: CourseRepository) {}

    async getOutline(courseId: string): Promise<CourseOutline> {
        const outline = await this.courses.findOutline(courseId);
        if (!outline) throw new NotFoundException(\`course \${courseId} not found\`);
        return outline;
    }
}

// src/courses/course.module.ts
import { Module } from "@nestjs/common";

@Module({
    controllers: [CourseController],
    providers: [CourseService, CourseRepository],
    exports: [CourseService],               // the repository stays private
})
export class CourseModule {}`, "courses/"),
        p("The pricing rule moves into EnrollmentModule, where it belongs. It is a pure function: it takes an outline and returns a number, so it needs no provider and no database to test:"),
        code("typescript", `
// src/enrollments/pricing.ts
import type { CourseOutline } from "../courses/course.service";

// Preview lessons are free: the price counts paid lessons only (PR #1184).
export function quotePrice(outline: CourseOutline): number {
    const paidLessons = outline.lessons.filter((lesson) => !lesson.isPreview).length;
    return paidLessons * outline.pointsPerLesson;
}

// src/enrollments/enrollment.module.ts
@Module({
    imports: [CourseModule],                // to call CourseService.getOutline
    controllers: [EnrollmentController],
    providers: [EnrollmentService, EnrollmentRepository],
    exports: [EnrollmentService],
})
export class EnrollmentModule {}`, "enrollments/"),
        p("ProgressModule counts **every** lesson, previews included, because finishing a course means finishing all of it. That rule now lives in its own service, next to the data it reads:"),
        code("typescript", `
// src/progress/progress.service.ts
@Injectable()
export class ProgressService {
    constructor(
        private readonly progress: ProgressRepository,
        private readonly courses: CourseService,
    ) {}

    async getProgress(userId: string, courseId: string) {
        const outline = await this.courses.getOutline(courseId);
        const lessonIds = new Set(outline.lessons.map((lesson) => lesson.id));
        const done = (await this.progress.findCompleted(userId, courseId))
            .filter((lessonId) => lessonIds.has(lessonId));             // ignore removed lessons
        const total = outline.lessons.length;                            // previews count here
        const percent = total === 0 ? 0 : Math.round((done.length / total) * 100);
        return { percent, completed: total > 0 && done.length === total };
    }
}

// src/progress/progress.module.ts
@Module({
    imports: [CourseModule],
    controllers: [ProgressController],
    providers: [ProgressService, ProgressRepository],
})
export class ProgressModule {}

// src/app.module.ts
@Module({
    imports: [DatabaseModule, CourseModule, EnrollmentModule, ProgressModule, UserModule],
})
export class AppModule {}`, "progress/ and app.module.ts"),
        p("Replay PR #1184 on this structure. \"Count paid lessons only\" is a change to `quotePrice` in `src/enrollments/pricing.ts`. ProgressService does not import `pricing.ts` and has its own count, so it cannot be affected, and the reviewer sees that from the file path alone. Notice also what was **not** created: no LessonModule, no PricingModule, no CertificateModule. Lessons belong to the catalog, pricing to enrollments, certificates to progress, until one of them grows its own data and its own reason to change."),

        h2("5. How to verify the boundaries"),
        p("Boundaries that nobody checks erode within a few months. Each of these checks runs in seconds:"),
        bullets([
            "**The startup log lists the modules.** `npm run start:dev` prints one `InstanceLoader` line per module, for example `LOG [InstanceLoader] ProgressModule dependencies initialized`. If a module you expect is missing, AppModule does not import it.",
            "**One owner per table.** `grep -rniE \"(insert into|update|delete from) +enrollments\" src/` must match only files under `src/enrollments/`. Do the same for every table, or put the check in a CI script that fails on a match outside the owner's folder.",
            "**No imports into another module's internals.** ESLint's `no-restricted-imports` can forbid paths such as `**/enrollments/enrollment.repository` outside `src/enrollments/`. A module may import another module's `*.module.ts`, its exported service and its types, nothing else.",
            "**Each domain tests alone.** A unit test of `ProgressService` needs a fake `ProgressRepository` and a fake `CourseService`, and nothing about pricing or users. If a progress test has to set up enrollment prices, the boundary is still in the wrong place.",
            "**Changes stay inside one folder.** After a few weeks, `git log --stat --since=\"1 month ago\" -- src/enrollments` should show pricing commits that touch only `src/enrollments/`. A commit that touches three domain folders for one feature is a hint that the boundary is drawn wrong.",
        ]),

        h2("6. Common mistakes and how to spot them"),
        bullets([
            "**Modules by layer.** `ControllersModule`, `ServicesModule`, `RepositoriesModule`. Spot it from the module names: if a name describes a kind of class rather than a part of the product, the split did not separate anything that changes independently.",
            "**A CommonModule that becomes the new AppService.** \"Shared\" helpers with domain names (`countLessons`, `isEnrolled`, `formatPrice`) collect in `common/` and get callers in every module. Spot it by counting the domain words in the exports of `CommonModule`. Keep it for real infrastructure (logging, configuration, the database connection) and move domain rules to their owner.",
            "**Writing another module's table.** `ProgressRepository` runs `UPDATE enrollments SET status = 'completed'` because it was quicker than asking EnrollmentService. Spot it with the grep from section 5. Two writers of one table means two places that must agree on its rules.",
            "**A module per table or per entity.** LessonModule, LessonTagModule, CourseStatsModule, each with one service and a long imports list. Spot it when every feature touches three modules and their imports always change together: they are one domain.",
            "**Splitting before you know the domains.** Twelve modules for an API with eight routes. If you cannot write one sentence about what a module owns, it is not a module yet; keep it inside its neighbour until it is.",
        ]),

        h2("7. Summary"),
        numbered([
            "Split a NestJS API into modules by domain (CourseModule, EnrollmentModule, ProgressModule, UserModule), not by technical layer: a boundary is useful when it separates things that change for different reasons.",
            "A module owns its providers, its routes and its tables; other modules use only what it exports, and each table has exactly one module that writes it. Find the modules from the data each use case writes.",
            "Check the boundaries with the startup log, a grep per table, import rules and tests that set up one domain at a time, and keep a small API in one module until you can name its domains.",
        ]),

        h2("Sources"),
        bullets([
            "NestJS docs, Modules: feature modules, shared modules and the module graph - docs.nestjs.com/modules",
            "NestJS docs, Providers - docs.nestjs.com/providers",
            "ESLint docs, no-restricted-imports - eslint.org/docs/latest/rules/no-restricted-imports",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Draw the module diagram of the CodeDev API on paper: one box per module (Course, Enrollment, Progress, User), the tables it owns inside the box, and one arrow per import (Enrollment -> Course, Progress -> Course). Then add the routes from section 3 and check that every write lands in the box that owns the table. Do the same for an API you work on: list its use cases with the tables they write, group them, and mark every table that has two writers and every helper with callers in two groups."),
    ],
});
