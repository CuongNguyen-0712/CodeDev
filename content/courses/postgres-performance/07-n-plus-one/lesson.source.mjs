// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-pgp-3-1",
    title: "N+1 queries: one query instead of a loop",
    slug: { _type: "slug", current: "n-plus-one-queries-one-query-instead-of-a-loop" },
    description:
        "The \"My learning\" page of CodeDev sends 121 queries for a learner with 60 courses, and every one of them is fast in pg_stat_statements. Learn why N+1 costs round trips rather than execution time, how to spot it in an APM trace, in pg_stat_statements and in a test that counts queries, how to replace the loop with one join and aggregate (LEFT JOIN, COUNT(DISTINCT), stable order), when two batched queries beat one join, and how to verify the rewrite with EXPLAIN ANALYZE.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer, CodeDev learning platform",
        problem:
            "Support forwards a complaint from a learner with 60 enrolled courses: the \"My learning\" page takes almost half a second, while it is instant for new learners. The database dashboard looks healthy: CPU at 20%, no slow queries over the 100 ms threshold of log_min_duration_statement. But the APM trace of GET /api/me/courses shows 121 database spans for one request, and the two most frequently called statements in pg_stat_statements have over 900,000 calls each in the last hour.",
    },

    content: [
        h2("1. The incident: a page that is slow only for good learners"),
        p("The \"My learning\" page lists every course a learner is enrolled in, with the number of lessons they have finished. Its handler was written early, when learners had two or three courses, and it reads naturally:"),
        code("typescript", `
// api/me/courses.ts - the version that shipped
const enrollments = await db.query(
    "SELECT course_id FROM enrollments WHERE user_id = $1 AND status <> 'cancelled' ORDER BY created_at DESC, id DESC",
    [userId]);
const cards = [];
for (const { course_id } of enrollments.rows) {
    const course = await db.query("SELECT title FROM courses WHERE id = $1", [course_id]);
    const done = await db.query(
        \`SELECT count(DISTINCT lesson_id) AS n FROM lesson_progress
          WHERE user_id = $1 AND course_id = $2 AND completed_at IS NOT NULL\`, [userId, course_id]);
    cards.push({ courseId: course_id, title: course.rows[0].title, completed: Number(done.rows[0].n) });
}`, "courses.ts"),
        p("One query to find the enrollments, then two queries per enrollment. A learner with N courses costs **1 + 2N** queries: 5 for a new learner, 121 for the learner in the complaint. This shape is called **N+1** (one query for the list, one more per item), and it is the most common reason an endpoint gets slower as users become more active, with no single slow query to blame."),
        callout("info", "ORMs write this loop for you",
            "The same pattern appears without a visible loop when an ORM loads a relation lazily: course.title inside a template triggers one SELECT per course. Prisma, TypeORM, Sequelize, Django and ActiveRecord all have a way to load the relation up front (include, relations, select_related/prefetch_related, includes). The diagnosis below is the same whatever produced the queries."),

        h2("2. Read the evidence: fast queries, slow page"),
        p("Start from the trace, because it shows what the request waited for. One request, as the APM tool records it:"),
        code("text", `
GET /api/me/courses  user_id=4812  status=200  duration=412 ms
  db.query  SELECT course_id FROM enrollments WHERE user_id = $1 ...      3.1 ms  x1
  db.query  SELECT title FROM courses WHERE id = $1                       2.8 ms  x60
  db.query  SELECT count(DISTINCT lesson_id) FROM lesson_progress ...    3.4 ms  x60
  db spans: 121, db time: 376 ms`, "APM trace"),
        p("Then look at the same statements from the database side. `pg_stat_statements` groups executions by normalized query text, so a statement called in a loop shows up as a huge `calls` count with a tiny mean:"),
        code("sql", `
SELECT calls, round(mean_exec_time::numeric, 3) AS mean_ms,
       round(total_exec_time::numeric) AS total_ms, left(query, 60) AS query
FROM pg_stat_statements
ORDER BY calls DESC
LIMIT 3;

  calls  | mean_ms | total_ms |                            query
---------+---------+----------+--------------------------------------------------------------
  912340 |   0.021 |    19159 | SELECT title FROM courses WHERE id = $1
  912338 |   0.048 |    43792 | SELECT count(DISTINCT lesson_id) FROM lesson_progress WHERE
   15206 |   0.090 |     1369 | SELECT course_id FROM enrollments WHERE user_id = $1 AND sta`, "psql"),
        p("Put the two views side by side. PostgreSQL spends about 0.02 to 0.05 ms executing each statement, yet the application waits about 3 ms for each one. The difference is everything around execution: taking a connection from the pool, sending the statement over the network, parse and bind, executing, and reading the answer back. That cost is paid per statement, so it is multiplied by N. The ratio of calls is the giveaway: 912,340 / 15,206 is 60, the number of courses per request."),
        bullets([
            "**Why the slow query log missed it:** `log_min_duration_statement = 100ms` logs single statements over 100 ms. No statement here comes close; the request is slow because of how many there are.",
            "**Why it hurts the database too:** 900,000 executions an hour hold connections from the pool for longer, so under load other requests wait for a connection even though every query is trivial.",
            "**Why it grows:** the cost is linear in N. Active learners, large courses and admin pages that loop over thousands of rows are where N+1 turns into timeouts.",
        ]),

        h2("3. Core idea: send the question once"),
        p("The database can answer the whole page in one statement: start from the rows that define the page (the user's enrollments), join what each row needs, and aggregate. The loop then runs inside the executor, where each lookup costs microseconds instead of a round trip."),
        p("Three decisions make the rewrite correct, not just fast:"),
        numbered([
            "**The driving table decides the rows.** The page has one card per enrollment, so `FROM enrollments` comes first. Starting from `lesson_progress` would drop every course the learner has not started.",
            "**Optional children need a LEFT JOIN, filtered in ON.** A course with no finished lesson still needs its card. `LEFT JOIN lesson_progress ... ON ... AND lp.completed_at IS NOT NULL` keeps the enrollment with a row of NULLs; the same condition in `WHERE` would remove that row again and turn the LEFT JOIN back into an inner join.",
            "**Aggregate what the loop counted, with the same rules.** The old query counted `DISTINCT lesson_id`, because a double click on \"Complete\" can store a lesson twice. `COUNT(DISTINCT lp.lesson_id)` keeps that rule and returns 0 for the NULL row of the LEFT JOIN.",
        ]),
        h3("When not to fold everything into one join"),
        p("One statement is the goal for one list. It is not a rule that every page must be a single SQL statement:"),
        bullets([
            "**Two independent child lists fan out.** Joining enrollments to both lesson_progress and submissions multiplies the rows: 8 progress rows x 5 submissions = 40 rows per course before aggregation, and plain COUNT and SUM silently become wrong. Aggregate each child in its own subquery or CTE, or run one batched query per child.",
            "**Batching is a fine fix.** Two queries, `SELECT ... FROM enrollments WHERE user_id = $1` and `SELECT course_id, count(DISTINCT lesson_id) FROM lesson_progress WHERE user_id = $1 AND course_id = ANY($2) GROUP BY course_id`, cost 2 round trips whatever N is. This is what DataLoader in GraphQL and prefetch_related in Django do. N+1 is a problem of growth, not of the number 2.",
            "**A small, bounded N may not be worth it.** A settings page that loads 3 fixed rows does not need a rewrite. Fix the loops whose N grows with data: enrollments, lessons, comments, leaderboard rows.",
        ]),

        challenge("chal_quiz_pgp_311"),

        h2("4. Worked example: the same loop on the instructor dashboard"),
        p("You rewrite the \"My learning\" page in the challenge below. Here the same three decisions are applied to a second N+1 found in the same week: the instructor dashboard of a course lists its lessons with the number of different learners who finished each one, and it sent one count query per lesson. The lessons are in `lessons(id, course_id, title, sort_order)`; `lesson_progress` is the table from section 1."),
        code("sql", `
SELECT l.id, l.title, count(DISTINCT lp.user_id) AS finished_by
FROM lessons AS l
LEFT JOIN lesson_progress AS lp
       ON lp.lesson_id = l.id
      AND lp.completed_at IS NOT NULL
WHERE l.course_id = $1
GROUP BY l.id
ORDER BY l.sort_order, l.id;`, "course_dashboard.sql"),
        bullets([
            "**The driving table is lessons**, because the dashboard has one row per lesson. A lesson nobody has finished keeps its row through the LEFT JOIN, and `count(DISTINCT lp.user_id)` returns 0 for it; a learner who finished a lesson twice counts once.",
            "**GROUP BY l.id** groups per lesson. PostgreSQL lets you select `l.title` and order by `l.sort_order` without listing them, because both depend on the grouped primary key (functional dependency).",
            "**ORDER BY ends with a unique column.** `sort_order` is not unique while an instructor is reordering lessons, and rows with the same value would change places between runs. `l.id` makes the order stable.",
            "**The index that serves it:** `lesson_progress (lesson_id)` turns the per-lesson lookup into an index probe. Without it the join becomes a scan of the progress table or a hash join, still one round trip, but worth checking in the plan.",
        ]),
        p("The plan for course 12, which has 24 lessons:"),
        code("text", `
Sort  (cost=1406.21..1406.27 rows=24 width=48) (actual time=6.981..6.984 rows=24 loops=1)
  Sort Key: l.sort_order, l.id
  Sort Method: quicksort  Memory: 27kB
  ->  GroupAggregate  (cost=1299.12..1405.66 rows=24 width=48) (actual time=3.310..6.952 rows=24 loops=1)
        Group Key: l.id
        ->  Sort  (cost=1299.12..1316.92 rows=7120 width=44) (actual time=3.291..3.802 rows=7093 loops=1)
              Sort Key: l.id
              Sort Method: quicksort  Memory: 742kB
              ->  Nested Loop Left Join  (cost=0.71..842.55 rows=7120 width=44) (actual time=0.028..2.240 rows=7093 loops=1)
                    ->  Index Scan using lessons_course_sort on lessons l  (cost=0.28..9.70 rows=24 width=40) (actual time=0.011..0.034 rows=24 loops=1)
                          Index Cond: (course_id = 12)
                    ->  Index Scan using lesson_progress_lesson_id on lesson_progress lp  (cost=0.43..31.73 rows=297 width=8) (actual time=0.004..0.071 rows=296 loops=24)
                          Index Cond: (lesson_id = l.id)
                          Filter: (completed_at IS NOT NULL)
                          Rows Removed by Filter: 12
Planning Time: 0.412 ms
Execution Time: 7.102 ms`, "EXPLAIN ANALYZE"),
        p("The inner index scan still runs 24 times (`loops=24`), but inside one statement and in microseconds per loop. The dashboard now pays one round trip plus 7 ms of execution instead of 25 round trips, and the count stays at one query when the course grows to 200 lessons."),
        h3("The same rewrite in the application code"),
        code("typescript", `
const { rows } = await db.query(COURSE_DASHBOARD_SQL, [courseId]);   // one round trip, whatever N is
const lessons = rows.map((r) => ({ lessonId: r.id, title: r.title, finishedBy: Number(r.finished_by) }));`, "dashboard.ts"),
        callout("info", "In this course's challenges",
            "The code runner has SQLite, not PostgreSQL. The challenge below runs your query on SQLite through a connection that counts every db.execute call, like a query log for one request. The SQL above is portable: SQLite accepts the same GROUP BY, LEFT JOIN and COUNT(DISTINCT), and it allows bare columns in a grouped SELECT."),

        h2("5. How to verify"),
        bullets([
            "**Count queries per request in a test.** Wrap the database client (or use the ORM's query event) and assert the count for a learner with 1 and with 50 enrollments. The count must be the same for both: that is the definition of \"not N+1\".",
            "**Compare results before and after.** Run the old loop and the new query on the same fixture, including a course with no progress, a lesson stored twice and a cancelled enrollment, and assert identical output. A faster wrong page is not a fix.",
            "**pg_stat_statements after the deploy.** `SELECT pg_stat_statements_reset();` before, then the per-course statements should disappear from the top of `ORDER BY calls DESC`, and the new statement should have about as many calls as the endpoint has requests.",
            "**EXPLAIN (ANALYZE, BUFFERS) of the new statement** for your most active learner, not an empty test account: check that the progress lookup uses the index and that the row counts match what you expect.",
            "**The APM trace:** one db span per request, and request duration that no longer grows with the number of courses.",
        ]),
        code("python", `
class CountingDb:
    def __init__(self, conn):
        self.conn, self.queries = conn, 0
    def execute(self, sql, params=()):
        self.queries += 1
        return self.conn.execute(sql, params)

db = CountingDb(conn)
load_my_courses(db, user_id=1)
assert db.queries == 1, f"expected 1 query, got {db.queries}"`, "test_my_courses.py"),

        challenge("chal_coding_pgp_312"),

        h2("6. Common mistakes"),
        bullets([
            "**An inner join to the optional table.** Courses without progress vanish from the page. Spot it: a fixture with an enrollment and no progress returns fewer rows than enrollments.",
            "**The child filter in WHERE after a LEFT JOIN.** `WHERE lp.completed_at IS NOT NULL` removes the NULL row the LEFT JOIN kept, with the same effect as an inner join. Spot it: the plan shows a plain `Nested Loop` or `Hash Join` where you wrote LEFT JOIN, because the planner noticed the join can be reduced.",
            "**COUNT(column) where the loop counted DISTINCT.** A lesson stored twice now counts twice, and a course shows 4 of 3 lessons. Spot it: add a duplicate progress row to the fixture.",
            "**Joining two child tables at once.** Counts and sums are multiplied by the size of the other child. Spot it: compare `count(*)` before GROUP BY with the number of rows of each child; aggregate children separately.",
            "**Dropping the tie-breaker from ORDER BY.** The loop's first query had `created_at DESC, id DESC`; the rewrite keeps only `created_at` and cards with the same timestamp change places between reloads. Spot it: enrollments created in the same second in the fixture.",
        ]),

        h2("7. Summary"),
        bullets([
            "N+1 costs round trips, not execution time: each statement is fast in pg_stat_statements, but the request waits about a round trip per statement, N times. Look for a calls ratio equal to the list size and many short spans in one trace.",
            "Replace the loop with one statement that starts from the rows that define the page, LEFT JOINs optional children with their filter in ON, aggregates with the loop's rules (COUNT DISTINCT) and orders by a unique key. Batch with `= ANY($1)` when one join would fan out.",
            "Prove it with a test that counts queries (the same count for 1 and 50 items), the same results on edge data, and EXPLAIN ANALYZE on a realistic user.",
        ]),

        h2("Sources"),
        bullets([
            "PostgreSQL documentation: Using EXPLAIN - postgresql.org/docs/current/using-explain.html",
            "PostgreSQL documentation: pg_stat_statements - postgresql.org/docs/current/pgstatstatements.html",
            "PostgreSQL documentation: GROUP BY and functional dependency (SELECT, section GROUP BY Clause)",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Pick one list endpoint of a project you work on, wrap its database client to count queries, and call it for a user with 1 item and a user with 50. If the counts differ, rewrite it as one join or as batched queries with = ANY($1), and compare the APM traces before and after."),
    ],
});
