// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-saf-3-1",
    title: "Shared database or owned data: who may write a table",
    slug: { _type: "slug", current: "shared-database-or-owned-data-who-may-write-a-table" },
    description:
        "A learner got a refund, and the next night a progress job marked the same enrollment as \"completed\". A week earlier, renaming one column broke three modules at once. Both incidents have one cause: several modules write and read the same table directly. Learn data ownership - one module writes a table, the others go through its interface or a published read-only view - why a shared database is hidden coupling, how to keep one transaction across modules inside a monolith, and how to check ownership with grep, a test and a SQL audit.",
    estimatedTime: 30,

    scenario: {
        role: "Junior backend developer, CodeDev platform team",
        problem:
            "Support escalates a ticket: a learner who was refunded for \"SQL & Data Modeling\" on 1 October received a course completion email and the completion bonus on 2 October, and can open the course again. The `enrollments` table says `completed`. The refund code set `refunded`; a nightly job in the `progress` module overwrote it. Nobody on the enrollment side knew that job existed.",
    },

    content: [
        h2("1. The incident: a refunded course marked \"completed\""),
        p("CodeDev keeps one row per learner and course in the `enrollments` table. Its `status` column has three values: `active` (the learner may study), `refunded` (the money went back, access is closed) and `completed` (the learner finished the course). The `enrollment` module creates the row at checkout and sets `refunded` when a refund goes through."),
        p("The learner `u_3307` bought the course on 28 September for 149000 VND, finished all 10 lessons on 30 September and asked for a refund on 1 October, which the policy allows. The refund ran at 14:20 and set the status to `refunded`. At 03:00 the next night, a job called `markCompletedCourses` ran. It belongs to the `progress` module. It found an enrollment with every lesson done and executed one line of SQL:"),
        code("sql", `
-- progress/jobs/markCompletedCourses.ts (the SQL it runs every night)
UPDATE enrollments
SET    status = 'completed', completed_at = now()
WHERE  id IN (SELECT enrollment_id FROM lesson_progress
              GROUP BY enrollment_id
              HAVING count(*) FILTER (WHERE done) = count(*));`, "the write that caused the incident"),
        p("The job did exactly what it was written to do. It did not know about refunds, because refunds are not its business. The rule \"a refunded enrollment never becomes completed\" lived in the `enrollment` module, and the `progress` job went around it."),
        p("This was the second incident with the same table. On 23 September, a developer on the enrollment side renamed the column `status` to `state` in a migration. The enrollment code was updated in the same pull request. After the deploy, three other modules failed with the same Postgres error, and the migration was rolled back 40 minutes later:"),
        code("text", `
2026-09-23 10:41:07 ERROR progress       markCompletedCourses  column "status" does not exist
2026-09-23 10:42:15 ERROR notifications  sendStudyReminders    column "status" does not exist
2026-09-23 10:43:02 ERROR catalog        GET /courses/:slug    column "status" does not exist`, "application log"),

        h2("2. Who touches this table? Look before you guess"),
        p("Before you fix anything, find every place that reads or writes `enrollments`. The code is plain TypeScript with SQL strings, so a text search finds them:"),
        code("bash", `
$ grep -rnE "(INSERT INTO|UPDATE|DELETE FROM) enrollments" src/modules
src/modules/enrollment/infrastructure/PgEnrollmentRepository.ts:31:  INSERT INTO enrollments (user_id, course_id, status)
src/modules/enrollment/infrastructure/PgEnrollmentRepository.ts:58:  UPDATE enrollments SET status = 'refunded'
src/modules/progress/jobs/markCompletedCourses.ts:22:              UPDATE enrollments

$ grep -rlE "(FROM|JOIN) enrollments" src/modules
src/modules/enrollment/infrastructure/PgEnrollmentRepository.ts
src/modules/progress/jobs/markCompletedCourses.ts
src/modules/notifications/jobs/sendStudyReminders.ts
src/modules/catalog/infrastructure/PgCourseCardQuery.ts`, "terminal"),
        p("Two modules **write** the table and four modules **read** it. None of the readers or the second writer imports anything from the `enrollment` module. If you counted imports to measure coupling, as in lesson 2, you would see no arrow from `progress` to `enrollment` at all. The coupling is real, but it goes through the database, where the import graph cannot see it."),

        h2("3. The idea: one module owns each table"),
        p("A few words first:"),
        bullets([
            "**Owner.** The one module that may write a table: insert, update and delete rows. For `enrollments` that is the `enrollment` module.",
            "**Invariant.** A rule about the data that must always be true, for example \"a refunded enrollment is never completed\". The owner is the place where the invariants are checked.",
            "**Interface.** The functions the owner offers to other modules, for example `enrollmentService.markCompleted(enrollmentId)`. Other modules change the data only by calling them.",
            "**Read model.** Data the owner publishes on purpose for others to read: a function that returns plain objects, or a database **view** (a saved query that looks like a table). The owner promises to keep its shape stable.",
            "**Shared database as integration.** Several modules read and write the same tables directly and use them to pass information to each other. Martin Fowler calls this an integration database.",
        ]),
        p("**Data ownership** is a simple rule: **each table has exactly one owner; only the owner writes it; other modules call the owner's interface or read its published read model.** The table's columns become a private detail of the owner, like a private field of a class."),
        h3("Why one writer"),
        bullets([
            "**Rules live in one place.** Every change of `status` goes through code that knows all the rules. The progress job cannot forget the refund rule, because it never writes `status`.",
            "**The schema can change.** If only the owner uses the raw columns, renaming `status` touches one module, not four.",
            "**Coupling becomes visible.** A call to `enrollmentService.markCompleted()` is an import you can see in a review and count with a tool. An `UPDATE` hidden in a SQL string is not.",
            "**Questions have one answer.** \"Who set this enrollment to completed?\" has one place to look and one place to log.",
        ]),
        h3("What ownership does not mean"),
        bullets([
            "**It does not mean one database per module.** CodeDev keeps one Postgres database. Ownership is a rule about who writes which tables. You can make it visible with one Postgres schema (a named group of tables) per module, but that is optional.",
            "**It does not forbid every shared read.** A read-only view that the owner publishes and maintains is fine. An admin report that joins five tables once a day is fine, if everyone knows it is a report and it never writes.",
            "**It is not worth much in a tiny app.** A prototype with one module and one developer has nobody to step on. The rule pays off when several modules, or several people, change the same data.",
        ]),
        image("table-ownership-before-after", {
            alt: "Diagram in two panels. Left, in red, titled 'Before: a shared table': the modules enrollment and progress both have write arrows into the enrollments table, and notifications and catalog have read arrows into the same raw table; a note says renaming status broke 3 modules and the progress job overwrote a refund. Right, in green, titled 'After: one owner': only the enrollment module writes the enrollments table; progress calls enrollmentService.markCompleted(), and notifications and catalog read the view enrollment_summary that the enrollment module publishes; a note says the rule lives in one place and a rename touches one module.",
            caption: "Same table, same database. What changes is who may write it and what others may read.",
        }),

        h2("4. Worked example: move the write behind the owner"),
        p("Start with the rule. It belongs in the `domain` layer of the `enrollment` module, next to the data it protects. An `Enrollment` entity decides which status changes are allowed:"),
        code("typescript", `
// enrollment/domain/Enrollment.ts
export type EnrollmentStatus = "active" | "refunded" | "completed";

export class Enrollment {
    constructor(
        readonly id: string,
        readonly userId: string,
        readonly courseId: string,
        public status: EnrollmentStatus,
        public completedAt: Date | null,
    ) {}

    complete(at: Date): "completed" | "already_completed" | "not_active" {
        if (this.status === "completed") return "already_completed";
        if (this.status !== "active") return "not_active"; // refunded stays refunded
        this.status = "completed";
        this.completedAt = at;
        return "completed";
    }
}`, "enrollment/domain/Enrollment.ts"),
        p("The `application` layer offers the use case to other modules. It loads the enrollment, asks the entity, and saves only if something changed. The repository (`PgEnrollmentRepository`) is the only class in the codebase whose SQL writes `enrollments`:"),
        code("typescript", `
// enrollment/application/EnrollmentService.ts
export interface EnrollmentRepository {
    findById(id: string): Promise<Enrollment | null>;
    save(enrollment: Enrollment): Promise<void>;
}

export class EnrollmentService {
    constructor(private readonly repo: EnrollmentRepository, private readonly clock: () => Date) {}

    async markCompleted(enrollmentId: string): Promise<"completed" | "already_completed" | "not_active" | "not_found"> {
        const enrollment = await this.repo.findById(enrollmentId);
        if (!enrollment) return "not_found";
        const result = enrollment.complete(this.clock());
        if (result === "completed") await this.repo.save(enrollment);
        return result;
    }
}`, "enrollment/application/EnrollmentService.ts"),
        p("The `progress` module keeps its job. It still decides **when** a learner has finished all lessons - that is progress data it owns. It no longer decides **what that does** to the enrollment:"),
        code("typescript", `
// progress/jobs/markCompletedCourses.ts
import type { EnrollmentService } from "../../enrollment/application/EnrollmentService";
import type { LessonProgressQuery } from "../application/LessonProgressQuery";

export async function markCompletedCourses(progress: LessonProgressQuery, enrollments: EnrollmentService) {
    const finished = await progress.enrollmentsWithAllLessonsDone(); // reads progress-owned tables only
    for (const enrollmentId of finished) {
        const result = await enrollments.markCompleted(enrollmentId);
        if (result === "not_active") console.info("skip completion", { enrollmentId, result });
    }
}`, "progress/jobs/markCompletedCourses.ts"),
        p("Run the incident again in your head. The job finds `u_3307`'s enrollment, calls `markCompleted`, the entity sees `refunded` and returns `not_active`. Nothing is written, the log line says why, and the completion email and bonus are never triggered. The progress job did not have to learn about refunds. Next month, when the enrollment module adds a `paused` status, the job does not change either."),
        callout("tip", "Name the dependency in one direction",
            "After the change, `progress` imports `enrollment`, and `enrollment` imports nothing from `progress`. That is the dependency you want: visible, one-way and easy to check with the layer rules from lesson 3. If `enrollment` ever needs to react to progress, let it subscribe to an event instead of importing `progress` back - lesson 7 shows what a cycle costs."),

        h2("5. Reads: publish a view instead of sharing the raw table"),
        p("Writes are fixed. The rename incident was caused by **reads**: three modules selected `status` straight from the table. Moving every read behind a TypeScript function would work, but a list page that joins courses and enrollments is simpler in SQL. The owner can publish a **view** for that:"),
        code("sql", `
-- owned and maintained by the enrollment module (migration 0043)
CREATE VIEW enrollment_summary AS
SELECT id         AS enrollment_id,
       user_id,
       course_id,
       status,
       completed_at
FROM   enrollments;

-- catalog, notifications and progress read the view, never the table
SELECT c.slug, s.status
FROM   courses c
JOIN   enrollment_summary s ON s.course_id = c.id
WHERE  s.user_id = $1;`, "migrations/0043_enrollment_summary.sql"),
        p("The view is a **contract**: a promise about column names and meaning. Now the enrollment team can rename its private column and keep the contract in the same migration:"),
        code("sql", `
-- migration 0044, owned by the enrollment module
BEGIN;
ALTER TABLE enrollments RENAME COLUMN status TO state;
CREATE OR REPLACE VIEW enrollment_summary AS
SELECT id AS enrollment_id, user_id, course_id, state AS status, completed_at
FROM   enrollments;
COMMIT;`, "migrations/0044_rename_status_to_state.sql"),
        p("Readers still see a column called `status`. Only the enrollment module's repository had to change. In Postgres, DDL statements such as `ALTER TABLE` run inside a transaction, so the rename and the new view become visible together."),
        callout("info", "A simple view is not automatically read-only",
            "In PostgreSQL, a view that selects from one table without grouping or joins is automatically updatable: an `UPDATE enrollment_summary SET status = 'completed'` would change the table underneath. \"Read-only\" comes from your rules (code review, the check in section 7) or from database permissions: if each module connects with its own role, `GRANT SELECT ON enrollment_summary TO progress_app` and no `UPDATE` grant makes it enforced by the database."),
        h3("When a shared read-only view is fine"),
        bullets([
            "The **owner** writes and versions it, in its own migrations, and changes it only on purpose.",
            "It shows data that other modules legitimately need for display or decisions: \"is this learner enrolled?\", \"which courses did they complete?\".",
            "Nobody writes through it. Reads cannot break the owner's invariants; writes can.",
            "It does not leak internal details that may change soon: a `refund_reason_code` used only by support stays out of it.",
        ]),

        h2("6. Transactions across modules"),
        p("A **transaction** groups several database changes so that they all happen or none does. Checkout touches two modules: `orders` marks the order paid, and `enrollment` creates the enrollment. If the second step fails, the first must not stay. Before, the god service `OrderService.checkout` wrote both tables with its own SQL. With ownership, each module writes its own table, but inside a monolith they can still share **one** transaction:"),
        code("typescript", `
// orders/application/CompleteCheckout.ts
export async function completeCheckout(db: Database, orders: OrderService, enrollments: EnrollmentService,
                                       orderId: string, userId: string, courseId: string) {
    await db.transaction(async (tx) => {
        await orders.markPaid(tx, orderId);                 // writes orders (owned by orders)
        await enrollments.enroll(tx, userId, courseId);     // writes enrollments (owned by enrollment)
    });                                                      // both commit, or both roll back
}`, "orders/application/CompleteCheckout.ts"),
        p("The transaction handle `tx` is passed to each owner. Each owner still runs its own SQL against its own table, with its own rules. Sharing a transaction is fine; sharing tables is the problem."),
        p("This works because both tables are in **one database** used by **one process**. If `enrollment` ever moved to a separate service with its own database, there would be no single transaction across the two. Teams then use patterns such as the transactional outbox (write an event in the same transaction, deliver it later), which are beyond this course. Keep this cost in mind for lesson 9."),

        h2("7. How to verify ownership"),
        p("Ownership is a rule, and a rule nobody checks erodes. Three cheap checks catch most problems:"),
        numbered([
            "**A writer list per table.** Keep a small map from table to owner in the repository, for example `enrollments -> enrollment`, `orders -> orders`, `lesson_progress -> progress`. A test searches the SQL strings under `src/modules/<module>/` for `INSERT INTO`, `UPDATE` and `DELETE FROM` and fails if a module writes a table it does not own. It is the same idea as the layer check from lesson 3, with tables instead of imports.",
            "**A reader list for raw tables.** The same test fails if a module other than the owner selects from `enrollments` instead of `enrollment_summary`.",
            "**A data audit for the invariant.** A read-only query that should always return zero rows. Run it after the fix and then daily; a row means some code path still breaks the rule.",
        ]),
        code("sql", `
-- should return 0 rows: a refund exists, but the enrollment is not marked refunded
-- (refunds is owned by payments; this query only reads)
SELECT e.id, e.user_id, e.status, r.created_at AS refunded_at
FROM   enrollment_summary e
JOIN   refunds r ON r.user_id = e.user_id AND r.course_id = e.course_id
WHERE  e.status <> 'refunded';`, "audit/refunded_but_not_refunded.sql"),
        p("The unit test of the rule is the fastest proof: create an `Enrollment` with status `refunded`, call `complete()`, and expect `not_active` and an unchanged status. The incident becomes a test that runs on every pull request."),
        p("Check your understanding with two statements on CodeDev code:"),
        challenge("chal_quiz_saf_311"),

        h2("8. Common mistakes"),
        bullets([
            "**Copying the rule instead of moving the write.** Adding `AND status <> 'refunded'` to the progress job's `UPDATE` fixes this incident and leaves two writers. The next new status breaks it again. Detect it: the writer grep from section 2 still shows two modules for one table.",
            "**Calling the owner's repository from another module.** `progress` importing `PgEnrollmentRepository` and calling `save()` is a direct write with extra steps: it skips the rules in `EnrollmentService` and the entity. Detect it: imports of `*/infrastructure/*` from another module fail the layer check of lesson 3.",
            "**Treating a view as a free-for-all.** A view that exposes every column, including ones the owner plans to change, is the raw table with a new name. Detect it: the view selects `*`, or a column in it is not used by any reader.",
            "**Splitting the database to get ownership.** Moving `enrollments` to another database does not fix two writers; it only makes the shared transaction from section 6 impossible. Detect it: a migration plan that moves tables before anyone has listed who writes them.",
            "**One transaction per module, called one after another.** Two separate transactions in checkout can leave a paid order without an enrollment if the second one fails. Detect it: a use case that writes two owners' tables without a shared `tx`.",
        ]),

        h2("9. Checklist"),
        bullets([
            "Every table has one owner module, written down next to the code.",
            "Only the owner's infrastructure layer writes the table; other modules call the owner's application interface.",
            "Invariants such as \"a refunded enrollment is never completed\" are checked in the owner's domain code, with a unit test.",
            "Other modules read through the owner's interface or a view the owner publishes, maintains and versions.",
            "A cross-module write inside the monolith shares one transaction handle; each owner still writes only its own table.",
            "A test or script lists writers and raw readers per table and fails on a module that is not the owner.",
        ]),
        callout("info", "Practice on your own (not graded)",
            "Take a project you know and list, for its five most important tables, every module or file that writes them and every one that reads them (use the grep commands from section 2). Pick one table with more than one writer, choose its owner, and sketch the interface function and the read-only view the other modules would use. Then write the audit query for one invariant of that table and run it on a copy of the data."),

        h2("Sources"),
        bullets([
            "PostgreSQL documentation: CREATE VIEW, section \"Updatable Views\" (when a view is automatically updatable).",
            "PostgreSQL documentation: GRANT, and the chapter \"Data Definition\", section \"Schemas\".",
            "Martin Fowler, bliki entries \"IntegrationDatabase\" and \"ApplicationDatabase\".",
        ]),
    ],
});
