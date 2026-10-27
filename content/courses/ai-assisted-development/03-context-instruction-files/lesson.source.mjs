// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-aad-1-3",
    title: "Context that helps: the right files, conventions & AGENTS.md / CLAUDE.md",
    slug: { _type: "slug", current: "context-and-instruction-files" },
    description:
        "An agent told to \"look through the whole repo\" built the learning streak from a 2024 design document: it queried a table that was dropped a year ago and counted days in UTC, so learners in Vietnam lost their streak at 7 in the morning. Learn which context makes an agent's work better (the files that change, one existing example, the conventions, the failing test and its exact output) and which makes it worse (the whole repository, stale docs, an old session), and how to write a short, true instruction file - AGENTS.md, CLAUDE.md, copilot-instructions - for the CodeDev repository.",
    estimatedTime: 20,

    scenario: {
        role: "Full-stack developer, CodeDev learning platform",
        problem:
            "The new \"current streak\" card on https://app.codedev.test/profile failed on staging with relation \"progress.lesson_completions\" does not exist, and after a quick fix it went to production, where learners in Ho Chi Minh City reported that their streak reset although they studied every morning. The feature was written by a coding agent. To be safe, the developer had told it to read the docs folder and look through the whole repository. The agent read 37 files, including docs/archive/progress-v1.md from 2024, but not the migration that replaced that table and not lib/time/learnerDay.ts, the helper every other daily feature uses. Nothing in the repository told it either fact.",
    },

    content: [
        h2("1. The incident: more context, worse code"),
        p("The request looked generous. The developer wanted the agent to have everything it might need:"),
        code("text", `
> Add a "current streak" card to the profile: the number of consecutive days,
> up to today, on which the learner completed at least one lesson.
> Read the docs/ folder first and look through the whole repo so you
> understand how progress works.`, "the request"),
        p("The agent did read a lot. The core of what it wrote:"),
        code("typescript", `
// lib/progress/streak.ts (first version)
export async function currentStreak(userId: string): Promise<number> {
  const rows = await db.query(
    "SELECT DISTINCT completed_on FROM progress.lesson_completions WHERE user_id = $1 ORDER BY completed_on DESC",
    [userId],
  );
  let streak = 0;
  let day = new Date().toISOString().slice(0, 10);       // today, as "YYYY-MM-DD"
  for (const row of rows) {
    if (row.completed_on !== day) break;
    streak++;
    day = previousDay(day);
  }
  return streak;
}`, "what the agent wrote"),
        p("Its tests mocked `db.query` with rows shaped like the ones in the design document, so all of them passed. Staging failed at the first real query. The developer replaced the table name, and the card shipped. Then the second bug appeared: `toISOString()` is UTC. A learner in Vietnam (UTC+7) who studies at 6:30 in the morning completes lessons on the previous UTC day, so \"today\" in the code has no completion until 7:00 local time and the streak shows 0."),

        h2("2. Read the evidence"),
        p("Three pieces of evidence explain both bugs. First, the staging log:"),
        code("text", `
2026-10-08T03:12:44Z ERROR GET /api/profile/streak 500
  error: relation "progress.lesson_completions" does not exist
  at lib/progress/streak.ts:3`, "staging log"),
        p("Second, where the table name came from. The agent's session log lists the files it read; the first lines of one of them:"),
        code("text", `
# docs/archive/progress-v1.md
Last updated: 2024-03-02

Completions are stored in progress.lesson_completions
(user_id, lesson_id, completed_on date) ...

$ ls db/migrations | grep completion
20250910_004_lesson_progress_completed_at.sql   -- moves completions to
                                                 -- learning.lesson_progress.completed_at
                                                 -- and drops progress.lesson_completions`, "docs and migrations"),
        p("The document was accurate in 2024. A migration replaced the table in September 2025, and nobody updated or removed the document, because no human reads `docs/archive/`. An agent told to read everything does, and it has no way to know which of two contradicting sources is current unless something tells it."),
        p("Third, why the time zone bug was invisible to the agent:"),
        code("bash", `
$ grep -rn "learnerDay(" lib app | wc -l
9
$ grep -rln "learnerDay\\|time zone\\|timezone" docs/ README.md
$                                   # nothing: the rule is written nowhere`, "terminal"),
        p("Nine places in the codebase compute \"the learner's day\" with `learnerDay()` from `lib/time/learnerDay.ts`, which uses the time zone saved in the learner's profile. Every reviewer on the team knows this rule. It is written nowhere, so the agent had to find it by chance among 37 files, and it did not."),

        h2("3. Core idea: context is a selection, not a pile"),
        p("Everything an agent knows about your repository for a task comes from what it reads in that session: what you put in the request, the instruction files it loads at the start, and the files it decides to open. Agents can search a repository by themselves, and they are getting better at it, but two things stay true: they cannot tell a stale document from a current one unless something says so, and a rule that exists only in people's heads cannot be found at all."),
        h3("Context that helps"),
        bullets([
            "**The files that will change**, named explicitly. Here: `lib/progress/` and the profile route.",
            "**One existing example of the same pattern** - the nearest neighbor. The weekly activity chart already queries completions per learner day; pointing at it teaches the current table, the query style and the `learnerDay()` helper at once.",
            "**The conventions that the code alone does not reveal**: time zones, the query helper, error format, naming. Written down, not remembered.",
            "**The failing test and its exact output**, when there is one. `expected 3 to be 4` with a file and a line is worth more than \"the streak is wrong\".",
            "**The command that decides success**: which tests to run, and how.",
        ]),
        h3("Context that hurts"),
        bullets([
            "**The whole repository.** It adds dead copies, legacy folders, generated files and archived docs, each of which can look like the place to change or the pattern to follow. Long contexts also make it easier for the important details to be missed, and they cost time and money.",
            "**Stale documentation.** A confident, well-written, wrong document is worse than no document. Either delete it, update it, or mark it clearly as historical where the agent will read that mark.",
            "**An old session.** A conversation that already contains a previous task's files, errors and decisions carries them into the new task. Start a fresh session for a new task.",
            "**Secrets.** Never paste production credentials, tokens or customer data into the context (lesson 4.2).",
        ]),
        callout("info", "When to give less context on purpose",
            "For a narrow bug fix, giving only the failing test, its output and the one file it covers keeps the agent from \"improving\" the neighborhood. For an exploratory question (\"where is the streak computed?\"), let the agent search. Add context to match the task, not to feel safe."),

        h2("4. Instruction files: the context every session gets"),
        p("Some context is the same for every task in a repository: how to run the tests, where things live, the conventions, what not to touch. Instead of typing it into every request, put it in an instruction file that the tool loads automatically at the start of a session. The common ones:"),
        bullets([
            "**`AGENTS.md`** at the repository root: a plain Markdown convention that a growing number of coding agents read (Codex CLI among them). Which tools support it changes quickly, so check the docs of the tools your team uses.",
            "**`CLAUDE.md`**: read by Claude Code at the start of a session. Claude Code can also include another file by reference from CLAUDE.md; check its current documentation on memory files for the syntax.",
            "**`.github/copilot-instructions.md`**: repository-wide custom instructions for GitHub Copilot.",
            "**Cursor** has project rules (in a `.cursor/` folder in recent versions); see Cursor's current docs.",
        ]),
        p("If your team uses several tools, keep **one source of truth**, usually `AGENTS.md`, and make the tool-specific files short pointers to it or generated copies of it. Two hand-maintained files drift apart within weeks."),
        h3("Short and true"),
        p("An instruction file is read on every task, in full, before the task itself. Two properties matter more than completeness:"),
        bullets([
            "**Short.** Commands, layout, the handful of conventions that are not obvious from the code, what not to touch, what \"done\" means. A page or two. Not a style guide, not an architecture history, not every past decision. The longer the file, the more likely an important line is missed, and the more likely two lines contradict each other.",
            "**True.** Every command in it runs. Every path in it exists. A wrong instruction is worse than a missing one, because the agent trusts it and you stop checking. Update the file in the same pull request that changes a convention, and check it in CI (section 6).",
        ]),

        challenge("chal_quiz_aad_131"),

        h2("5. Worked example: the CodeDev instruction file and a better request"),
        p("After the incident, the team wrote this `AGENTS.md`. It fits on one screen, and every line is something a new developer would otherwise learn the hard way:"),
        code("text", `
# AGENTS.md - CodeDev

## Commands
- Install: \`npm ci\`
- All tests: \`npm test\` (Vitest). One file: \`npx vitest run tests/progress/streak.test.ts\`
- Lint: \`npm run lint\`
- Local Postgres, Redis and the code runner: \`npm run services:up\`

## Layout
- \`app/\`: Next.js pages and API route handlers. Keep handlers thin; logic lives in \`lib/\`.
- \`lib/\`: domain logic by area (progress, ranking, challenges, ...). Prefer pure functions.
- \`db/migrations/\`: SQL migrations, named YYYYMMDD_NNN_description.sql. The newest
  migrations are the truth about the schema.

## Conventions
- Queries go through the helpers in \`lib/db.js\` with parameters; never build SQL from strings.
- "Today", streaks and daily goals use the learner's time zone: \`learnerDay()\` in
  \`lib/time/learnerDay.ts\`. Never \`toISOString().slice(0, 10)\`.
- Completions live in learning.lesson_progress.completed_at.

## Do not
- Edit an applied migration (add a new one), tests you were not asked to change,
  CI config, or dependency versions.
- Add a dependency without asking.
- Use anything in \`docs/archive/\`: it describes the 2024 schema.

## Done means
- \`npm test\` and \`npm run lint\` pass, and you show their output.
- The diff contains only the files the task needs.`, "AGENTS.md"),
        p("Notice what is not in it: no explanation of what a streak is, no React style rules, no history of the schema. Each line either prevents a mistake that has happened or answers a question every task needs. The archive warning and the time zone rule are there because of this incident."),
        p("With the instruction file in place, the request for the task itself can focus on the task and point at exactly the right files:"),
        code("text", `
Add a "current streak" card to the profile.

Behavior: the number of consecutive learner days, ending today or yesterday
(learner's time zone), with at least one completed lesson. 0 if none.

Relevant files:
- lib/progress/weeklyActivity.ts - existing query of completions per learner day;
  follow its query and its use of learnerDay()
- lib/time/learnerDay.ts
- app/api/profile/route.ts - add the streak to this response
- tests/progress/weeklyActivity.test.ts - the fixture style to copy

Write tests in tests/progress/streak.test.ts first, including a learner in
Asia/Ho_Chi_Minh who completes a lesson at 06:30 local time. Show me the tests
before you implement. Then run  npx vitest run tests/progress  and  npm run lint.`, "the request, second attempt"),
        p("The request names four files instead of \"the whole repo\": the ones that change, the nearest neighbor and its test. It states the time zone case as a test to write, because that is the edge case the first version missed. And it asks to see the tests before the implementation, which is the habit from lesson 1.2."),

        h2("6. How to verify the context"),
        numbered([
            "**Ask for the plan before any edit.** \"List the files you will read and change, and your plan, then wait.\" Many agents also have a planning or read-only mode for this. If the plan does not mention `learnerDay()` or mentions a file in `docs/archive/`, correct the context now, before any code exists.",
            "**Check what it actually read.** Most agents show the files they opened and the commands they ran. A file you know is stale in that list is a warning sign even if the result looks right.",
            "**Grep the diff for the conventions.** `git diff | grep -n \"toISOString\\|learnerDay\"` takes two seconds and finds the exact mistake from the incident.",
            "**Check the instruction file itself in CI.** Commands that do not run and paths that do not exist are the most common way these files rot. A small script catches both:",
        ]),
        code("javascript", `
// scripts/check-agents-md.mjs - run in CI: node scripts/check-agents-md.mjs
// Fails when AGENTS.md mentions an npm script or a repository path that does not exist.
import fs from "node:fs";

const text = fs.readFileSync("AGENTS.md", "utf8");
const scripts = JSON.parse(fs.readFileSync("package.json", "utf8")).scripts ?? {};
const problems = [];

for (const [, name] of text.matchAll(/npm run ([\\w:-]+)/g)) {
    if (!(name in scripts)) problems.push(\`"npm run \${name}": no such script in package.json\`);
}
if (/\\bnpm test\\b/.test(text) && !scripts.test) problems.push(\`"npm test": no test script in package.json\`);

for (const [, file] of text.matchAll(/\`((?:app|lib|db|tests|docs|scripts)\\/[\\w./-]*)\`/g)) {
    if (!fs.existsSync(file)) problems.push(\`\${file}: path does not exist\`);
}

for (const problem of problems) console.log(problem);
console.log(problems.length ? \`\${problems.length} problem(s) in AGENTS.md\` : "AGENTS.md: commands and paths OK");
process.exitCode = problems.length ? 1 : 0;`, "scripts/check-agents-md.mjs"),
        p("Run it once now and once after every rename of a script or a folder. It does not prove that the conventions are right, but it guarantees that the mechanical parts of the file are not lying."),

        h2("7. Common mistakes"),
        bullets([
            "**\"Read the whole repo\" as a safety measure.** Spot it: the agent's list of files read is long and includes archived, generated or duplicated code. Name the files that change and one example instead.",
            "**Stale docs left where agents can find them.** Spot it: a document describes tables or endpoints that the newest migrations or routes no longer have. Delete it, update it, or mark it as historical in the document and in the instruction file.",
            "**A rule that lives only in reviewers' heads.** Spot it: the same review comment for the third time (\"use learnerDay()\"). Write it into the instruction file, or better, into a lint rule or a test.",
            "**An instruction file that grew into a wiki.** Spot it: you cannot read it in two minutes, or two lines disagree (\"use npm\" in one section, \"use pnpm\" in another). Cut it to what every task needs and point to longer docs by path.",
            "**Continuing an old session for a new task.** Spot it: the agent refers to files or decisions from the previous task. Start a new session; the instruction file brings back what every task needs.",
        ]),

        h2("8. Summary"),
        bullets([
            "Give the agent a selection, not a pile: the files that change, one existing example, the conventions, the failing test with its exact output and the command that decides success.",
            "Stale docs, the whole repository and old sessions make results worse: remove or mark what is out of date, and start each task fresh.",
            "Keep one short, true instruction file (AGENTS.md, with CLAUDE.md or copilot-instructions pointing to it), update it with the code, and check its commands and paths in CI.",
        ]),

        h2("Sources"),
        bullets([
            "Claude Code documentation: memory and CLAUDE.md files - docs.anthropic.com/en/docs/claude-code/overview",
            "GitHub Copilot documentation: repository custom instructions (.github/copilot-instructions.md) - docs.github.com/en/copilot",
            "AGENTS.md: the open format and the list of tools that read it - agents.md (check which of your tools support it)",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Write an AGENTS.md for a repository you work on, in at most 40 lines, with the five sections from section 5. For every line, ask whether it prevents a real mistake or answers a question every task needs; delete the rest. Add the check script to CI. Then give an agent one real task with only the instruction file and four named files, ask for its plan first, and compare the plan with what you would have done."),
    ],
});
