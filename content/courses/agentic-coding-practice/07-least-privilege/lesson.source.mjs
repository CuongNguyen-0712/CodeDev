// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-acp-3-1",
    title: "Least privilege for agents: which commands may run",
    slug: { _type: "slug", current: "least-privilege-agent-commands" },
    description:
        "A coding agent ran a migration and then the test suite against the production database, because DATABASE_URL in the terminal it was started from still pointed there. Learn why least privilege for agents starts with what the agent can reach (credentials, network, files) and only then with which commands it may type, how to write a command policy that splits a line the way the shell does, why deny must beat allow, and how to test the policy like any other code.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer, CodeDev learning platform",
        problem:
            "On Monday at 14:02 a coding agent working on the task \"add a level column to courses\" ran npm run migrate and then npm test. The developer had started the agent from a terminal in which DATABASE_URL still pointed at the production database, left over from a weekly report that morning. The migration was applied to production, and the test setup, which truncates the enrollments and progress tables before each run, emptied them in production too. Restoring from the nightly backup plus the write-ahead log took 70 minutes, and the platform was read-only while it ran.",
    },

    content: [
        h2("1. The incident: the agent did exactly what it was told"),
        p("Nothing in the agent's plan was wrong. The task said \"add a `level` column to `courses`, backfill it, and make the catalog tests pass\". A developer would have done the same three steps: write the migration, run it, run the tests. The audit log of the agent harness shows them in order:"),
        code("text", `
14:01:57  agent  write  db/migrations/20261019_add_course_level.sql
14:02:11  agent  run    npm run migrate          verdict: allow (auto-approved: "npm run *")
          > node scripts/migrate.mjs
          Connected to db.prod.codedev.internal:5432/codedev
          Applied 20261019_add_course_level.sql (12 ms)
14:02:13  agent  run    npm test                 verdict: allow (auto-approved: "npm test")
          > vitest run
          tests/setup.ts: migrate + truncate enrollments, progress
          Test Files  38 passed (38)
14:03:40  agent  done   "Added the level column, all 214 tests pass."`, "agent-audit.log"),
        p("The agent reported success, and from its point of view it was right: every command exited with 0. The problem is not in any single command. It is in what those commands could **reach**. The agent ran with the developer's environment, and that environment held a production connection string."),
        code("bash", `
$ echo $DATABASE_URL
postgres://app:***@db.prod.codedev.internal:5432/codedev

$ grep -n "DATABASE_URL" tests/setup.ts scripts/migrate.mjs
tests/setup.ts:4:     await migrate(process.env.DATABASE_URL);
tests/setup.ts:5:     await truncateTables(process.env.DATABASE_URL, ["enrollments", "progress"]);
scripts/migrate.mjs:9: const pool = new Pool({ connectionString: process.env.DATABASE_URL });`, "terminal"),

        h2("2. Read the evidence before you fix anything"),
        p("Two quick checks confirm which database the commands talked to. The production database records the client application name and address of every session, and the migration table records when each migration was applied:"),
        code("sql", `
-- on the production database
SELECT version, applied_at
FROM schema_migrations
ORDER BY applied_at DESC
LIMIT 2;
--  version                      | applied_at
--  20261019_add_course_level    | 2026-10-19 14:02:11+07
--  20261002_add_hint_events     | 2026-10-02 09:30:44+07

SELECT count(*) FROM enrollments;   -- 0 (was 48,212 at the 03:00 backup)`, "psql"),
        p("The first query proves the migration was not applied by the release pipeline (which runs at night) but at 14:02, the minute the agent ran it. The second shows the damage of the test setup. Together with the audit log they answer the only question that matters for the fix: **the agent had production credentials, and every command it ran inherited them**."),
        callout("info", "Fix the reach, not the name",
            "The first reaction to an incident like this is a rule about the command that did the damage. Before you write one, list every way the environment could reach production: each script, test setup and CLI that reads DATABASE_URL or a token. If the list is longer than the rule, the rule is not the fix."),

        h2("3. Least privilege: what the agent can reach, then what it may type"),
        p("**Least privilege** means giving a process only the access it needs for its task, and nothing else. For a person that is a database role or an IAM policy. For a coding agent it is the same idea, with a twist: the agent decides at run time which commands to run, so you cannot list every command in advance. You limit the agent in layers, from the most reliable to the least:"),
        numbered([
            "**What it can reach.** The environment the agent runs in holds no production credentials, no cloud admin tokens, no SSH keys to servers. A test database, a sandbox account and read-only tokens where something must be read. A command that cannot reach production cannot damage it, whatever its name.",
            "**Where it runs.** A sandbox: a container, a dev container, a VM or a CI runner, with the repository mounted and little else. Network access limited to what the task needs (the package registry, the test database). Many agent tools can run commands in some kind of sandbox; how strong it is, and whether it is on by default, differs by tool and version, so check the current documentation of the one you use.",
            "**What it may run without asking.** A command policy: a short allow list of commands that are safe to run on their own (tests, lint, type check, build), a deny list for the dangerous ones, and \"ask a person\" for everything else.",
            "**What a person approves.** The \"ask\" verdicts, and the merge at the end. A person is the last layer, not the first: if every command needs approval, people start approving without reading.",
        ]),
        p("The incident had layer 3 and nothing else. The fix is layer 1: the agent is now started by a script that builds its environment from scratch, with `DATABASE_URL` pointing at a local test database. The command policy stays, but as a second line of defence."),
        h3("When not to add more rules"),
        p("A policy has a cost. Each \"ask\" interrupts the developer; after a few dozen interruptions a day, approving becomes a reflex and the layer stops protecting anything. Keep the allow list wide enough for the agent's normal loop (edit, test, lint, type check, build) and spend your deny rules on the few things that are expensive or irreversible: deleting outside the workspace, anything that touches production, publishing packages, rewriting shared history, running code downloaded from the internet. If you find yourself writing dozens of rules for one repository, the sandbox is probably too open."),
        callout("warning", "Tool settings change: check the docs, not a blog post",
            "Coding agents such as Claude Code, Codex CLI, Copilot agent mode and Cursor all have some way to approve commands before they run, to pre-approve some, and to run in a more restricted mode. The names of these modes, their defaults and where their settings live differ between tools and change between versions. This lesson describes the ideas; read the current documentation of your tool before you rely on any particular setting."),

        challenge("chal_quiz_acp_311"),

        h2("4. A command policy is a parser first"),
        p("The first harness on CodeDev checked commands with `startsWith`. That treats a command line as one opaque string, but the shell does not: it splits the line into several commands joined by operators, removes quotes, expands variables and then starts each program. A policy that does not split the line the same way judges a different command from the one that will run."),
        code("text", `
line:      CI=1 npm run lint && echo "lint ok; next" | tee lint.log
           |------ segment 1 ------|  |--- segment 2 ---| |- segment 3 -|
operators:                         &&                   |
segment 1: assignments [CI=1]   program npm   args [run, lint]
segment 2: program echo         args ["lint ok; next"]   (the ; is inside quotes: text, not an operator)
segment 3: program tee          args [lint.log]          (reached through a pipe)`, "how the shell reads it"),
        p("Three consequences for the policy:"),
        bullets([
            "**Judge every segment, and let deny win.** A line is only as safe as its most dangerous segment. `npm test && <anything>` must not be allowed because it starts with `npm test`.",
            "**Quotes change where words end.** Operators inside quotes are text; quoted pieces that touch form one word, so `np\"m\"` is the program `npm`. A policy that matches on the raw string can be fooled both ways.",
            "**Some things cannot be judged statically.** Command substitution (`$(...)` or backticks) runs another command whose output becomes part of this one; the policy cannot know what it will be, so it refuses. Variables such as `$HOME` in a path are similar: the policy cannot see their value, so a delete aimed at one is treated as outside the workspace.",
        ]),
        p("This is a simplified lexer, not a full shell parser. Real shells also have redirections, here-documents, aliases, functions, globbing and more. Two rules keep the simplification safe: when the policy does not understand something, its answer is \"ask\" or \"deny\", never \"allow\"; and the policy is not the only layer, because the sandbox and the missing credentials still hold when the parser is wrong."),

        h2("5. Worked example: start the agent with an environment you chose"),
        p("Layer 1 in code. The harness no longer passes `process.env` to the agent's commands. It builds a small environment from an explicit list, refuses to start when a value points at a production host, and runs each approved command in the workspace with that environment:"),
        code("typescript", `
// harness/agentEnv.ts
import { spawnSync } from "node:child_process";

const PRODUCTION_HOSTS = ["db.prod.codedev.internal", "api.codedev.test", "app.codedev.test"];

export function buildAgentEnv(source: NodeJS.ProcessEnv): Record<string, string> {
    const env: Record<string, string> = {
        PATH: source.PATH ?? "/usr/local/bin:/usr/bin:/bin",
        HOME: "/workspace/.agent-home",           // not the developer's home: no ~/.ssh, no ~/.aws
        CI: "1",
        DATABASE_URL: "postgres://app:app@localhost:5432/codedev_test",
    };
    for (const [name, value] of Object.entries(env)) {
        const lower = value.toLowerCase();
        const host = PRODUCTION_HOSTS.find((h) => lower.includes(h));
        if (host) throw new Error(\`agent env: \${name} points at production host \${host}\`);
    }
    return env;
}

export function runApproved(command: string, env: Record<string, string>) {
    // the command has already passed the policy; it still runs with the agent's env, not ours
    return spawnSync("bash", ["-c", command], { cwd: "/workspace/codedev", env, encoding: "utf8", timeout: 600_000 });
}`, "agentEnv.ts"),
        p("Two details matter. The environment is an allow list of variables, not `process.env` minus a few names: a new secret added to the developer's shell next month stays out by default. And `HOME` points at an empty folder, so tools that read credentials from the home directory (cloud CLIs, SSH, package registries) find none."),
        p("Now layer 3, the policy itself. Its configuration is short and lives in the repository, next to the instruction files from lesson 3:"),
        code("json", `
{
  "allow": ["npm test", "npm run test", "npm run lint", "npm run typecheck", "npm run build",
            "npx tsc --noEmit", "npx vitest run", "git status", "git diff", "git log"],
  "productionHosts": ["db.prod.codedev.internal", "api.codedev.test", "app.codedev.test"],
  "deny": ["delete outside the workspace", "anything that names production", "package publishing",
           "force push", "piping into a shell", "command substitution"],
  "otherwise": "ask"
}`, "agent-policy.json"),
        p("Write the function that applies it. The exercise gives you the exact lexer rules and the order of the rules; it checks quoting, chains, pipes, environment prefixes, malformed lines and a long session log:"),
        challenge("chal_coding_acp_312"),

        h2("6. How to verify the guardrails"),
        bullets([
            "**Test the policy like code.** A table of command lines and expected verdicts, run in CI: the commands from your own agent audit logs, the incident's commands, and nasty ones (quoted operators, `$(...)`, a `&&` at the end). When someone widens the allow list, a test shows exactly what became allowed.",
            "**Prove the environment from inside the sandbox.** Ask the agent (or a script in the same environment) to run `printenv | grep -i -E \"prod|token|secret|key\"` and `psql \"$DATABASE_URL\" -c \"select current_database()\"`. The first must print nothing, the second `codedev_test`.",
            "**Plant a canary.** Put a fake production URL into the developer shell and start the agent through the harness: `buildAgentEnv` must refuse to start, or the variable must be absent inside the sandbox.",
            "**Read the audit log.** Every verdict with its rule. Count the asks per day: if they grow, the allow list is too narrow and approvals are turning into a reflex; if a deny rule never fires, check that it still matches what agents actually type.",
            "**Check the database side too.** The role used by development and agents should not even be able to log in to production. A failed `psql` from the sandbox to the production host is a better guarantee than any rule about command names.",
        ]),

        h2("7. Common mistakes"),
        bullets([
            "**Denying the command that bit you.** A rule against one command name leaves every other command that reads the same credential. Spot it: ask \"which credential or network path did the command use?\" and grep the repository for every script that uses it.",
            "**Matching the raw string.** `startsWith(\"npm run lint\")` approves `npm run lint; git push -f origin main`. Spot it: feed the policy a line with `&&`, `;` and a quoted operator; if the verdict comes from the first word only, the parser is missing.",
            "**Allow before deny.** A policy that returns at the first allow rule lets `npm run build --production` through because it starts like a build. Spot it: a test where an allowed prefix carries a production flag must still be denied.",
            "**Inheriting the developer's environment.** The agent gets `process.env`, with cloud tokens, SSH agents and production URLs. Spot it: print the environment from inside the agent session; anything you would not paste into a public issue does not belong there.",
            "**Asking about everything.** Forty approval prompts a day train people to press Enter. Spot it: count asks per session in the audit log and widen the allow list for the boring, safe ones.",
        ]),

        h2("8. Summary"),
        bullets([
            "Least privilege for an agent starts with what it can reach: no production credentials or keys in its environment, a sandboxed workspace, limited network. A command filter is a second layer, not the fix.",
            "A command policy must read the line the way the shell will: split on operators outside quotes, judge every segment, let deny beat ask and ask beat allow, and refuse what it cannot judge.",
            "Keep the allow list to the agent's normal loop, keep deny rules for the expensive and irreversible, and test the policy and the environment like any other code.",
        ]),

        h2("Sources"),
        bullets([
            "Anthropic, Claude Code documentation (overview, security and permissions pages) - docs.anthropic.com/en/docs/claude-code/overview",
            "AGENTS.md, a shared format for repository instructions to coding agents - agents.md",
            "Saltzer and Schroeder, \"The Protection of Information in Computer Systems\" (1975): the principle of least privilege",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Export a week of your own agent's commands (most tools can show or log them) and run them through the policy from the exercise. Which commands asked most often? Which deny rules never fired? Then start your agent once through a script like buildAgentEnv and check from inside the session that printenv shows nothing you would not want an agent to use."),
    ],
});
