// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-acp-1-3",
    title: "Instruction files agents actually follow: AGENTS.md & CLAUDE.md",
    slug: { _type: "slug", current: "instruction-files-agents-follow" },
    description:
        "CodeDev's AGENTS.md had grown to 903 lines. Agents ran commands from it that no longer existed and then declared the work done, and they skipped the one line that said never to edit an applied migration. Learn what makes an instruction file work - short, true, verifiable, specific to the project, with \"never\" lines that carry a reason and an alternative - where the common tools look for these files, how nested per-directory files keep the root small, how to keep the file in sync with CI, why every rule that must hold also needs a check, and how to measure whether agents follow the file at all.",
    estimatedTime: 25,

    scenario: {
        role: "Tech lead, CodeDev learning platform",
        problem:
            "In one sprint three agent sessions went wrong in the CodeDev repository. One ran yarn test:unit, got \"Command not found\", and reported the task done after \"reviewing the change manually\"; CI then failed on 6 tests. One followed the line \"reset your test data with npm run db:reset\", written when that script only reloaded fixtures; today it drops and recreates the whole local database, and a developer lost two days of manual test data. One edited an applied migration although line 712 of AGENTS.md says never to do that. The file is 903 lines long, assembled from the old wiki, the onboarding guide and a 2024 CONTRIBUTING.md. The repository moved from yarn to npm and from Jest to Vitest in 2025; the file was never updated.",
    },

    content: [
        h2("1. The incident: a 903-line AGENTS.md"),
        p("The previous course ended with the advice to write a short, true instruction file. CodeDev had one once. Then it grew. Every incident added a paragraph, every new developer pasted in a section from the wiki, and nobody removed anything because nobody was sure what was still needed. A year later:"),
        code("bash", `
$ wc -l AGENTS.md
903 AGENTS.md

$ grep -n "^#" AGENTS.md | head -20
1:# CodeDev - Developer Guide
14:## History of the platform
61:## Getting started (2024)
140:## Code style
288:## Database
402:## Testing strategy
...
712:## Migrations - IMPORTANT`, "terminal"),
        p("The sessions that went wrong in this sprint all trace back to this file, in two different ways: agents that **followed** it into failure, and agents that **did not follow** it where it mattered."),

        h2("2. Read the evidence"),
        p("The first session, shortened from the agent's log:"),
        code("text", `
read  AGENTS.md
run   yarn test:unit
      -> yarn: error Command "test:unit" not found.
run   yarn test
      -> yarn: error Command "test" not found.
done  "The unit test command is not available in this environment, so I
       reviewed the change manually. The refactoring is complete."`, "agent session log (excerpt)"),
        p("The agent did what line 66 of the file said. The file was wrong, so the agent had no working feedback, and it fell back on its own judgement - exactly the \"no feedback\" failure from lesson 1.1. A quick comparison of the commands in the file with the commands that exist shows how much of the file was fiction:"),
        code("bash", `
$ grep -on "\\(yarn\\|npm run\\|npx\\) [a-z:-]*" AGENTS.md | sort -u -t: -k3 | head
66:yarn test:unit
71:yarn test:e2e
104:yarn dev
288:npm run db:reset
301:npm run db:seed:full
...
$ node -e "console.log(Object.keys(require('./package.json').scripts).join(' '))"
dev build start test lint typecheck verify db:verify db:migrate db:reset services:up`, "terminal"),
        p("Of the 14 distinct commands in the file, 9 did not exist or no longer did what the text said. The third session is the other failure: the never-rule was in the file, at line 712, under a heading full of capital letters, after 700 lines of history and style rules. The agent edited the migration anyway. A rule that only exists as a sentence deep in a long file is a hope, not a guard."),

        h2("3. Core idea: feedforward and feedback"),
        p("An instruction file is **feedforward**: it shapes what the agent does before it acts. Tests, lint, type checks and CI are **feedback**: they catch what it did. Both are part of the harness around an agent, and they fail differently:"),
        bullets([
            "**Feedforward is cheap and soft.** One line can save a whole wrong attempt, but a model may skip a line, especially in a long file where lines compete for attention, or contradict each other.",
            "**Feedback is hard and late.** A failing check cannot be overlooked, but it only fires after the work is done, and only for what it checks.",
        ]),
        p("So the file has one job: give the agent what it needs to act right **on the first try**. And every rule that must never be broken also gets a feedback - a check, a permission rule, a CI step - because the file alone cannot guarantee it. In this course, lessons 2.2 and 2.3 build the feedback side and module 3 the permission side."),
        h3("What makes a line work"),
        bullets([
            "**Short.** Set a budget and keep it: here, 120 lines for the root file and 40 for a nested one. Every line you add makes every other line a little easier to miss.",
            "**True.** Every command runs, every path exists. A wrong instruction is worse than a missing one, because the agent trusts it.",
            "**Verifiable.** You can tell from the session log or the diff whether it was followed. \"Run npm run verify before you say you are done\" is verifiable; \"write clean, maintainable code\" is not, and it costs attention for nothing.",
            "**Specific to this project.** What a capable developer could not guess from the code: the learner time zone helper, the error format, the command that runs everything CI runs. Not what the formatter or linter already enforces - the linter is the instruction for those.",
            "**\"Never\" lines with a reason and an alternative.** \"Never edit a migration that exists on main; add a new one instead (CI compares checksums of applied migrations).\" The reason helps the agent recognise near-cases; the alternative tells it what to do instead of stopping or improvising.",
        ]),
        h3("Where the tools look"),
        p("This changes quickly, so treat the list as a starting point and check the current docs of each tool your team uses:"),
        bullets([
            "**`AGENTS.md`** is an open format read by a growing number of agents. The format allows nested files: an `AGENTS.md` in a subdirectory applies to work in that part of the tree, and the closest one to the files being edited takes precedence over the root.",
            "**`CLAUDE.md`** is read by Claude Code at the start of a session; files in subdirectories are picked up when it works there, and a CLAUDE.md can import another file by reference (see Claude Code's memory docs for the syntax).",
            "**GitHub Copilot** reads `.github/copilot-instructions.md`, supports path-specific instruction files, and its agent features also read `AGENTS.md` - check which of these apply to the Copilot feature you use.",
            "**Cursor** has project rules in its own folder and also supports `AGENTS.md` in recent versions.",
        ]),
        p("Keep **one source of truth**. Write the content in `AGENTS.md`, and make every tool-specific file a one-line pointer or import to it. Two hand-maintained copies drift apart within weeks, and then each agent follows a different version of the rules."),
        h3("When not to put something in the file"),
        bullets([
            "**Knowledge for one kind of task.** How to write a new course lesson, how to add a payment provider: that is a procedure an agent needs only sometimes, and it belongs in a skill that loads when relevant (lesson 2.1), or a doc the file points to by path.",
            "**Anything a tool can enforce.** Import order, quotes, max line length: put it in the linter config. A rule that is both in the file and in the linter wastes a line; a rule only in the file is followed only sometimes.",
            "**History and explanations.** Why the platform moved to Vitest is interesting; it does not help the next task.",
        ]),

        h2("4. Worked example: 903 lines down to 34"),
        p("The team rewrote the file from scratch instead of trimming it. Every line had to pass one test: does it prevent a mistake that has happened, or answer a question nearly every task needs?"),
        code("text", `
# AGENTS.md - CodeDev

Next.js app (app/), domain logic (lib/), Postgres migrations (db/migrations/).
Feature specs: docs/specs/<feature>/ (spec.md, plan.md, tasks.md). Read the
spec of the feature you work on; ask before changing it.

## Commands
- Install: \`npm ci\`
- Everything CI checks: \`npm run verify\` (typecheck, lint, tests, migrations)
- One test file: \`npx vitest run <path>\`
- Local Postgres, Redis and code runner: \`npm run services:up\`

## Conventions you cannot see in the code
- "Today", streaks and daily goals use the learner's time zone:
  learnerDay() in lib/time/learnerDay.ts.
- SQL only through lib/db.js, with parameters.
- Route handlers return errors as { error: "<code>", message } with the status
  from lib/http/errors.ts.

## Never
- Never edit a migration that exists on main; add a new one
  (CI compares checksums of applied migrations).
- Never delete, skip or loosen a test to make a check pass; stop and explain.
- Never connect to a database other than localhost; there are no production
  credentials in this environment, and if a task seems to need them, stop.
- Never add or upgrade a dependency without asking.

## Done means
- \`npm run verify\` exits 0; show the last 20 lines of its output.
- \`git diff --stat\` lists only the files the task names.

## More (read only when the task needs it)
- db/migrations/AGENTS.md - writing migrations
- docs/architecture.md - module boundaries`, "AGENTS.md"),
        p("Notice the \"Done means\" section: it names one command, `npm run verify`, which is exactly what CI runs. The migration details moved into a nested file next to the migrations, which agents load when they work there and which costs nothing on every other task:"),
        code("text", `
# Migrations (applies to db/migrations/)
- Name: YYYYMMDD_NNN_description.sql; NNN starts at 001 each day.
- A new NOT NULL column takes two migrations: add it nullable and backfill,
  then set NOT NULL in a later one.
- Check: \`npm run db:verify\` applies all migrations to an empty database.`, "db/migrations/AGENTS.md"),
        p("And the tool-specific files became pointers. If a tool supports importing, use the import; otherwise a short sentence works for an agent too:"),
        code("text", `
# CLAUDE.md
The instructions for this repository are in AGENTS.md (and nested AGENTS.md
files in subdirectories). Read AGENTS.md first.`, "CLAUDE.md"),

        h3("Every \"never\" gets a sensor"),
        p("The four \"Never\" lines are the rules with the highest cost when broken, so none of them relies on the file alone:"),
        bullets([
            "Applied migrations and tests: `npm run agent:check` from lesson 1.1 fails on a changed applied migration, a deleted test or an added `.skip`; CI runs the same script.",
            "Databases other than localhost: the environment has no production credentials, and the agent's permission rules block database commands to other hosts (lesson 3.1).",
            "Dependencies: the tool asks before `npm install`, and CI flags a changed `package.json` dependency list for an explicit review (lesson 3.2).",
        ]),

        h3("Keep the file in sync with CI"),
        p("The cheapest way to stop the file from lying about commands is to give it only one command to be right about, and to check that promise automatically. The team added this script to `npm run verify`, so it runs in CI and in every agent's \"done\" check:"),
        code("javascript", `
// scripts/check-agent-files.mjs - instruction files: within budget, real commands, same "done" as CI
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const BUDGET = { root: 120, nested: 40 };
const scripts = JSON.parse(fs.readFileSync("package.json", "utf8")).scripts ?? {};
const ci = fs.readFileSync(".github/workflows/ci.yml", "utf8");
const files = execFileSync("git", ["ls-files", "*AGENTS.md"], { encoding: "utf8" })
    .split("\\n")
    .filter((f) => f === "AGENTS.md" || f.endsWith("/AGENTS.md"));
const problems = [];

for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    const lines = text.split("\\n").length;
    const budget = file === "AGENTS.md" ? BUDGET.root : BUDGET.nested;
    if (lines > budget) problems.push(\`\${file}: \${lines} lines, budget \${budget}\`);
    for (const [, name] of text.matchAll(/npm run ([\\w:-]+)/g)) {
        if (!(name in scripts)) problems.push(\`\${file}: "npm run \${name}" is not in package.json\`);
    }
    if (/\\b(yarn|pnpm) /.test(text)) problems.push(\`\${file}: mentions yarn or pnpm; this repository uses npm\`);
}
if (!fs.readFileSync("AGENTS.md", "utf8").includes("npm run verify")) problems.push("AGENTS.md: Done means must name npm run verify");
if (!/run:\\s*npm run verify\\b/.test(ci)) problems.push("ci.yml: CI must run npm run verify, the command AGENTS.md promises");

for (const problem of problems) console.log(problem);
console.log(problems.length ? \`\${problems.length} problem(s)\` : \`\${files.length} instruction file(s) OK\`);
process.exitCode = problems.length ? 1 : 0;`, "scripts/check-agent-files.mjs"),
        code("bash", `
$ node scripts/check-agent-files.mjs     # against the 903-line version
AGENTS.md: 903 lines, budget 120
AGENTS.md: "npm run db:seed:full" is not in package.json
AGENTS.md: "npm run test:watch" is not in package.json
AGENTS.md: mentions yarn or pnpm; this repository uses npm
AGENTS.md: Done means must name npm run verify
5 problem(s)

$ node scripts/check-agent-files.mjs     # after the rewrite
2 instruction file(s) OK`, "terminal"),
        p("The script cannot tell whether a convention is right. It guarantees the mechanical parts: the file stays within budget, its commands exist, and its definition of done is the one CI enforces. When someone renames a script or changes CI, the build tells them the instruction file needs the same change, in the same pull request."),

        challenge("chal_quiz_acp_131"),

        h2("5. Measure whether agents follow it"),
        p("Agents are not deterministic. The same task with the same file can go well twice and badly the third time, so one good session proves very little. The team measured instead, before and after the rewrite:"),
        numbered([
            "**A task set.** Eight real tasks from last month's pull requests, from a one-line fix to a small feature, each with its starting commit.",
            "**Repeated runs.** Each task three times per version of the file, in a fresh worktree, with the same agent and model.",
            "**Mechanical scoring.** A script reads the session log and the diff: was the done command run and did it pass, was a command used that does not exist, did the diff touch a guarded path, did it stay within the task's files. Nobody scores by reading and feeling.",
        ]),
        code("text", `
                                         903-line file    34 lines + nested file
done command run and passing                 9/24              22/24
a command that does not exist was used      11/24               0/24
applied migration changed                    3/24               0/24  (agent:check blocks it)
diff only touched the task's files          14/24              20/24`, "results, CodeDev repository"),
        p("Read the last column carefully. The migration rule is at 0 because a check enforces it, not because the file is perfect; without the check the shorter file would still be read and skipped now and then. And the numbers belong to this repository, this task set, this agent and this model. Run the measurement again when any of them changes - a new model version can follow the same file differently."),

        h2("6. How to verify an instruction file"),
        numbered([
            "**Run every command in it.** Literally, in a fresh clone. The check script covers npm scripts; other commands (`npx`, `docker`, shell) still need a human or a smoke test once in a while.",
            "**Read it in two minutes.** If you cannot, the agent will also miss things. Count lines against the budget.",
            "**Map every \"never\" to its sensor.** For each line, name the check, permission rule or CI step that catches a violation. A never-line with no sensor is a candidate for one, or a sign that the rule is not important enough to be there.",
            "**Look for conflicts.** Root and nested files must not disagree, and the tool-specific files must point to `AGENTS.md`, not repeat it.",
            "**Measure after changes.** A small task set, a few runs each, scored by a script. Compare with the last result before you decide that a rewrite helped.",
        ]),

        h2("7. Common mistakes"),
        bullets([
            "**The file as a wiki.** History, onboarding, style guides and architecture in one place. Spot it: it is over budget, and it contains sections no task in the last month needed.",
            "**Commands nobody runs.** A file that says `yarn` in an npm repository, or a script that was renamed. Spot it: the check script, or an agent log with \"command not found\" followed by \"done\".",
            "**Rules the linter already enforces.** Spot it: a line in the file and a rule in the lint config say the same thing. Delete the line.",
            "**\"Never\" with no reason, no alternative and no sensor.** Spot it: the line is in capitals, and nothing fails when it is broken.",
            "**Copies instead of pointers.** `AGENTS.md`, `CLAUDE.md` and `copilot-instructions.md` each with their own version of the commands. Spot it: `diff` the files; any difference in commands is a bug in one of them.",
        ]),

        h2("8. Summary"),
        bullets([
            "An instruction file is feedforward: keep it short, true, verifiable and specific to the project, with \"never\" lines that carry a reason and an alternative; move area rules into nested files and task procedures into skills or linked docs.",
            "Keep one source of truth in AGENTS.md with tool-specific pointers, check its budget and commands in CI, and make its \"done\" the same command CI runs.",
            "The file alone cannot guarantee a rule: give every \"never\" a sensor, and measure compliance with repeated, mechanically scored runs instead of trusting one good session.",
        ]),

        h2("Sources"),
        bullets([
            "AGENTS.md: the open format, nested files and the tools that read it - agents.md",
            "Claude Code documentation: memory and CLAUDE.md files - docs.anthropic.com/en/docs/claude-code/overview",
            "GitHub Copilot documentation: repository and path-specific custom instructions - docs.github.com/en/copilot",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Take the instruction file of a repository you work on (or write one). Set a line budget, then go through it line by line: keep a line only if it prevented a real mistake or answers a question nearly every task needs. Move area rules into a nested AGENTS.md, write the sensor for each never-line, and add the check script to CI. Then pick five past tasks, run each three times with an agent before and after the change, and score the runs with a script."),
    ],
});
