// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-pgp-1-2",
    title: "How to read EXPLAIN ANALYZE: nodes, costs & actual rows",
    slug: { _type: "slug", current: "read-explain-analyze-nodes-costs-rows" },
    description:
        "The course leaderboard took a second, the top node of its plan was a Sort, and on-call raised work_mem - nothing changed, because the time was in an index lookup that ran 9,412 times. Learn to read EXPLAIN ANALYZE as a tree: cost versus actual time, per-loop numbers and loops, self time versus inclusive time, estimated versus actual rows, filters, buffers, InitPlans and SubPlans, and the JSON format that tools read.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer, CodeDev learning platform",
        problem:
            "The leaderboard tab of a course (GET https://api.codedev.test/courses/42/leaderboard) takes about one second for the largest courses. The on-call developer captured EXPLAIN ANALYZE, saw a Sort at the top of the plan with an actual time of 987 ms and raised work_mem from 4 MB to 256 MB for the API role. The leaderboard is exactly as slow as before, and every API connection may now use far more memory per sort.",
    },

    content: [
        h2("1. The incident: blaming the first big number"),
        p("This is the plan the on-call developer attached to the ticket. Read the first lines the way they did:"),
        code("sql", `
EXPLAIN (ANALYZE, BUFFERS)
SELECT u.id, u.email, count(*) AS completed
FROM lesson_progress lp
JOIN users u ON u.id = lp.user_id
WHERE lp.course_id = 42
  AND lp.completed_at IS NOT NULL
GROUP BY u.id, u.email
ORDER BY completed DESC
LIMIT 20;`),
        code("text", `
Limit  (cost=1236.41..1236.46 rows=20 width=44) (actual time=987.112..987.118 rows=20 loops=1)
  Buffers: shared hit=28462 read=9512
  ->  Sort  (cost=1236.41..1236.65 rows=95 width=44) (actual time=987.110..987.114 rows=20 loops=1)
        Sort Key: (count(*)) DESC
        Sort Method: top-N heapsort  Memory: 27kB
        ->  GroupAggregate  (cost=1232.79..1234.27 rows=95 width=44) (actual time=962.381..985.902 rows=2210 loops=1)
              Group Key: u.id
              ->  Sort  (cost=1232.79..1233.03 rows=95 width=36) (actual time=962.360..968.204 rows=9412 loops=1)
                    Sort Key: u.id
                    Sort Method: quicksort  Memory: 1103kB
                    ->  Nested Loop  (cost=0.99..1229.67 rows=95 width=36) (actual time=0.071..951.330 rows=9412 loops=1)
                          ->  Index Scan using lesson_progress_course_id_idx on lesson_progress lp  (cost=0.56..424.13 rows=95 width=8) (actual time=0.040..19.877 rows=9412 loops=1)
                                Index Cond: (course_id = 42)
                                Filter: (completed_at IS NOT NULL)
                                Rows Removed by Filter: 3180
                          ->  Index Scan using users_pkey on users u  (cost=0.43..8.45 rows=1 width=36) (actual time=0.098..0.098 rows=1 loops=9412)
                                Index Cond: (id = lp.user_id)
Planning Time: 0.391 ms
Execution Time: 987.402 ms`, "psql"),
        p("\"The Sort takes 987 ms\" is the conclusion of someone who read only the top line. But both sorts report `Memory`, not `Disk` - they never spilled, so `work_mem` was never the limit. And a node's actual time includes everything below it. To find where the time goes you have to read the whole tree, from the inside out, and do a little arithmetic."),

        h2("2. Reproduce it safely"),
        p("`EXPLAIN` alone shows the plan the planner would choose, with estimates only. `EXPLAIN ANALYZE` **runs the statement** and adds what really happened. Two consequences:"),
        bullets([
            "On `INSERT`, `UPDATE` or `DELETE`, EXPLAIN ANALYZE really changes data. Wrap it: `BEGIN; EXPLAIN ANALYZE UPDATE ...; ROLLBACK;`.",
            "It takes as long as the query (plus some timing overhead). For a statement that runs for an hour, start with plain EXPLAIN, or capture the plan with auto_explain (lesson 1).",
        ]),
        p("Add `BUFFERS` for page counts (lesson 1), and use the same parameter values that are slow in production - course 42, not course 7. In PostgreSQL 16 and 17 `BUFFERS` must be asked for; `SETTINGS` adds any planner settings that differ from the defaults, which is how you would have spotted the raised `work_mem` in a captured plan."),

        h2("3. How a plan is built"),
        p("A plan is a tree of **nodes**. Each node produces rows and passes them to its parent: scans read tables or indexes, joins combine two inputs, Sort, Aggregate and Limit work on what they receive. The indentation and the `->` arrows show the tree. Execution starts at the top - the Limit asks its child for rows - but the work happens at the leaves, so read a plan **inside out**: start at the most indented nodes and walk up."),
        p("Every node line has two parentheses. The first is the planner's prediction, the second is the measurement:"),
        code("text", `
Index Scan using users_pkey on users u  (cost=0.43..8.45 rows=1 width=36) (actual time=0.098..0.098 rows=1 loops=9412)
                                          ^^^^ ^^^^ ^^^^^^ ^^^^^^^^^        ^^^^^^^^^^^^^^^^^ ^^^^^^ ^^^^^^^^^^^
                                          startup..total  est. rows/width   first..last row   rows    executions
                                          cost (per execution)              ms, per execution  per execution`),
        h3("Cost: the planner's units, not time"),
        p("`cost=0.43..8.45` is measured in arbitrary units where reading one page sequentially costs `seq_page_cost = 1.0`, a random page `random_page_cost = 4.0`, processing one row `cpu_tuple_cost = 0.01`. The first number is the startup cost (before the first row can be returned), the second the total cost to return every row. A parent's cost includes its children. Costs exist to compare alternative plans for the same query; they are not milliseconds, and plain EXPLAIN predicts no duration."),
        p("`rows=95` is the estimated number of rows the node returns **per execution**, and `width` the estimated average row size in bytes."),
        h3("Actual: per execution, and loops"),
        p("`actual time=0.098..0.098` is the time in milliseconds until the first row and until the last row, **averaged over the executions** of the node. `rows=1` is also an average per execution. `loops=9412` says how many times the node was executed. The inner side of a Nested Loop runs once per outer row, so here the users lookup ran 9,412 times."),
        p("Two derived numbers matter more than anything printed on the line:"),
        bullets([
            "**Inclusive time** = actual total time x loops: the time spent in this node and everything below it.",
            "**Self (exclusive) time** = inclusive time of the node - the inclusive times of its direct children: the work of this node alone.",
            "**Rows produced** = actual rows x loops.",
        ]),

        h2("4. Worked example: where did the second go?"),
        p("Apply the formulas to every node of the leaderboard plan, from the leaves up:"),
        code("text", `
node                                 total x loops        inclusive    - children         = self
-----------------------------------  -------------------  -----------  -----------------  -----------
Index Scan users_pkey (inner)        0.098 x 9412         922.376 ms   -                  922.376 ms
Index Scan lesson_progress (outer)   19.877 x 1            19.877 ms   -                   19.877 ms
Nested Loop                          951.330 x 1          951.330 ms   922.376 + 19.877     9.077 ms
Sort (u.id)                          968.204 x 1          968.204 ms   951.330             16.874 ms
GroupAggregate                       985.902 x 1          985.902 ms   968.204             17.698 ms
Sort (count DESC)                    987.114 x 1          987.114 ms   985.902              1.212 ms
Limit                                987.118 x 1          987.118 ms   987.114              0.004 ms`, "self-time.txt"),
        p("93% of the query is the 9,412 primary-key lookups into `users`. Each one is fast (0.098 ms), but the plan does it thousands of times, and `Buffers: ... read=9512` at the top says most of those lookups had to fetch a page from outside shared_buffers. The two sorts together cost about 18 ms. Raising `work_mem` could not help."),
        callout("info", "Rounding and parallel plans",
            "Per-loop times are rounded averages, so a self time computed this way can come out a few microseconds negative: treat it as 0. In a parallel plan, loops counts the leader plus the workers and times are averages per process, so the simple formula overstates the work below a Gather; read the per-worker lines (VERBOSE) there."),

        challenge("chal_quiz_pgp_121"),

        h2("5. Estimated versus actual rows: why this plan was chosen"),
        p("Now compare the two parentheses of the outer scan: `rows=95` estimated, `rows=9412` actual. The planner was wrong by a factor of 99. With 95 outer rows, 95 index lookups into `users` really are the cheapest plan - about 800 cost units. With 9,412 they are not: a Hash Join that reads the matching users once would win. The plan is not \"bad\"; it is the right plan for the wrong number."),
        p("This is the most useful habit when reading a plan: **find the lowest node where estimate and actual diverge by 10x or more**. Everything above it was planned on a wrong number, so fixing the estimate often fixes the plan. Lesson 3 explains where `rows=95` comes from and how to correct it. For the incident, a quick check confirmed the cause: `pg_stat_user_tables` showed that lesson_progress had not been analyzed since a bulk import of 3 million rows earlier that morning; autovacuum had not reached it yet."),
        code("text", `
ANALYZE lesson_progress;

Limit  (cost=21018.22..21018.27 rows=20 width=44) (actual time=118.204..118.210 rows=20 loops=1)
  ...
        ->  Hash Join  (cost=9622.10..20961.40 rows=9380 width=36) (actual time=61.035..104.877 rows=9412 loops=1)
              Hash Cond: (lp.user_id = u.id)
  ...
Execution Time: 118.731 ms`, "psql"),
        p("The estimate is now 9,380, the planner picks a Hash Join, and the query drops from 987 ms to 119 ms. Note what changed and what did not: same SQL, same indexes, same `work_mem` (the change to 256 MB was reverted) - only the planner's knowledge of the data."),

        h2("6. Other lines worth reading"),
        bullets([
            "**`Rows Removed by Filter: 3180`**: the node read rows and threw them away after reading. A large number next to a small output means the index or the condition does not match the query (lesson 4).",
            "**`Sort Method: external merge  Disk: 51200kB`**: the sort spilled to disk; this is when `work_mem` matters. `quicksort Memory` and `top-N heapsort Memory` did not spill.",
            "**`Heap Fetches: 4872`** on an Index Only Scan: rows whose visibility had to be checked in the table, because the visibility map was not up to date (VACUUM sets it).",
            "**`(never executed)`**: the node was planned but never ran, for example the inner side of a join whose outer side returned nothing. In JSON it shows `\"Actual Loops\": 0`.",
            "**`InitPlan` and `SubPlan`**: subqueries attached to a node. An InitPlan runs once (for example `created_at > (SELECT max(created_at) - interval '7 days' FROM users)`); a SubPlan can run once per row of its parent - a correlated subquery in the SELECT list with `loops=812` ran 812 times. Their time is included in the node they are attached to.",
            "**`Workers Planned: 2  Workers Launched: 2`** under a Gather: a parallel plan, see the callout above.",
        ]),

        h2("7. The JSON format, for tools"),
        p("Text plans are for people. `EXPLAIN (ANALYZE, FORMAT JSON)` returns the same tree as JSON, which is what visualizers such as explain.depesz.com or PEV2 read and what `auto_explain.log_format = json` writes to the log. The inner node of the leaderboard plan looks like this (shortened):"),
        code("json", `
{
  "Node Type": "Index Scan",
  "Parent Relationship": "Inner",
  "Index Name": "users_pkey",
  "Relation Name": "users",
  "Alias": "u",
  "Startup Cost": 0.43,
  "Total Cost": 8.45,
  "Plan Rows": 1,
  "Plan Width": 36,
  "Actual Startup Time": 0.098,
  "Actual Total Time": 0.098,
  "Actual Rows": 1,
  "Actual Loops": 9412,
  "Index Cond": "(id = lp.user_id)"
}`),
        p("Children sit in a `\"Plans\"` array, and `\"Parent Relationship\"` says how each child is attached: `Outer`, `Inner`, `Member` (of an Append), `InitPlan` or `SubPlan`. The CodeDev slow-query dashboard stores these JSON plans; it needs to point at the node that really costs the time instead of the top one. Build that analysis:"),
        challenge("chal_coding_pgp_122"),

        h2("8. How to verify your reading"),
        bullets([
            "**The self times add up.** The sum of all self times should be close to the root's inclusive time, and the root's inclusive time close to `Execution Time`. If they do not, you missed loops or a SubPlan.",
            "**Change the suspected node and re-run.** After ANALYZE, the users lookups disappeared and the time dropped by the amount the self-time table predicted. If you change something and the time does not move, your reading was wrong - as with work_mem.",
            "**Compare the buffers.** The Hash Join plan touched far fewer pages than 9,412 random lookups; BUFFERS shows it independently of the cache state.",
            "**Check the plan in production.** The auto_explain log after the deploy should show the Hash Join for course 42 too.",
        ]),

        h2("9. Common mistakes and how to spot them"),
        bullets([
            "**Reading actual time as a total.** Spot it: a node with `loops` greater than 1; multiply before you compare.",
            "**Blaming the top node.** Spot it: compute self times; a parent whose time is almost all in its children is not the problem.",
            "**Reading cost as milliseconds.** Spot it: someone quotes a plain EXPLAIN as \"the query takes 1,229 ms\".",
            "**Tuning memory for a sort that never spilled.** Spot it: `Sort Method` says `Memory`, not `Disk`.",
            "**Fixing the plan instead of the estimate.** Spot it: a 10x gap between estimated and actual rows below the expensive node; fix the estimate first (lesson 3) before reaching for hints or new indexes.",
        ]),

        h2("10. Summary"),
        bullets([
            "Read a plan as a tree from the inside out; cost is the planner's estimate in its own units, actual time and rows are per execution, and loops says how many executions there were.",
            "Self time = actual total time x loops minus the children's (actual total time x loops); the node with the largest self time is where the query spends its time.",
            "Compare estimated and actual rows at every node: the lowest large misestimate usually explains why the plan was chosen.",
        ]),

        h2("Sources"),
        bullets([
            "PostgreSQL documentation: Using EXPLAIN (section 14.1) - postgresql.org/docs/current/using-explain.html",
            "PostgreSQL documentation: EXPLAIN (options ANALYZE, BUFFERS, SETTINGS, FORMAT) and Planner Cost Constants (seq_page_cost, random_page_cost)",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Take the slowest statement from pg_stat_statements on a database you own, run EXPLAIN (ANALYZE, BUFFERS) with production-like parameters and fill in a self-time table like the one in section 4. Then paste the FORMAT JSON version into a plan visualizer and check that it highlights the same node you found by hand."),
    ],
});
