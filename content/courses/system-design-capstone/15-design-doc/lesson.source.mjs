// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-sdc-5-3",
    title: "Writing the design doc",
    slug: { _type: "slug", current: "writing-the-design-doc" },
    description:
        "The CodeDev platform design doc came back from the architecture review with 14 comments, and ten of them asked the same thing: how do we know? Learn to write a design doc that a reviewer can check: context, goals and non-goals, requirements with numbers, estimates with their assumptions, architecture and data flow, data model, failure modes, cost, alternatives considered, a rollout that can be undone step by step and a verification plan that ties every requirement to a test. Then learn to review one.",
    estimatedTime: 25,

    scenario: {
        role: "Tech lead writing the CodeDev platform design doc for the architecture review board",
        problem:
            "The team spent two weeks on \"CodeDev Platform v2 - design\", 23 pages describing every service, table and endpoint. The architecture review board returned it after one meeting with 14 comments: \"'High traffic on exam day' is not a number\", \"Why a Redis sorted set and not a PostgreSQL table? Nothing is compared\", \"What happens to submissions when the queue is down?\", \"Section 9 says 'roll back if needed' - the change adds a column and backfills 40 million progress rows\", \"How will we know the launch worked?\". None of the comments said the design was wrong. All of them said the reviewers could not tell whether it was right. The launch date is in five weeks.",
    },

    content: [
        h2("1. The incident: a long doc that could not be reviewed"),
        p("The board's comments, grouped by what they ask for:"),
        code("text", `
ARB review, CodeDev Platform v2 - design (v0.3)              14 comments

missing numbers (5)
  #1  "High traffic on exam day" - how high? Peak per second? For how long?
  #4  "Fast submission" - what is fast, at which percentile?
  #9  "Eventually consistent leaderboard" - how eventually? Seconds? Hours?
missing alternatives (3)
  #2  Why a Redis sorted set and not a PostgreSQL table at 200k learners?
  #7  Why a separate certificate service?
missing failure behaviour (3)
  #5  What happens to submissions when the queue is down?
  #11 What does a learner see when Redis is down?
missing rollout / verification (3)
  #12 "Roll back if needed": the migration backfills 40M progress rows. Back to what?
  #13 How will we know the launch worked? Which dashboard, which numbers?
  #14 Who decides to stop the rollout, using which signal?`, "arb-comments-v0.3.txt"),
        p("Twenty-three pages described what the system **is**. Almost nothing said **why**, **how much** or **how we will know**. That is the most common way a design doc fails: it reads like documentation of code that does not exist yet, so the reviewers cannot find the decisions, let alone check them. The fix was not more pages. The v0.4 that the board approved was 11 pages."),

        h2("2. What a design doc is for, and when not to write one"),
        p("A design doc exists to make a decision **before** it is expensive to change, and to let other people check that decision. Everything in it should serve one of three readers:"),
        bullets([
            "**The reviewer** now: can I check every claim? Is there a number, an estimate with its assumptions, or a test behind it?",
            "**The team** during the build: what are we building, what are we deliberately not building, and in what order does it ship?",
            "**The engineer in a year**: why is it like this, what else was considered, and what would have to change for the decision to change?",
        ]),
        p("When **not** to write one: a bug fix, a change behind a flag that can be turned off in a minute, or a decision that is cheap to reverse. A short ADR or a good pull request description is enough there. Write a design doc when the change is hard to undo (a data model, a new service boundary, a migration, a public API), when it touches several teams, or when it changes what the platform promises its users (availability, latency, data retention)."),

        h2("3. The sections, and what each one must contain"),
        p("Every section below maps to a lesson in this course, so you already have the material. What the doc adds is the connection between them: every requirement is met by something in the architecture, every component appears in the failure modes and the cost, and every claim has a way to be checked."),
        numbered([
            "**Context and problem.** Half a page: who the users are, what is wrong or missing today, with evidence (an incident, a metric, a support count). No solution yet.",
            "**Goals and non-goals.** Goals are outcomes. Non-goals are things a reader might expect that you are deliberately not doing (\"no multi-region in v2\", \"no real-time leaderboard for courses with fewer than 50 learners\"). Non-goals prevent half of all review arguments.",
            "**Requirements.** Functional (what the system does) and non-functional with numbers, percentiles and conditions: 200,000 registered learners, 20,000 daily active, peak 340 submissions/s on exam day, p95 300 ms for reads, p95 2 s for submit acceptance (lesson 1).",
            "**Estimates.** Traffic, storage, grader slots, connections, with the assumptions written next to them (lesson 2). A reviewer should be able to change one assumption and recompute.",
            "**Architecture and data flow.** The components, what each owns, and the path of the two or three most important requests, step by step: submit, grade, update progress and leaderboard (lessons 3 and 10).",
            "**Data model.** The tables that hold the source of truth, their keys and the constraints that enforce the invariants (one submission per idempotency key, progress that never moves backwards), plus which stores are projections that can be rebuilt (lessons 4, 6 and 11).",
            "**Failure modes.** The table from lesson 13, with detection, blast radius, mitigation and how each row was verified.",
            "**Cost.** The monthly sheet from lesson 14 and the requirements that drive its biggest lines.",
            "**Alternatives considered.** For each major decision, at least one real alternative, compared on the requirements, and why it lost. \"Industry standard\" is not a reason.",
            "**Rollout.** Phases, flags, migrations in expand/contract order, what each phase can be rolled back to, and the signal that stops it.",
            "**Verification.** How you will know it works: load tests, game days, dashboards and SLOs, tied to the requirements one by one.",
            "**Open questions and decision log.** What is not decided yet, who decides, by when; and after review, what was decided and why.",
        ]),
        callout("info", "Numbers make a doc reviewable",
            "Comment #9 asked \"how eventually?\". The v0.4 answer: \"The leaderboard reflects a passed submission within 5 s at p99 in normal operation, and is rebuilt from PostgreSQL within 5 minutes after losing Redis; measured: p99 1.8 s in the load test, rebuild of 200,000 learners in 3 min 10 s.\" A sentence like that ends a discussion. \"Eventually consistent\" starts one."),

        h2("4. Worked example: the parts of the CodeDev doc that the board asked for"),
        h3("Requirements, with the check written next to each"),
        code("text", `
ID     requirement                                                    check (section 11)
NF-1   Reads: p95 <= 300 ms at 20,000 DAU, normal day                 load test L1 + SLO dashboard "reads"
NF-2   Submit accepted: p95 <= 2 s at 340/s for 3 min (exam peak)     load test L2 (exam profile)
NF-3   Exam grading: graded <= 10 min after acceptance, exam day      load test L2: worst grading delay
NF-4   Leaderboard fresh within 5 s p99; rebuilt <= 5 min             load test L1; rebuild drill R1
NF-5   Learning path 99.95 % / month; works with Redis down           SLO dashboard; game day G1 (Redis stopped)
NF-6   No submission lost or graded twice into the score             idempotency tests; game day G2 (kill -9 grader)
NF-7   Cost <= $5,000 / month at current scale                       billing export by component tag, monthly`, "design-doc s3: requirements"),
        h3("Data model: the source of truth and its invariants"),
        code("sql", `
-- PostgreSQL is the source of truth; Redis holds a cache and a rebuildable leaderboard projection.
CREATE TABLE submissions (
    id               uuid PRIMARY KEY,
    user_id          uuid        NOT NULL REFERENCES users(id),
    challenge_id     text        NOT NULL,
    idempotency_key  text        NOT NULL,
    status           text        NOT NULL CHECK (status IN ('accepted', 'grading', 'passed', 'failed')),
    score            integer,
    accepted_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, idempotency_key)                 -- NF-6: a retried submit returns the first row
);

CREATE TABLE lesson_progress (
    user_id     uuid        NOT NULL REFERENCES users(id),
    lesson_id   text        NOT NULL,
    course_id   text        NOT NULL,                 -- new in v2: added nullable, backfilled, then NOT NULL (s10)
    percent     smallint    NOT NULL CHECK (percent BETWEEN 0 AND 100),
    version     integer     NOT NULL DEFAULT 0,       -- guards against lost updates (lesson 5)
    updated_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, lesson_id)
);

CREATE TABLE outbox (                                  -- events published after commit (lesson 10)
    id          bigserial PRIMARY KEY,
    type        text        NOT NULL,                  -- SubmissionAccepted, ProgressUpdated, CourseCompleted
    key         text        NOT NULL,                  -- consumers deduplicate on it
    payload     jsonb       NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    published_at timestamptz
);`, "design-doc s6: data model"),
        h3("Alternatives considered: one decision, written so it can be challenged"),
        code("text", `
Decision D2: leaderboard storage

Option A  Redis sorted set, projection from ProgressUpdated events   (chosen)
Option B  PostgreSQL table leaderboard(user_id, points) + index on points

                        A                                   B
top 100 read            O(log n + 100), ~1 ms               index scan, ~2-5 ms (measured on a 200k-row copy)
"my rank"               ZREVRANK, O(log n)                  COUNT(*) WHERE points > mine: grows with rank
load on primary         none                                every read and every score change
extra component         no (Redis already runs the cache)   no
loss of data            rebuilt from PG in 3 min 10 s        none
consistency             fresh within 5 s (NF-4)              same transaction as progress

Why A: rank reads ("my rank" on every lesson page) would put ~150 queries/s on the primary at peak
for B; A keeps them off it. Revisit if: Redis is removed for another reason, or the board needs
filters (by country, by course) that a single sorted set does not serve.`, "design-doc s9: alternatives"),
        h3("Rollout: every step can be undone, and each says how"),
        code("text", `
phase  change                                              rollback                                stop signal
1      add column lesson_progress.course_id, nullable      nothing to undo; old code ignores it     lock_timeout 1 s hit
       (expand); new code fills it on every write
2      backfill course_id for 40M rows in batches of 10k,  stop the job; rows already filled are    primary CPU > 70 %, replica lag > 10 s
       throttled                                           valid for old and new code
3      new progress writes behind flag progress_v2,         turn the flag off (old path unchanged)   409 rate > 1 %, progress p95 > 300 ms
       5 % -> 25 % -> 100 % of learners
4      leaderboard projection from events, shadow mode:     disable the consumer                     shadow diff > 0.1 % of learners
       compare with the current board, not shown
5      switch leaderboard reads to the projection          flag back to the current board           NF-4 freshness alert
6      contract: SET NOT NULL on course_id, remove the     (none - only after 2 weeks clean)
       old progress path, two weeks after 100 %`, "design-doc s10: rollout"),
        p("Comment #12 is answered by the second column. \"Roll back the deploy\" does not undo a backfill or data written in a new shape; the plan avoids needing to undo them, because each phase leaves data that both the old and the new code can read (expand and contract, as API Design for Production and Data Consistency & Event-Driven Patterns describe)."),
        challenge("chal_quiz_sdc_531"),

        h2("5. Reviewing a design doc"),
        p("A good review is a set of questions the doc should already answer. Read it in this order, because each step depends on the one before:"),
        numbered([
            "**Requirements first.** Is every non-functional requirement a number with a percentile, a load and a condition? Can you name the test that would fail if it were not met?",
            "**Requirements to design.** For each requirement, which component or mechanism meets it? A requirement no component addresses is a gap; a component no requirement needs is a cost.",
            "**Failure walk.** Pick the two most important journeys and stop each component on their path in your head. Is the answer in the failure-mode table, and was it verified?",
            "**Decisions.** For each hard-to-reverse decision, is there a real alternative compared on the requirements, and a condition under which it would be revisited?",
            "**Rollout and verification.** Can each phase be undone? Who stops it, on which signal? Which dashboard shows the launch worked?",
        ]),
        p("Write comments that can be answered. \"This won't scale\" cannot. \"At 340/s with 4.5 s per job, how many grader slots does the exam window need, and what grading delay does the plan accept?\" can. Mark each comment as **blocking** (the doc cannot be approved without an answer) or **non-blocking** (a suggestion), so the author knows what decides the outcome."),
        p("As the author, answer every comment in the doc itself, not only in the thread: change the section, then record the decision in the decision log with the comment number. The next reader will not have the review thread."),

        h2("6. How to verify the doc before you send it"),
        bullets([
            "**Traceability check.** Every NF requirement has a row in the verification plan with a named test, drill or dashboard. Every component in the architecture appears in the failure-mode table and in the cost sheet.",
            "**Number check.** Search the doc for \"fast\", \"high\", \"scalable\", \"eventually\", \"robust\" and \"if needed\". Each one is either replaced by a number or condition, or deleted.",
            "**Cold reader test.** Give the doc to an engineer outside the team and ask five questions: what is the peak load, what happens when Redis is down, why this leaderboard store, how is phase 3 rolled back, how will we know the launch worked. Every answer they cannot find is a section to fix.",
            "**Recompute one estimate.** Change one assumption (for example 8 submissions per learner per day instead of 5) and check the doc still says which lines of the estimates and the cost sheet move.",
            "**After launch, close the loop.** Fill in the verification table with measured results and link the dashboards. A doc whose numbers were never checked against production is a plan, not a record.",
        ]),

        h2("7. Common mistakes"),
        bullets([
            "**Describing instead of deciding.** Spot it: long sections listing endpoints and fields, and no sentence that starts with \"we chose ... because ...\".",
            "**Adjectives instead of numbers.** Spot it: the requirements section has no percentiles, and reviewers ask \"how much?\" more than once.",
            "**A straw-man alternative.** Spot it: the rejected option is one nobody would build, or it is rejected for a reason that does not appear in the requirements.",
            "**\"Roll back if needed\".** Spot it: the change migrates or backfills data and the rollout section has no per-phase rollback and no stop signal.",
            "**No verification plan.** Spot it: the doc ends at the architecture, and nobody can say which dashboard or test will show the launch met its requirements.",
        ]),

        h2("8. Summary"),
        bullets([
            "A design doc makes hard-to-reverse decisions checkable before they are built: context, goals and non-goals, requirements with numbers, estimates with assumptions, architecture, data model, failure modes, cost, alternatives, rollout and verification.",
            "Connect the sections: every requirement is met by a mechanism and checked by a named test, every component appears in the failure modes and the cost, and every major decision has a real alternative and a condition for revisiting it.",
            "Review by asking for evidence in a fixed order (requirements, design, failures, decisions, rollout), mark comments blocking or not, and answer them in the doc and its decision log.",
        ]),

        h2("Sources"),
        bullets([
            "Martin Fowler: Patterns of Distributed Systems - martinfowler.com/articles/patterns-of-distributed-systems",
            "Google SRE book: Addressing Cascading Failures (for the failure-mode section) - sre.google/sre-book",
            "Michael Nygard: Documenting Architecture Decisions (the ADR format used for small decisions) - cognitect.com/blog",
        ]),
        callout("tip", "Practice on your own (not graded): write the CodeDev design doc",
            "Write the design doc for the CodeDev learning platform you built in this course, in the twelve sections above, in at most 12 pages. Reuse your work: requirements (lesson 1), estimates (lesson 2), architecture (lesson 3), the failure-mode table (lesson 13) and the cost sheet (lesson 14). Give it to one person outside the course with the five cold-reader questions from section 6, then review it yourself with the five steps from section 5, marking each comment blocking or not. Revise it and keep the decision log."),
    ],
});
