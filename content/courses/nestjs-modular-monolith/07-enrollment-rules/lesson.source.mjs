// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-nmm-3-1",
    title: "Enrollment rules: no duplicates, prerequisites first",
    slug: { _type: "slug", current: "enrollment-rules-no-duplicates-prerequisites" },
    description:
        "Learners ended up enrolled twice in the same course, and mobile users got into an advanced course without its prerequisites, because the enrollment rules lived in a controller and in the web client's Enroll button. Learn which rules belong in EnrollmentService, in which order to check them, why a repeated request should get the existing enrollment back, why a cancelled enrollment is a new decision, and why the database unique constraint is still needed next to the service rule.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer, CodeDev API (EnrollmentModule)",
        problem:
            "Two tickets in one week. #5210: \"I'm enrolled twice in NestJS Modular Monolith. My dashboard shows the course two times, one at 35% and one at 0%.\" #5217, from the content team: \"Learners are in NestJS Modular Monolith without having finished TypeScript Foundations, and they are failing every quiz.\" POST /enrollments inserts a row for every request it gets. The prerequisite check exists only in the web app, which hides the Enroll button; the mobile app shows it for every course, and it retries a request that takes longer than 2 seconds.",
    },

    content: [
        h2("1. The incident: a rule in the button, not in the API"),
        p("This is the enrollment endpoint as it shipped. It was written when every course was free and had no prerequisites, and each new rule was added wherever the person adding it happened to be working:"),
        code("typescript", `
// src/enrollments/enrollment.controller.ts - the version that shipped
@Controller("enrollments")
export class EnrollmentController {
    constructor(
        private readonly enrollments: EnrollmentRepository,
        private readonly courses: CourseService,
        private readonly entitlements: EntitlementService,
    ) {}

    @Post()
    async enroll(@CurrentUser() user: AuthUser, @Body() dto: EnrollDto) {
        const course = await this.courses.findById(dto.courseId);
        if (course?.premium && !(await this.entitlements.has(user.id, course.id))) {
            throw new ForbiddenException();                                 // premium rule: in the controller
        }
        return this.enrollments.insert({ userId: user.id, courseId: dto.courseId, status: "active" });
    }
}

// web: src/features/courses/EnrollButton.tsx
if (!course.prerequisites.every((id) => me.completedCourseIds.includes(id))) return null;   // prerequisite rule: in the UI`, "the shipped code"),
        p("Three rules, three places, and none of them complete. Nothing checks for an existing enrollment, so every request inserts a row. The prerequisite rule exists only in a React component, so any client that does not run that component - the mobile app, a script, `curl` - skips it. And the premium rule sits in the controller, where the next entry point (an admin bulk import, a queue consumer that enrolls a whole class) will not see it."),

        h2("2. Reproduce it and read the evidence"),
        p("Start with the data. One query shows every learner who has more than one row for the same course:"),
        code("sql", `
SELECT user_id, course_id, count(*) AS rows, array_agg(id ORDER BY created_at) AS ids,
       max(created_at) - min(created_at) AS gap
FROM enrollments
GROUP BY user_id, course_id
HAVING count(*) > 1
ORDER BY gap;

 user_id | course_id               | rows | ids                  | gap
---------+-------------------------+------+----------------------+-----------------
 u_1842  | nestjs-modular-monolith |    2 | {enr_9310,enr_9311}  | 00:00:00.003
 u_2290  | sql-data-modeling       |    2 | {enr_8121,enr_8125}  | 00:00:02.114
 u_0917  | web-http-fundamentals   |    3 | {enr_4410,...}       | 00:00:04.257
(214 rows)`, "psql"),
        p("The gaps tell two stories. A few milliseconds is a double tap: two requests in flight at the same time. About two seconds is the mobile client's retry after its own timeout: the first request was slow, but it succeeded. Both are normal client behaviour. An API that creates a second row for them is the bug."),
        p("Now the prerequisites. The web app hides the button, so reproduce it the way the mobile app does, by calling the API directly as a learner who has completed nothing:"),
        code("bash", `
curl -i -X POST https://api.codedev.test/enrollments \\
  -H "Authorization: Bearer $NEW_LEARNER_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"courseId":"nestjs-modular-monolith"}'

HTTP/1.1 201 Created
{"id":"enr_9402","userId":"u_9001","courseId":"nestjs-modular-monolith","status":"active"}`, "terminal"),
        p("A rule that `curl` can skip is not a rule. It is a hint for one client's UI. Run the same command twice and you also get a second `201` with a new id, which is ticket #5210 reproduced without a phone."),

        h2("3. Core idea: the service owns the rules, and checks them in a deliberate order"),
        p("A domain rule is a statement about the business that must hold no matter who calls: a learner is enrolled in a course at most once; a course with prerequisites admits only learners who completed them; a premium course needs an entitlement. Put each of them in **one** place that every entry point goes through: `EnrollmentService.enroll()`. The controller maps HTTP to a call (lesson 2.2), the web app may still hide the button as a courtesy, and the admin import calls the same method."),
        p("What does **not** belong there:"),
        bullets([
            "**The shape of the input.** \"courseId is a non-empty string\" is the DTO's job (lesson 2.1). The service can assume it got a string and decide what the string means.",
            "**Display decisions.** Greying out the button and showing \"Finish TypeScript Foundations first\" stays in the UI. It is good UX; it just cannot be the enforcement.",
            "**Guarantees under concurrency.** The service can check that no row exists, but two requests 3 ms apart can both pass that check before either inserts. Only the database can refuse the second insert (section 4).",
        ]),
        h3("The order of the checks is part of the rule"),
        numbered([
            "**Does the course exist?** Otherwise `CourseNotFoundError` (404).",
            "**Is the learner already actively enrolled?** Then return that enrollment and stop. This must come before the other checks: a retried request has to get the same answer as the first one, even if the course was unpublished or gained a prerequisite in the meantime. Answering a retry with \"prerequisites missing\" after the first request succeeded would confuse the client and the learner.",
            "**Is the course published?** Draft and retired courses accept no new learners.",
            "**Are all prerequisites completed?** Report **every** missing course, in the course's order, so the UI can show the whole path at once instead of one course per attempt.",
            "**Does a premium course have an entitlement?**",
            "**Is there a cancelled enrollment?** Reactivate it: same row, status back to `active`. It reaches this step only after checks 3 to 5, because the learner may have been refunded or the course may have changed since they cancelled. A reactivation is a new decision, not a repeat.",
            "**Otherwise create one.**",
        ]),
        h3("Existing enrollment: 200 with the row, not 409"),
        p("When the learner is already enrolled, the API could answer `409 Conflict`. That is honest, but it makes the client's life hard: the mobile app that retried after a timeout cannot tell whether its first request worked, and now has an error to handle for what is actually success. Making `enroll` **idempotent** - the same request twice has the same effect as once - means the retry gets `200 OK` with the existing enrollment, and the first request got `201 Created`. Both mean \"you are enrolled\"."),
        callout("info", "When not to make it idempotent",
            "Idempotent create is right when the request means \"make sure this exists\", as enrolling does. It is wrong when every request is a new thing on purpose: two submissions of the same code are two attempts, and a second purchase of the same points pack is a second purchase. Those need a client-generated idempotency key per action instead (web-http-fundamentals, Timeouts & retries), not \"return the existing row\"."),

        challenge("chal_quiz_nmm_311"),

        h2("4. Worked example: EnrollmentService"),
        p("Each rule has its own domain error (lesson 2.3), so the exception filter maps them to HTTP and the client gets a message it can show:"),
        code("typescript", `
// src/enrollments/enrollment.errors.ts
export class PrerequisitesMissingError extends DomainError {
    constructor(courseId: string, readonly missing: string[]) {
        super("prerequisites_missing", \`Complete \${missing.join(", ")} before enrolling in \${courseId}\`);
    }
}
// CourseNotFoundError, CourseNotPublishedError and EntitlementRequiredError follow the same pattern`, "enrollment.errors.ts"),
        p("The service receives everything it reads through its constructor. `CompletionReader` and `EntitlementReader` are small interfaces: the enrollment rules need to ask \"has this learner completed course X?\", not to know how ProgressModule stores it. Lesson 3.3 shows how NestJS injects an interface, and lesson 4.1 why this question must not turn into a cycle between EnrollmentModule and ProgressModule."),
        code("typescript", `
// src/enrollments/enrollment.service.ts
type EnrollResult = { outcome: "created" | "existing" | "reactivated"; enrollment: Enrollment };

@Injectable()
export class EnrollmentService {
    constructor(
        private readonly courses: CourseService,
        private readonly enrollments: EnrollmentRepository,
        @Inject(COMPLETION_READER) private readonly completions: CompletionReader,
        @Inject(ENTITLEMENT_READER) private readonly entitlements: EntitlementReader,
    ) {}

    async enroll(userId: string, courseId: string): Promise<EnrollResult> {
        const course = await this.courses.findById(courseId);
        if (!course) throw new CourseNotFoundError(courseId);

        const current = await this.enrollments.findByUserAndCourse(userId, courseId);
        if (current?.status === "active") return { outcome: "existing", enrollment: current };

        if (!course.published) throw new CourseNotPublishedError(courseId);

        const missing: string[] = [];
        for (const prerequisiteId of course.prerequisites) {
            if (!(await this.completions.hasCompleted(userId, prerequisiteId))) missing.push(prerequisiteId);
        }
        if (missing.length > 0) throw new PrerequisitesMissingError(courseId, missing);

        if (course.premium && !(await this.entitlements.hasEntitlement(userId, courseId))) {
            throw new EntitlementRequiredError(courseId);
        }

        // a cancelled enrollment: reactivate the same row (your exercise in section 7)

        return { outcome: "created", enrollment: await this.enrollments.create(userId, courseId) };
    }
}`, "enrollment.service.ts"),
        p("The controller only translates the outcome into a status code:"),
        code("typescript", `
@Post()
async enroll(@CurrentUser() user: AuthUser, @Body() dto: EnrollDto, @Res({ passthrough: true }) res: Response) {
    const { outcome, enrollment } = await this.enrollmentService.enroll(user.id, dto.courseId);
    res.status(outcome === "existing" ? HttpStatus.OK : HttpStatus.CREATED);
    return enrollment;
}`, "enrollment.controller.ts"),
        h3("The database still has the last word"),
        p("The check in step 2 handles the sequential retry, which is the common case. It cannot handle two requests that overlap: both read \"no row\", both insert. The constraint from the SQL & Data Modeling course (lesson \"Stop duplicate enrollment: races & unique constraints\") closes that gap, and the repository turns its error into the same answer the service gives:"),
        code("sql", `
-- after removing the 214 duplicate groups (keep the oldest row of each, move its progress)
ALTER TABLE enrollments
    ADD CONSTRAINT enrollments_user_course_key UNIQUE (user_id, course_id);`, "migration"),
        code("typescript", `
// src/enrollments/enrollment.repository.ts
async create(userId: string, courseId: string): Promise<Enrollment> {
    try {
        return await this.insert({ userId, courseId, status: "active" });
    } catch (error) {
        if (isUniqueViolation(error, "enrollments_user_course_key")) {     // SQLSTATE 23505: a concurrent request won
            return (await this.findByUserAndCourse(userId, courseId))!;
        }
        throw error;
    }
}`, "enrollment.repository.ts"),
        p("Each layer does what it is good at: the service gives a precise, ordered answer with a useful error message; the constraint guarantees one row per learner and course even when two requests race. Remove either one and you are back to one of the two tickets."),

        h2("5. How to verify it"),
        bullets([
            "**Unit tests with in-memory fakes.** Construct `EnrollmentService` with fake repositories (lesson 1.2) and test one rule per test: two calls return the same id and the fake holds one row; a learner missing two prerequisites gets both in `error.missing`; a cancelled enrollment without an entitlement stays cancelled. No database, milliseconds per test.",
            "**The duplicate query from section 2.** It must return 0 rows after the cleanup, and the migration must succeed: `ADD CONSTRAINT ... UNIQUE` fails if a single duplicate is left, which is a useful check in itself.",
            "**`curl` twice.** The first `POST /enrollments` answers `201 Created`, the second `200 OK` with the same `id`.",
            "**The race, on purpose.** Fire two requests at once (`curl ... & curl ... & wait`) against a local API. Both answers carry the same id and the table holds one row. Without the constraint you can see the duplicate come back.",
            "**The bypass.** Repeat the `curl` from section 2 as a new learner: the answer is now an error naming every missing course, whatever the client.",
        ]),
        code("typescript", `
it("returns the existing enrollment when the request is repeated", async () => {
    const service = new EnrollmentService(courses, enrollments, completions, entitlements);   // in-memory fakes
    const first = await service.enroll("u_1842", "nestjs-modular-monolith");
    const again = await service.enroll("u_1842", "nestjs-modular-monolith");

    expect(first.outcome).toBe("created");
    expect(again).toEqual({ outcome: "existing", enrollment: first.enrollment });
    expect(enrollments.count()).toBe(1);
});`, "enrollment.service.spec.ts"),

        h2("6. Common mistakes"),
        bullets([
            "**The rule lives in the client.** A hidden button or a disabled form is not enforcement. Spot it by calling the endpoint with `curl` as a user who should be refused.",
            "**The rule lives in one controller.** The next entry point (an import job, an event handler, a second route) calls the repository and skips it. Spot it by searching for every caller of `enrollments.create` or `insert`: only the service should appear.",
            "**Checking the rules before the existing enrollment.** A retry after the course changed gets an error although the learner is enrolled. Spot it with a test that unpublishes the course between two calls.",
            "**Reactivating without the rules.** \"They were allowed in once\" gives premium courses back to refunded learners. Spot it with a test of a cancelled enrollment without an entitlement.",
            "**Trusting the service check under concurrency.** Without `UNIQUE (user_id, course_id)` duplicates still appear, only less often, which makes them harder to notice. Spot it with the duplicate query, or with two simultaneous requests.",
        ]),

        h2("7. Write the enrollment rules"),
        p("The challenge gives you the domain errors, the repository interfaces with in-memory fakes and a test runner that replays enroll and cancel operations against seed data. Like rows from PostgreSQL, the objects the fake repository returns are copies: a change is stored only through `save()`. Write `enroll` with all seven steps, including the reactivation left out of section 4:"),
        code("typescript", `
enroll(userId: string, courseId: string): EnrollResult {
    // 1. course exists?                      2. active enrollment? -> return it
    // 3. published?  4. all prerequisites?  5. entitlement for premium?
    // 6. cancelled enrollment? -> reactivate the same row
    // 7. create
}`),
        challenge("chal_coding_nmm_312"),

        h2("8. Summary"),
        bullets([
            "Domain rules live in the service every entry point calls, not in a button or a single controller; the UI may repeat them as hints and the DTO checks only the input's shape.",
            "Order is part of the rule: return an active enrollment before any other check so retries get the same answer, report every missing prerequisite, and treat a reactivation as a new decision that passes the rules again.",
            "Keep the database constraint next to the service rule: the service gives the precise answer and the good error message, `UNIQUE (user_id, course_id)` makes the duplicate impossible when requests race.",
        ]),

        h2("Sources"),
        bullets([
            "NestJS documentation: Providers (docs.nestjs.com/providers) and Exception filters (docs.nestjs.com/exception-filters)",
            "PostgreSQL documentation: Constraints, Unique Constraints (section 5.5.3) and error code 23505 unique_violation (Appendix A)",
            "RFC 9110, HTTP Semantics: section 9.2.2 (Idempotent Methods) and section 15.3.2 (201 Created)",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Write the cleanup migration for the 214 duplicate groups: keep the oldest enrollment of each group, move lesson_progress rows from the newer ones to it (keeping the higher value when both have one), delete the newer ones and then add the unique constraint, all in one transaction. Run it on a copy of the data and check that the duplicate query returns 0 rows."),
    ],
});
