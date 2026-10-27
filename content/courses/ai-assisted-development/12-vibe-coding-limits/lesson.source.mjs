// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-aad-4-3",
    title: "Vibe coding: when to use it, when to stop & how to keep an AI usage log",
    slug: { _type: "slug", current: "vibe-coding-when-to-use-when-to-stop-ai-usage-log" },
    description:
        "The same developer vibe-coded a demo that delighted the product team and a data migration that rewrote the completion dates of 18,000 learners. Learn what vibe coding is, where it is the right tool (prototypes, throwaway scripts), where it has to stop (auth, payments, data migrations, users' data), what cognitive debt costs, the signals that tell you to stop prompting and debug yourself, and how an honest AI usage log makes your pull requests easier to review.",
    estimatedTime: 18,

    scenario: {
        role: "Developer and tech lead, CodeDev learning platform",
        problem:
            "On Friday a developer built a clickable \"Which course should I take next?\" quiz for a product demo in two hours, entirely by prompting, and it was a hit. On Monday the same developer used the same approach for the backfill of the new progress_percent column on learning.enrollments: one prompt, accept, run. The script also rewrote completed_at. 18,000 learners who had finished courses got Monday's date as their completion date, certificates showed the wrong date, and the course-completion EXP bonus was recalculated for some of them. Nobody could say why the script touched completed_at, because nobody had read it.",
    },

    content: [
        h2("1. The incident: same habit, different stakes"),
        p("The Friday demo and the Monday migration were written the same way. In both cases the developer described the goal, accepted what the assistant produced, ran it, and judged the result by whether it seemed to work. The demo was a success because nothing depended on it: it ran on fake data, nobody would maintain it, and it was deleted after the meeting. The migration was a failure for the same reason in reverse: it ran on production data, it could not easily be undone, and the one property that mattered (\"change only progress_percent\") was never checked."),
        p("This lesson is about telling those two situations apart before you start, and about noticing early when one has turned into the other."),

        h2("2. Read the evidence"),
        p("The migration that ran in production, exactly as generated:"),
        code("sql", `
-- 20261026_backfill_progress_percent.sql (AI-generated, accepted without edits)
UPDATE learning.enrollments e
SET progress_percent = round(100.0 * p.done / p.total),
    completed_at = CASE WHEN p.done = p.total THEN now() ELSE NULL END
FROM (
  SELECT enrollment_id,
         count(*) FILTER (WHERE completed) AS done,
         count(*) AS total
  FROM learning.lesson_progress
  GROUP BY enrollment_id
) p
WHERE p.enrollment_id = e.id;`, "the migration"),
        p("The request had said \"backfill progress_percent from lesson_progress\". The assistant also \"kept completed_at consistent\", which sounds helpful and is wrong twice: learners who finished a course got `now()` instead of their real completion date, and learners whose courses had gained lessons since they finished lost their completion entirely. The local run looked perfect:"),
        code("text", `
$ psql codedev_local -f 20261026_backfill_progress_percent.sql
UPDATE 40

$ psql codedev_prod -f 20261026_backfill_progress_percent.sql
UPDATE 2104388`, "terminal"),
        p("Forty rows of seed data, no errors, no reason to look closer. The question that would have caught it takes one query: how many rows change `completed_at`?"),
        code("sql", `
-- dry run: what would the UPDATE change, column by column?
SELECT count(*) FILTER (WHERE e.completed_at IS DISTINCT FROM
         CASE WHEN p.done = p.total THEN now() ELSE NULL END) AS completed_at_changes,
       count(*) AS rows_touched
FROM learning.enrollments e
JOIN (SELECT enrollment_id, count(*) FILTER (WHERE completed) AS done, count(*) AS total
      FROM learning.lesson_progress GROUP BY enrollment_id) p ON p.enrollment_id = e.id;`, "dry run"),
        p("Any non-zero `completed_at_changes` for a migration that should only add a percentage is a stop sign. The repair took a day: restore `completed_at` from the nightly backup, recompute the EXP bonus for affected learners, and reissue certificates."),

        h2("3. Core idea: vibe coding is a mode, not a skill level"),
        p("Andrej Karpathy named the practice in February 2025: you describe what you want, accept the code without reading it, paste errors back until it works, and largely forget that the code exists. The term spread fast enough that Collins chose \"vibe coding\" as its Word of the Year for 2025. The defining trait is not using AI; it is **not reading the result** and judging it only by its behaviour on the cases you happen to try."),
        h3("When it is the right tool"),
        bullets([
            "**Prototypes and demos** that answer a question (\"would learners use a recommendation quiz?\") and are then thrown away or rewritten.",
            "**Throwaway scripts** with a visible result: rename 200 image files, turn a CSV into JSON once, draw a chart for a meeting.",
            "**Exploring an unfamiliar API or library** in a scratch project, to learn its shape before you write the real thing.",
            "**Personal tools** that only you run, on your own data, where a failure costs you a few minutes.",
        ]),
        p("What these have in common: the code will not be maintained, no other person's data passes through it, and if it is wrong you will see it immediately and the damage is small."),
        h3("Where it has to stop"),
        bullets([
            "**Authentication and authorization**: a check that \"works\" for your account and lets every account through looks identical in a demo.",
            "**Payments and anything with money or EXP rewards**: double charges and double rewards appear only under retries and concurrency you will not try by hand.",
            "**Data migrations and backfills**: they run once, on everything, and are hard to undo. The incident is the textbook case.",
            "**Anything with users' data**: personal data, submissions, progress. Mistakes become privacy incidents.",
            "**Code that others will maintain**: if nobody understood it when it was merged, nobody will understand it when it breaks.",
        ]),
        p("For these, use AI the way the rest of this course teaches: a spec and acceptance tests first (lesson 2), small steps, every diff read before it is accepted (lesson 4), and a review that checks the dangerous parts (lessons 7-9)."),
        h3("Cognitive debt"),
        p("Every accepted change you cannot explain is a loan. The code works today, but the understanding that should come with it is missing, and the interest is paid later: during an incident at night, in a review where nobody can answer \"why is this here?\", or when the next change breaks an assumption nobody knew existed. Researchers at the MIT Media Lab used the term **cognitive debt** in a 2025 study of people writing essays with an AI assistant, who later remembered and owned much less of what they had produced. The same thing happens with code. Prototypes can afford the debt because they are deleted; production code cannot."),
        callout("info", "A quick test before you accept a diff",
            "Could you explain every changed line to a reviewer, and say what would break if it were removed? If not, you are vibe coding, whatever the tool is called. That is fine for the Friday demo and not fine for the Monday migration."),

        h2("4. When to stop prompting and debug yourself"),
        p("The other way vibe coding goes wrong is the loop: a test fails, you paste the error, the assistant changes something, the test still fails, you paste again. Each round adds changes on top of changes. These signals mean the loop is not converging:"),
        bullets([
            "**The third failed attempt at the same problem.** Two tries are normal; a third without progress means the assistant does not have the information it needs, and more prompts will not create it.",
            "**You cannot explain the current diff.** If you could not walk a teammate through what changed since the last green commit, you no longer know the state of your own code.",
            "**The fixes go after the evidence.** The assistant edits the test's expected value, deletes an assertion, or wraps the failure in a `try/catch` that returns a default. The symptom disappears and the bug stays.",
            "**The error moves around.** Each attempt fails differently, in different files. The changes are not narrowing the problem.",
        ]),
        p("What to do instead is ordinary debugging, and it is fast because the problem is usually small:"),
        numbered([
            "**Stop and get back to solid ground.** Commit or stash the experiment, and return to the last commit where the tests passed.",
            "**Reproduce with the smallest failing case.** One test, the fewest inputs. For the streak bug: two timestamps and one time zone.",
            "**Read the code on that path yourself.** Add a log or a breakpoint where the value first goes wrong. Write down a hypothesis before you change anything.",
            "**Then bring the AI back, with a precise question.** \"streakDay() uses getDate() on a Date in the server's time zone; how do I get the calendar day in a given IANA time zone with Intl?\" gets a correct answer far more often than \"fix the failing test\".",
        ]),

        challenge("chal_quiz_aad_431"),

        h2("5. The AI usage log"),
        p("Reviewers need to know where to look. A short, honest log at the end of a pull request description tells them, and costs two minutes to write while the session is fresh. CodeDev's template:"),
        code("text", `
AI usage log
- Tool: <assistant / agent>, <how many sessions>
- Main prompts: <the 2-4 prompts that shaped the code, summarised>
- Where the AI was wrong: <wrong assumptions, invented APIs or packages, edits outside the task>
- Fixed by hand: <what you rewrote, and why>
- Verified: <tests added or run, manual checks, queries>
- Not verified: <what you did not check, so the reviewer can decide>`, "PULL_REQUEST_TEMPLATE.md (excerpt)"),
        p("Three rules keep the log useful:"),
        bullets([
            "**Be specific about mistakes.** \"Used the server's local time instead of the learner's time zone\" sends the reviewer to the right function; \"some fixes\" sends them nowhere.",
            "**Separate generated from understood.** The parts you rewrote by hand and the parts covered by acceptance tests you wrote first need less attention than a large block that was accepted as is. Say which is which.",
            "**Do not use it as a disclaimer.** \"Generated by AI\" does not move responsibility. You are the author of what you merge; the log helps others check your work, it does not excuse it.",
        ]),
        p("Over time the logs also teach the team something: which tasks the assistant handles well, which mistakes it repeats (and which instruction file or test would prevent them), and where its suggestions should not be trusted at all."),

        h2("6. How to verify that you stayed on the right side"),
        bullets([
            "**Before you start**, classify the task: throwaway or merged? Does users' data, money, auth or a migration pass through it? Write the answer in the issue.",
            "**Before you accept a diff**, apply the explain-every-line test from section 3.",
            "**Before you run a migration**, run the dry-run query that counts changes per column, take a backup or write the down migration, and try it on a copy of production-sized data.",
            "**Before you open the pull request**, fill in the AI usage log, including what you did not verify.",
            "**When a loop starts**, count attempts. At the third, stop and debug.",
        ]),

        h2("7. Common mistakes, and how to spot them"),
        bullets([
            "**Promoting a prototype to production.** Spot it: a demo branch merged \"because it already works\", with no tests and no spec. Rewrite it with the normal process, using the prototype as the spec.",
            "**Trusting the assistant's summary of its own code.** Spot it: \"the migration is idempotent and safe\" quoted in a pull request as evidence. The summary is a claim; the dry run and the tests are evidence.",
            "**Prompting through a failure for an hour.** Spot it: a session with ten versions of \"still failing, fix it\". Stop at the third.",
            "**Accepting a fix that edits the test.** Spot it: a diff where the expected value changed in the same commit as the code. Ask what the correct behaviour is before you accept either.",
            "**An empty or decorative usage log.** Spot it: \"AI helped with this PR\". A useful log names mistakes and checks.",
        ]),

        h2("8. Summary"),
        bullets([
            "Vibe coding means accepting code without reading it. It is the right tool for prototypes, demos and throwaway scripts, and the wrong one for auth, payments, data migrations and anything with users' data.",
            "Unread code is cognitive debt. Stop prompting at the third failed attempt or when you cannot explain the diff, return to the last green commit and debug from the smallest failing case.",
            "End every AI-assisted pull request with an honest usage log: main prompts, where the AI was wrong, what you fixed by hand, and what was and was not verified.",
        ]),
        callout("tip", "Next: harnessing coding agents",
            "This course kept the AI on a short leash: you prompt, you read, you decide. The Agentic Coding course (E7 in the CodeDev track) goes further: running coding agents on longer tasks with permissions, sandboxes, hooks, subagents and automated checks that keep them inside the lines."),
        callout("tip", "Practice on your own (not graded)",
            "Pick a small feature in a side project. Build it once as a vibe-coded prototype in a scratch branch and time it. Then build it again for real: spec and tests first, every diff read, and an AI usage log at the end. Compare the two: what did the prototype get wrong that you would not have noticed without the tests?"),
    ],
});
