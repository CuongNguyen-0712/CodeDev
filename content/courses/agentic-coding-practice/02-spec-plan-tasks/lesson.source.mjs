// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-acp-1-2",
    title: "Spec-driven development: spec, plan & tasks small enough for an agent",
    slug: { _type: "slug", current: "spec-plan-tasks-for-agents" },
    description:
        "\"Add course certificates\" became one 34-file pull request that nobody could really review, and certificates went to learners who had failed the quizzes, twice to learners who double-clicked, and to a learner whose results had been revoked. Learn the three checkpoints of spec-driven development - a spec of what and why, a plan of how that a human reviews before code exists, and tasks small enough for one agent session, each with acceptance criteria and a check command - and implement the first task, the eligibility check, exactly from its spec.",
    estimatedTime: 25,

    scenario: {
        role: "Full-stack developer, CodeDev learning platform",
        problem:
            "Three weeks after certificates went live on https://app.codedev.test, support has a list: learners who failed most quizzes have a certificate, some learners have two certificates for the same course, and a learner whose quiz results were revoked for copying answers downloaded one anyway. The feature came from one request to a coding agent, \"Add course certificates for completed courses\", and arrived as PR #517: 34 files, 2,480 added lines, a migration, an API, a PDF renderer, an email and an admin page. The reviewers read the description, skimmed the diff and approved it. The product rules were in the ticket, but the agent was never given the ticket.",
    },

    content: [
        h2("1. The incident: one prompt, one huge pull request"),
        p("The request was one line, because the feature sounded familiar:"),
        code("text", `
> Add course certificates for completed courses. Learners should be able to
> download a PDF certificate from the course page.`, "the request"),
        p("The agent worked for 40 minutes and opened a pull request. Its description was confident and long:"),
        code("text", `
PR #517  feat: course certificates

- New table learning.certificates and migration
- POST /api/certificates issues a certificate when the course is complete
- PDF rendering with the learner's name, course title and date
- "Certificate ready" email, admin page to list certificates
- 41 new tests, all passing

I assumed a course is complete when every lesson has been opened and every
quiz has at least one attempt.

 34 files changed, 2480 insertions(+), 112 deletions(-)`, "PR description, written by the agent"),
        p("The most important line in the whole pull request is the one that starts with \"I assumed\". It defines eligibility, the one rule the feature exists for, and it is wrong: opened lessons instead of completed ones, quiz attempts instead of passes. It sat between a bullet list and a diff stat, and two reviewers approved the PR without discussing it."),

        h2("2. Read the evidence"),
        p("Each support ticket maps to a rule nobody stated. Three queries against production make it concrete:"),
        code("sql", `
-- certificates issued to learners below the course's quiz threshold
SELECT count(*) FROM learning.certificates c
JOIN learning.course_quiz_stats s USING (user_id, course_id)
WHERE s.passed * 100 < s.threshold_percent * s.total;
 count
-------
    31

-- the same learner and course more than once (double click on "Get certificate")
SELECT user_id, course_id, count(*) FROM learning.certificates
GROUP BY user_id, course_id HAVING count(*) > 1;
 user_id  | course_id               | count
----------+-------------------------+-------
 u_51a0e2 | typescript-foundations  |     2
 u_9c13f7 | web-http-fundamentals   |     2
 ...  (9 rows)

-- certificates for results that were revoked for academic integrity
SELECT count(*) FROM learning.certificates c
JOIN identity.integrity_flags f USING (user_id, course_id)
WHERE f.revoked;
 count
-------
     2`, "psql"),
        p("Three rules - pass the quizzes, one certificate per course, no certificate after a revocation - were written in the ticket. The agent never saw the ticket, made a plausible assumption, and wrote 41 tests that confirm the assumption. A review of 2,480 lines does not catch a wrong assumption buried in one sentence. A review of a 15-line spec would have."),

        h2("3. Core idea: three checkpoints before and between the code"),
        p("The previous course showed how a short spec and acceptance tests close the gaps an agent would fill with guesses. That works for one function. For a feature, two more problems appear: the agent picks the design on its own (where code lives, what the database enforces), and the work arrives as one change too big to review. Spec-driven development splits the work into three artifacts, and each one is a checkpoint where a human can correct the direction cheaply:"),
        bullets([
            "**Spec: what and why.** Who does what, the rules as numbered acceptance criteria, what each failure returns, what is out of scope, and the open questions. No design. A reviewer can read it in five minutes, and a product owner can say \"no, revoked learners never get one\".",
            "**Plan: how.** Where the code goes, which existing modules it uses, what the database enforces and what the code checks, the risks. Half a page. This is where you catch \"the agent will put eligibility in a SQL query no test can reach\" before a single line exists.",
            "**Tasks: in which steps.** An ordered list, each task small enough for one agent session and one review, each with the files it may touch, acceptance criteria tied to the spec, and a check command that is red before the task and green after.",
        ]),
        p("Each artifact is also context: the agent working on task T3 reads the spec, the plan and T3, not the whole feature in its head. And every task ends in a check the agent can run - the lesson 1.1 rule, applied to every step."),
        h3("How small is small enough"),
        bullets([
            "**One concern.** The eligibility rules, or the table and its uniqueness, or the route. Not two of them.",
            "**One session.** The agent can finish it without the context filling up with earlier attempts. If a task needs a break halfway, it is two tasks.",
            "**One review.** A diff a reviewer can read carefully in about 15 minutes - in practice a few hundred lines at most.",
            "**One check.** A command that fails now and passes when the task is done. If you cannot name it, the task is not ready.",
        ]),
        h3("When not to"),
        bullets([
            "**A small, well-understood change.** A bug fix with a failing test does not need a plan and a task list; the test is the spec.",
            "**A spike.** If you do not yet know whether something is possible, let the agent explore on a throwaway branch, then write the spec from what you learned.",
            "**A spec that grows into a document nobody reads.** A 20-page spec is skipped by humans and only partly followed by agents. If the spec is longer than the code it describes, cut it.",
        ]),
        callout("info", "Tools for spec-driven development",
            "Several tools now package this workflow: GitHub Spec Kit generates spec, plan and task files and prompts for them, and some agentic IDEs such as Kiro have spec, design and task steps built in. Their file names, commands and steps change between versions, so check their current docs. The checkpoints matter more than the tool: plain Markdown files in the repository and a disciplined review work with any agent."),

        h2("4. Worked example: certificates, the second time"),
        p("The team threw PR #517 away (keeping the PDF template), and wrote three short files in `docs/specs/certificates/`. First the spec. The product owner answered the open questions before anyone wrote a plan:"),
        code("text", `
# Course certificates v1 - spec

Why: learners who finish a premium course want proof. PR #517 issued
certificates to learners who had not earned them.

A learner asks for the certificate of one course. They are eligible when:
  AC1  every required lesson of the course is completed
  AC2  the share of the course's quiz challenges they passed is at least the
       course's threshold (quizzes of other courses do not count; a course
       without quizzes passes)
  AC3  every coding challenge of the course is passed
  AC4  their results for the course are not revoked (academic integrity)
  AC5  a certificate is issued once per learner and course; asking again
       returns the same certificate
  AC6  a learner record that is not well-formed is rejected as invalid_record,
       with no other reason
  AC7  a learner who is not eligible gets every reason that applies, in the
       order AC1, AC2, AC3, AC4, AC5

Out of scope for v1: email, sharing, an admin page.
Open questions: none (answered by product on 2026-10-20).`, "docs/specs/certificates/spec.md"),
        p("Then the plan, which a senior developer reviewed in ten minutes. It is where the design decisions live, so that the agent does not make them alone:"),
        code("text", `
# Certificates v1 - plan

- Eligibility is a pure function in lib/certificates/eligibility.ts: course
  rules + the learner's record in, { eligible, reasons } out. No I/O, so every
  rule is a fast unit test.
- The route loads the record with the existing query lib/progress/learnerRecord.ts
  (it already returns completed lessons, passed challenges and the revoked flag).
- "Issued once" is enforced by the database: UNIQUE (user_id, course_id) and
  INSERT ... ON CONFLICT DO NOTHING, then SELECT. A double click cannot create
  two rows, whatever the code does. The eligibility function only reports
  already_issued when the record already has an issue date.
- PDF: reuse the template from #517, rendered on demand from the stored row.

Risk: AC2 counts passed quiz challenges, not attempts (the #517 bug).`, "docs/specs/certificates/plan.md"),
        p("Notice the decision in the third bullet. The spec says \"issued once\"; the plan decides that the database guarantees it, because a check in code alone cannot stop two concurrent requests. That is a design call, it is now visible and reviewed, and the tasks inherit it. Then the task list:"),
        code("text", `
# Certificates v1 - tasks

## T1  Eligibility check (pure function, no I/O)
Files: lib/certificates/eligibility.ts, tests/certificates/eligibility.test.ts
Acceptance:
  - AC1-AC7 each have at least one test named after the criterion (AC5: a record with an issue date gets already_issued)
  - a learner who breaks several rules gets every reason, in the AC7 order
Check: \`npx vitest run tests/certificates/eligibility.test.ts\`
Depends on: -

## T2  Certificates table and repository
Files: db/migrations/20261026_001_certificates.sql, lib/certificates/repository.ts, tests/certificates/repository.test.ts
Acceptance:
  - a second insert for the same learner and course returns the existing row and adds none (AC5)
  - two concurrent inserts for the same pair leave exactly one row
Check: \`npm run db:verify && npx vitest run tests/certificates/repository.test.ts\`
Depends on: -

## T3  POST /api/certificates
Files: app/api/certificates/route.ts, lib/certificates/issue.ts, tests/certificates/issue.test.ts
Acceptance:
  - eligible: 201 with the certificate; asking again: 200 with the same certificate id
  - not eligible: 403 with the reasons from T1, and no row inserted
Check: \`npx vitest run tests/certificates/issue.test.ts\`
Depends on: T1, T2

## T4  PDF download
Files: app/certificates/[id]/pdf/route.ts, lib/certificates/pdf.ts, tests/certificates/pdf.test.ts
Acceptance:
  - the PDF of a stored certificate contains the learner's name, the course title and the issue date
  - a certificate id of another learner returns 404
Check: \`npx vitest run tests/certificates/pdf.test.ts\`
Depends on: T3`, "docs/specs/certificates/tasks.md"),
        p("Every acceptance line is a sentence a test can decide. Every check is a command. T1 and T2 do not depend on each other, so two agent sessions can do them in parallel, each on its own branch. And no task touches more than three files."),
        h3("Lint the task list"),
        p("Task lists rot like any document: someone adds \"T5: polish the UI, make it work properly\" with no check. A small script in CI keeps the format honest. It does not judge whether a task is a good idea, only whether an agent could know when it is done:"),
        code("javascript", `
// scripts/check-tasks.mjs - usage: node scripts/check-tasks.mjs docs/specs/certificates/tasks.md
import fs from "node:fs";

const VAGUE = /\\b(correctly|properly|robust|clean|as expected|works|nicely|handles? errors)\\b/i;
const MAX_FILES = 5;
const problems = [];

for (const section of fs.readFileSync(process.argv[2], "utf8").split(/^## /m).slice(1)) {
    const lines = section.split("\\n");
    const id = lines[0].split(/\\s+/)[0];
    const value = (name) => lines.find((l) => l.startsWith(\`\${name}:\`))?.slice(name.length + 1).trim() ?? "";

    const files = value("Files").split(",").map((f) => f.trim()).filter(Boolean);
    const start = lines.findIndex((l) => l.startsWith("Acceptance:"));
    const acceptance = [];
    for (let i = start + 1; start >= 0 && /^\\s+-/.test(lines[i] ?? ""); i++) acceptance.push(lines[i].replace(/^\\s+-\\s*/, ""));
    const check = value("Check").match(/\`([^\`]+)\`/)?.[1];

    if (files.length === 0) problems.push(\`\${id}: no Files\`);
    if (files.length > MAX_FILES) problems.push(\`\${id}: \${files.length} files - split the task\`);
    if (acceptance.length === 0) problems.push(\`\${id}: no Acceptance criteria\`);
    for (const line of acceptance) if (VAGUE.test(line)) problems.push(\`\${id}: not checkable: "\${line}"\`);
    if (!check) problems.push(\`\${id}: no Check command in backticks\`);
}
for (const problem of problems) console.log(problem);
console.log(problems.length ? \`\${problems.length} problem(s)\` : "tasks OK");
process.exitCode = problems.length ? 1 : 0;`, "scripts/check-tasks.mjs"),
        code("bash", `
$ node scripts/check-tasks.mjs docs/specs/certificates/tasks.md
tasks OK

$ node scripts/check-tasks.mjs docs/specs/onboarding/tasks.md
T5: not checkable: "the wizard works correctly on mobile"
T5: no Check command in backticks
2 problem(s)`, "terminal"),

        challenge("chal_quiz_acp_121"),

        h2("5. Hand one task to the agent"),
        p("With the three files committed, the request for a task is short, and every word points to something written down:"),
        code("text", `
Do task T1 from docs/specs/certificates/tasks.md.
Read spec.md and plan.md in the same folder first.

Only create or change the two files listed in T1. Do not start T2-T4.
Write the tests first, one per acceptance criterion, and show me the list of
test names before you implement. If the spec does not answer a question,
stop and ask; do not choose.

Done when the T1 check passes and  git diff --stat  lists only the T1 files.`, "the request for T1"),
        p("Three habits make the difference here. **One task per session**: a fresh session for T2, so the context of T1's attempts does not leak in. **Test names before code**: the list of names is a two-minute review that shows whether the agent understood every criterion. **Stop and ask**: a question from the agent is a hole in the spec; the answer goes into `spec.md` and gets an acceptance criterion, not just a reply in the chat."),
        callout("tip", "Your turn",
            "The exercise below is T1. Its description is the spec, written as precisely as the agent would get it. Implement it yourself or with an agent: if you use one, give it the description and the starter, ask for the test names first, and compare them with the criteria. The hidden tests check every criterion and the edge cases the spec states."),
        challenge("chal_coding_acp_122"),

        h2("6. How to verify the spec, the plan and each task"),
        numbered([
            "**Trace every criterion to a test.** Put the AC list next to the test names of the task. A criterion with no test is a rule the agent may ignore; a test with no criterion is behavior nobody asked for.",
            "**Red before green.** Run the task's check before the agent starts. It must fail, on an assertion. A check that already passes cannot tell you the task is done.",
            "**Diff against the task's Files.** `git diff --stat origin/main...HEAD` must list only the files of the task. Anything else is a later task done without its plan, or scope creep.",
            "**Review the plan's decisions in the code.** For T2: is the uniqueness in the migration (`UNIQUE (user_id, course_id)`), or only in an `if` in TypeScript? Grep for it.",
            "**Keep the spec true.** When an answer to a question changes the behavior, change `spec.md` in the same pull request as the code. A spec that disagrees with the code misleads the next agent session.",
        ]),

        h2("7. Common mistakes"),
        bullets([
            "**A feature-sized task.** \"Add certificates\" is a feature, not a task. Spot it: no single command can say it is done, and the diff stat crosses migrations, routes, UI and email.",
            "**Assumptions in the PR description.** \"I assumed ...\" is a decision the spec should have made. Spot it: search agent PR descriptions and session logs for \"assumed\", \"I chose\", \"defaulting to\" and move each one into the spec or reject it.",
            "**A plan nobody reviewed.** If the plan is generated and accepted without reading, the agent made the design alone. Spot it: the plan has no decision a human could disagree with, or no risks.",
            "**Acceptance criteria that are adjectives.** \"Works correctly\", \"clean\", \"robust\". Spot it: you cannot write a test name for the line. The lint script above flags the common ones.",
            "**Tasks that share files.** Two tasks editing the same file in parallel sessions produce conflicts and mixed reviews. Spot it: the same path under Files in two tasks without a dependency between them.",
        ]),

        h2("8. Summary"),
        bullets([
            "Spec-driven development adds three checkpoints: a spec of what and why with numbered acceptance criteria, a plan of how that a human reviews before code exists, and a task list.",
            "A task is small enough when it has one concern, fits one session and one review, and ends in a check command that is red before and green after; each acceptance line must be decidable by a test.",
            "Hand the agent one task at a time with the spec and plan as context, ask for test names first and questions instead of assumptions, and verify by tracing criteria to tests and the diff to the task's files.",
        ]),

        h2("Sources"),
        bullets([
            "GitHub Spec Kit: spec, plan and task workflow for coding agents - github.com/github/spec-kit (check the current docs; commands change)",
            "Claude Code documentation: common workflows, planning before editing - docs.anthropic.com/en/docs/claude-code/overview",
            "AGENTS.md: where agents look for project instructions such as the location of specs - agents.md",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Pick a feature from your backlog that would take a day or two. Write spec.md (at most 20 lines, numbered acceptance criteria, out of scope, open questions), plan.md (at most 10 bullets, at least one decision and one risk) and tasks.md in the format above, and run the lint script on it. Then give T1 to a coding agent with the request from section 5 and compare its test names with your criteria before it writes any code."),
    ],
});
