// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-acp-2-1",
    title: "Agent Skills: packaging know-how in SKILL.md",
    slug: { _type: "slug", current: "agent-skills-packaging-know-how-skill-md" },
    description:
        "A coding agent wrote a migration that locked the enrollments table for 40 seconds, although the team had a skill that explains exactly how to avoid it: the agent never opened the skill. Learn what an Agent Skill is (a folder with a SKILL.md: name, description, instructions, optional scripts and references), how agents load skills step by step, why the description decides whether a skill is used, when a skill is the wrong tool, and how to validate every SKILL.md in CI.",
    estimatedTime: 20,

    scenario: {
        role: "Backend developer who owns the agent setup, CodeDev learning platform",
        problem:
            "On Monday 12 October at 10:04, enroll and progress requests to https://api.codedev.test start failing with 504 Gateway Timeout for about 40 seconds, right after a deploy. The deploy ran migration 20261012_add_enrollment_source.sql, written by a coding agent for the task \"add a source column to enrollments\". It backfilled all 2.1 million rows in one UPDATE and then set the column NOT NULL, blocking every write to enrollments while it ran. The repository has a write-migration skill that forbids exactly this, written two months earlier after a similar outage. The agent's session shows the skill in its list of available skills, but SKILL.md was never opened.",
    },

    content: [
        h2("1. The incident: the know-how existed, the agent never read it"),
        p("This is the migration the agent wrote and a reviewer approved. Each statement is correct SQL, and on the reviewer's laptop with 300 enrollments it ran in milliseconds:"),
        code("sql", `
-- db/migrations/20261012_add_enrollment_source.sql (as merged)
ALTER TABLE enrollments ADD COLUMN source text;

UPDATE enrollments
SET source = CASE WHEN referrer LIKE 'mobile:%' THEN 'mobile' ELSE 'web' END;

ALTER TABLE enrollments ALTER COLUMN source SET NOT NULL;`, "20261012_add_enrollment_source.sql"),
        p("In production, the `UPDATE` touched 2.1 million rows in one transaction and held a lock on every one of them until it committed; progress updates for those enrollments waited behind it. `SET NOT NULL` then scanned the whole table while holding a lock that blocks all reads and writes. The Postgres log shows the waiting requests:"),
        code("text", `
10:04:12 LOG:  process 48211 still waiting for ShareLock on transaction 99120334 after 1000.112 ms
10:04:12 DETAIL:  Process holding the lock: 47990. Wait queue: 48211, 48215, 48230.
10:04:12 STATEMENT:  UPDATE enrollments SET progress = $1, updated_at = now() WHERE id = $2
...
10:04:51 LOG:  process 48211 acquired ShareLock on transaction 99120334 after 39876.402 ms`, "postgres.log"),
        p("The painful part is that the team already knew this. After a similar outage in August, they wrote the procedure down as a skill: add the column as nullable, backfill in batches from a job, add the constraint later, and run a checker script before opening the pull request. The skill was in the repository. This is its frontmatter:"),
        code("text", `
.claude/skills/write-migration/SKILL.md
---
name: Write Migration
description: Database things.
---
# Write a database migration
...`, "SKILL.md (before)"),

        h2("2. Reproduce it and read the evidence"),
        p("Open the agent's session for the task (most agents keep a transcript you can scroll or export). The relevant lines are short:"),
        code("text", `
> Task: add a source column to enrollments ("web" or "mobile", from referrer)
> Skills available: Write Migration - Database things.
> Reading db/schema.sql
> Reading db/migrations/20260830_add_course_tags.sql
> Creating db/migrations/20261012_add_enrollment_source.sql
> Running npm test ... 214 passed`, "agent session (excerpt)"),
        p("The agent saw one line about the skill and decided it did not fit the task. Read that line the way the agent does, with nothing else: \"Database things\" says neither what the skill does nor when it applies. The task said \"add a column\"; nothing in the description connects the two. The agent then did what agents do without guidance: it copied the style of the most recent migration in the folder, which happened to be a small table where a one-step backfill is harmless."),
        p("There is a second problem. The folder is `write-migration` but the name is `Write Migration`, with capitals and a space. The open Agent Skills format expects a short, lowercase, hyphenated name that matches the folder. Tools do not all react the same way to a name that breaks the rules: one may skip the skill with a warning, another may load it anyway, another may ignore it silently. You cannot see which in the pull request, so do not depend on any of them. Check the files yourself, in CI."),
        p("To confirm the diagnosis, rerun the same task in a fresh session on a throwaway branch, once with the old skill and once with the fixed one (section 4), and compare: did the agent open SKILL.md, did it run the checker script, does the migration follow the procedure?"),

        h2("3. Core idea: a skill is know-how the agent loads when it needs it"),
        p("An **Agent Skill** is a folder that teaches an agent one procedure. Anthropic published the format in late 2025 as an open specification, and several coding agents now read it; whether your tool supports skills, and in which folders it looks for them, is something to check in its current documentation (Claude Code, for example, reads project skills from `.claude/skills/<name>/SKILL.md`). The folder looks like this:"),
        code("text", `
write-migration/
  SKILL.md                  required: frontmatter (name, description) + instructions
  scripts/check-migration.sh    optional: code the agent runs instead of re-deriving it
  reference/naming.md           optional: long material the agent reads only if needed`, "a skill folder"),
        p("`SKILL.md` starts with YAML frontmatter between two `---` lines. Two keys matter for every skill: `name` (lowercase letters, digits and hyphens, the same as the folder) and `description` (what the skill does and when to use it). The format allows a few optional keys too; check the current specification before you rely on one. After the frontmatter comes the body: plain markdown instructions."),
        h3("Loaded in steps, so the description is the trigger"),
        p("Skills are designed for **progressive disclosure**. An agent cannot read every skill in full on every task, so the format splits a skill into levels:"),
        numbered([
            "**Always:** the name and description of every installed skill, a line or two each. This is all the agent knows about a skill when it reads your task.",
            "**When the skill fits the task:** the body of SKILL.md. The agent decides this from the description alone.",
            "**When the body points to them:** files in the folder, such as `reference/naming.md` or `scripts/check-migration.sh`. A long reference file costs nothing on tasks that never need it; a script is run, so its code does not even have to be read.",
        ]),
        p("That is why the description is not documentation, it is the **trigger**. A good one says *what* the skill does and *when* to use it, in words that match how tasks are written: \"Writes a safe Postgres migration ... Use when a task adds, changes or drops a table, column or index.\" Vague descriptions (\"Database things\", \"Helper for the API\") are passed over; descriptions that claim everything (\"Use for any backend task\") get loaded on tasks they do not fit and crowd the context."),
        h3("Skills, instruction files and tools: which one when"),
        p("Lesson 1.3 kept AGENTS.md short and true, because it is loaded into every session. Skills are the other half of the same idea:"),
        bullets([
            "**AGENTS.md / CLAUDE.md** - rules that apply to almost every task: how to run the tests, which folders are generated, \"never edit a merged migration\". Always loaded, so every line has a cost.",
            "**A skill** - a procedure needed on some tasks: writing a migration, adding a course to the catalog seed, cutting a release. Loaded only when it fits.",
            "**A tool or a check** - anything that can be enforced: a lint rule, a CI job, a pre-commit hook, a script that fails. If a rule can be checked by a machine, check it; do not only ask the agent nicely.",
        ]),
        callout("warning", "When a skill is the wrong answer",
            "Do not write a skill for a rule every task needs (it belongs in AGENTS.md), for something a linter or CI can enforce (enforce it), for a one-off task (put it in the task), or to hold secrets (a skill folder is plain files in the repository, readable by anyone and any agent). And treat a third-party skill like a dependency: its scripts run with the agent's permissions, so read them before you install it."),
        challenge("chal_quiz_acp_211"),

        h2("4. Worked example: the write-migration skill, fixed"),
        p("The fix has three parts: a name that matches the folder, a description that names the task and the trigger, and a body that turns the procedure into short steps plus a script, so the agent runs the check instead of reading about it."),
        code("text", `
---
name: write-migration
description: Writes a safe Postgres migration for the CodeDev API (expand/contract, batched backfill, constraints added later). Use when a task adds, changes or drops a table, column or index.
---

# Write a database migration

Tables over 100k rows in production: enrollments, progress_events, submissions, leaderboard_entries.

1. Create the file with \`npm run db:new -- <short-name>\`. Never edit a migration that is already merged.
2. New column: add it as nullable, with no backfill in the same migration.
3. Backfill: write a job in \`jobs/backfill/\` that updates 5000 rows per transaction (see jobs/backfill/example.ts).
4. NOT NULL: in a later migration, add \`CHECK (col IS NOT NULL) NOT VALID\`, then \`VALIDATE CONSTRAINT\`.
5. For new column and index names, read reference/naming.md.
6. Before you finish, run \`scripts/check-migration.sh <file>\` and paste its output in the pull request.
   If it reports a problem, fix the migration; do not change the script.`, ".claude/skills/write-migration/SKILL.md (after)"),
        p("The script is the part that does not depend on the agent's judgement. It is short on purpose: it fails on the patterns that caused the two outages."),
        code("bash", `
#!/usr/bin/env bash
# scripts/check-migration.sh <migration.sql> - fails on patterns that lock large tables
set -euo pipefail
file="$1"
big='enrollments|progress_events|submissions|leaderboard_entries'
status=0
if grep -Eiq "UPDATE[[:space:]]+($big)" "$file"; then
  echo "FAIL: backfill of a large table inside a migration (use a batched job)"; status=1
fi
if grep -Eiq "SET NOT NULL" "$file"; then
  echo "FAIL: SET NOT NULL scans the table under an exclusive lock (use CHECK ... NOT VALID)"; status=1
fi
[ "$status" -eq 0 ] && echo "OK: $file"
exit "$status"`, "scripts/check-migration.sh"),
        p("Rerun the task in a fresh session and the transcript changes where it matters: the skill is opened, the migration only adds a nullable column, a backfill job appears in `jobs/backfill/`, and the pull request description contains `OK: db/migrations/...`. That last line is evidence a reviewer can check without trusting the agent."),

        h2("5. Validate every SKILL.md in CI"),
        p("The outage was caused by a skill file that was wrong in a way nobody looked at. A file that agents depend on deserves the same treatment as code: a check that runs on every pull request. CodeDev's check is deliberately strict and explicit, so that it does not matter how lenient a particular tool is:"),
        bullets([
            "The file starts with a `---` line and the frontmatter is closed by another `---` line.",
            "`name` is lowercase letters and digits joined by single hyphens, at most 64 characters, and equal to the folder name.",
            "`description` is present, at most 1024 characters, and contains the phrase \"use when\" - the team's convention for saying when the skill applies.",
            "The body is not empty.",
        ]),
        callout("info", "Your rules, aligned with the spec",
            "The 64 and 1024 character limits and the lowercase-hyphen name are the constraints the published format documents at the time of writing; check the current specification when you set up your own check. The \"use when\" phrase is not part of the format: it is a team convention, and a check is the only way a convention survives contact with many authors and many agents."),
        p("The check needs only a tiny part of YAML (`key: value` lines, optionally quoted), so it needs no library and runs in milliseconds. Wire it into CI next to lint:"),
        code("yaml", `
# .github/workflows/ci.yml (excerpt)
- run: npm ci
- run: node scripts/check-skills.mjs .claude/skills
- run: npm run lint
- run: npm test`, "ci.yml"),
        p("Now write the validator. The test runner passes one skill folder name and the full text of its SKILL.md, and prints the errors you return, in a fixed order."),
        challenge("chal_coding_acp_212"),

        h2("6. How to verify a skill works"),
        bullets([
            "**The CI check passes** for every skill folder, and fails when you break a name or empty a description on purpose.",
            "**Positive run:** give the agent a task the skill is meant for, in a fresh session. In the transcript, SKILL.md is read and the script is run; in the diff, the procedure is followed.",
            "**Negative run:** give it an unrelated task (\"fix the typo in the leaderboard title\"). The skill should not be opened. If it is, the description is too broad.",
            "**Evidence in the pull request:** ask for the script's output in the PR description, as the skill does. A reviewer checks the output, not the agent's summary.",
            "**Re-check after edits:** when someone changes the description or moves files, rerun the two sessions. A skill is code that is executed by a model; it can regress.",
        ]),

        h2("7. Common mistakes"),
        bullets([
            "**A description that does not say when.** \"Database things\" is never picked. Spot it: the skill appears in the session's list but its SKILL.md is never read on tasks it was written for.",
            "**Everything in SKILL.md.** A 900-line body is loaded in full every time the skill is used. Spot it: the body contains tables or reference text that only some runs need; move them to `reference/` and point to them.",
            "**Prose where a script would do.** \"Make sure there is no UPDATE of a large table\" is a request; a script that fails is a check. Spot it: steps that can be verified by a command but are only described.",
            "**Name and folder out of sync.** Renaming the folder without the name (or the other way round) breaks tools that rely on them. Spot it: the CI check, or a `name` with capitals or spaces.",
            "**Installing a skill you have not read.** A skill's scripts run with the agent's permissions. Spot it: a skill folder in a pull request with scripts nobody on the team wrote or reviewed.",
        ]),

        h2("8. Summary"),
        numbered([
            "An Agent Skill is a folder with a SKILL.md (name, description, instructions) and optional scripts and references, loaded in steps: the description always, the body when the task fits, the files when the body points to them.",
            "The description is the trigger: say what the skill does and when to use it. Use AGENTS.md for rules every task needs, skills for procedures some tasks need, and checks for anything a machine can enforce.",
            "Treat skills as code: validate every SKILL.md in CI, verify with a positive and a negative session, and ask for the script's output as evidence in the pull request.",
        ]),

        h2("Sources"),
        bullets([
            "Anthropic documentation: Agent Skills overview and best practices (docs.anthropic.com), and the open Agent Skills specification it links to - check the current version for the exact frontmatter rules",
            "Claude Code documentation: skills in a project (docs.anthropic.com/en/docs/claude-code/overview, then the Skills page)",
            "agents.md - the AGENTS.md format (lesson 1.3)",
            "PostgreSQL documentation: ALTER TABLE (ADD CONSTRAINT ... NOT VALID, VALIDATE CONSTRAINT) and the log_lock_waits setting",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Pick one procedure your team explains again and again in reviews (a release, a migration, adding a feature flag). Write it as a skill: a description with \"Use when\", a body under 60 lines, and one script that checks the result. Run your validator from the challenge on it, then run two agent sessions - one task it should trigger on, one it should not - and keep the transcripts as evidence."),
    ],
});
