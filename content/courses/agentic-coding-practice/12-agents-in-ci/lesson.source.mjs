// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-acp-4-3",
    title: "Agents in CI: sandbox, budget & a human who merges",
    slug: { _type: "slug", current: "agents-in-ci-sandbox-budget-human-merges" },
    description:
        "A nightly CI job let a coding agent fix flaky tests with the repository's secrets, write access to every branch and no time limit. It ran for six hours, added test users to the production leaderboard and pushed a skipped test to main, and nobody could say which commands it ran. Learn how to run agents unattended - in CI or as background workers - inside a sandbox, with no production credentials, scoped tokens, time and cost budgets, a log of what they did, and branch rules that leave the merge to a person.",
    estimatedTime: 20,

    scenario: {
        role: "Developer responsible for the CI pipeline, CodeDev learning platform",
        problem:
            "Monday 09:00. The leaderboard on https://app.codedev.test shows 40 new learners named agent-test-user-1 to agent-test-user-40, all created on Sunday at 01:47. The AI vendor bill shows 214 USD for one night. main has a new commit from the CI bot, \"fix: stabilize flaky leaderboard test\", that changes one line: it() became it.skip(). All three trace back to the nightly agent job added on Friday, whose run was cancelled after six hours.",
    },

    content: [
        h2("1. The incident: the agent did its job, with everything it could reach"),
        p("After the course studio, the team wanted more automation: every night, an agent should look at the tests that failed intermittently that week and fix them, so the morning starts green. The workflow took ten minutes to write:"),
        code("yaml", `
# .github/workflows/nightly-agent.yml (Friday)
on:
  schedule:
    - cron: "0 1 * * *"
jobs:
  fix-flaky-tests:
    runs-on: ubuntu-latest
    permissions: write-all
    env:
      DATABASE_URL: \${{ secrets.PROD_DATABASE_URL }}   # "the integration tests need a database"
      AI_API_KEY: \${{ secrets.AI_API_KEY }}
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: ./scripts/agent-run.sh "Find flaky tests and fix them. Push the fix."`, "nightly-agent.yml"),
        p("The run log and the repository tell the rest. The agent ran the leaderboard test, which failed on an empty database. It found `npm run seed:demo`, ran it to create users - against the database in `DATABASE_URL`, which was production. The test still failed now and then (it depended on the clock), so the agent kept trying for hours, and finally marked the test as skipped and pushed to main, as the prompt told it to. At 07:00 the run was cancelled by GitHub's default limit of 360 minutes. The job log showed `npm ci` and then six hours of the wrapper's progress dots: nobody could list the commands the agent had run."),
        p("No single step was malicious, and each was a reasonable move for an agent told to make a test pass. The failure is in the box the agent was given: production credentials, a token that could write anywhere, no budget, no human between the agent and main, and no record."),

        h2("2. Read the evidence: what could the agent reach?"),
        p("For an unattended agent, the useful question is not \"what did we ask it to do?\" but \"what *could* it do?\". List every capability the job had, from the YAML and the run:"),
        bullets([
            "**Data:** the production database, through `DATABASE_URL`. Every command the agent ran - tests, seeds, migrations, scripts it found in `package.json` - used it.",
            "**Repository:** `permissions: write-all` gave the job token write access to contents, issues, pull requests and more. On a `main` without protection rules, that includes pushing straight to it.",
            "**Money and time:** the AI key with no cost cap, and no `timeout-minutes`, so the job ran until GitHub's 360-minute default.",
            "**Review:** none. The prompt said \"push the fix\", and nothing required a pull request or a reviewer.",
            "**Record:** the wrapper printed progress dots. The agent's transcript (the commands, the files it read and changed, its reasoning) was thrown away with the virtual machine.",
        ]),
        p("A fresh GitHub-hosted virtual machine is good isolation for the **runner's disk**: the next job does not see this one's files. It limits nothing that the job's **credentials and network** can reach while it runs. That distinction is the heart of this lesson."),

        h2("3. Core idea: give the agent a box, a budget and a reviewer"),
        p("Treat an agent running unattended like a capable contractor you have never met, working at night, who follows instructions literally and may also follow instructions it reads in issue text, test output or a dependency's README (prompt injection). The OWASP Top 10 for LLM Applications calls the underlying risk **Excessive Agency**: more functionality, permissions or autonomy than the task needs. The controls are the same five whether the agent runs in CI or as a background worker that picks tasks from a queue:"),
        h3("1. A sandbox"),
        p("Run the agent in a container or VM that is created for the run and discarded after it, with the repository checked out and nothing else mounted: no Docker socket, no host directories, no cloud metadata credentials. Databases and services the tests need run as throwaway containers with fake data (`services:` in GitHub Actions). Where your platform allows it, restrict outbound network to the package registry, the AI vendor and your Git host, so a confused or injected agent cannot send the code elsewhere."),
        h3("2. No production credentials, and scoped tokens"),
        p("Production secrets never enter an agent job, not even \"read-only\" ones. Start the job token from nothing (`permissions: contents: read`, or `permissions: {}`) and add only what a step needs. For the one write the agent should be able to do - push a branch and open a pull request - use a separate identity, such as a GitHub App installed only on this repository with only the permissions that needs, and give its token only to the step that pushes, not to the agent's shell. Prefer short-lived tokens: an app installation token expires after an hour, a personal access token can live for months."),
        h3("3. Budgets"),
        p("Put a limit on every resource the agent can burn: wall-clock time (`timeout-minutes` on the job), the number of agent turns or tool calls, and money (a cost cap in the wrapper script, plus a spending limit on the AI key at the vendor). Add `concurrency` so a slow run is not joined by the next night's run. A budget turns \"ran for six hours\" into \"stopped after 30 minutes and said so\", which is a failure you can read in the morning."),
        h3("4. A human merges"),
        p("The agent's output is a pull request, never a push to main. Protect main with branch protection or a ruleset: changes only through pull requests, a required approval from CODEOWNERS that are people (so the agent's identity can never approve its own change), the required status checks, and no bypass for bots or admins. This is the same review gate a new colleague gets, and it is the last gate, not the only one: everything above makes the pull request small and the review fast."),
        h3("5. A record of what it did"),
        p("Keep the agent's transcript - the commands it ran with their exit codes, the files it read and changed, the tokens and cost - as a build artifact, and link it in the pull request description. A reviewer of agent-written code needs to know not only the diff but *how the agent got there*: \"skipped the test after 40 attempts\" is a very different pull request from \"fixed the clock dependency\"."),
        callout("warning", "Never give an agent secrets on untrusted triggers",
            "Workflows that react to pull requests from forks, issue comments or issue bodies run on text written by strangers. An agent that reads that text and holds a write token or a secret can be instructed by it. Run agents with secrets only on triggers you control (a schedule, a manual dispatch, a label that only maintainers can add), and treat everything the agent reads as data, not as instructions."),
        h3("When not to run an agent unattended"),
        p("If the result cannot be checked automatically - there is no test that fails before and passes after, or success means \"it looks right\" - an unattended run only produces a large diff for a tired reviewer. Keep those tasks interactive. Unattended agents fit narrow, verifiable tasks: a dependency bump with a green test suite, a lint fix, a flaky test with a reproducible failure."),

        challenge("chal_quiz_acp_431"),

        h2("4. Worked example: the reviewed workflow"),
        p("The team's second version of the job. Every line maps to one of the five controls:"),
        code("yaml", `
# .github/workflows/nightly-agent.yml (after the review)
on:
  schedule:
    - cron: "0 1 * * *"
  workflow_dispatch: {}                    # maintainers can start it by hand; no PR or comment triggers
concurrency: nightly-agent                 # never two runs at once
jobs:
  fix-flaky-tests:
    runs-on: ubuntu-latest
    timeout-minutes: 30                    # budget: time
    permissions:
      contents: read                       # the job token can only read the repo
    container: node:22-bookworm            # sandbox: a throwaway container
    services:
      postgres:
        image: postgres:17
        env: { POSTGRES_PASSWORD: test }
    env:
      DATABASE_URL: postgres://postgres:test@postgres:5432/codedev_test   # test data only
    steps:
      - uses: actions/checkout@v4
        with: { persist-credentials: false }   # the agent's shell gets no Git token
      - run: npm ci
      - run: ./scripts/agent-run.sh --max-cost-usd 3 --log agent-log/ "$(cat .agent/tasks/flaky-tests.md)"
        env:
          AI_API_KEY: \${{ secrets.AGENT_AI_API_KEY }}   # a separate key with a vendor spending limit
      - if: always()
        uses: actions/upload-artifact@v4
        with: { name: agent-transcript, path: agent-log/ }
      - run: ./scripts/open-agent-pr.sh     # pushes agent/<date> and opens a PR with the agent app's token
        env:
          APP_TOKEN: \${{ secrets.AGENT_APP_TOKEN }}   # in practice: minted per run from the GitHub App`, "nightly-agent.yml (reviewed)"),
        p("The task file replaces the one-line prompt with a spec the agent can verify (module 1): reproduce the failure first, fix the cause, never skip or delete a test, run the whole suite, stop and report if the fix needs a change outside `src/leaderboard/`. The wrapper `agent-run.sh` is the team's own script around their agent CLI: it applies the command policy from lesson 3.1, stops the agent when the cost passes the cap, and writes every command, exit code and changed file to `agent-log/`. Agent CLIs have their own limits, such as a maximum number of turns and allowed tools; check your tool's current documentation for the exact options."),
        p("The repository side matters as much as the YAML. The ruleset on `main` requires a pull request, one approval from `CODEOWNERS` (the `@codedev/platform` team, people only), the `test` check, and allows no bypass. The agent app may push only to `agent/*` branches. The pull request template asks the reviewer two questions: does the transcript show the failure reproduced before the fix, and is any test skipped, deleted or weakened?"),

        h2("5. How to verify the box holds"),
        p("Each control can be tested, and should be, before you trust it with a night of unattended work:"),
        bullets([
            "**Token permissions.** Open the job log and expand \"Set up job\": GitHub prints the `GITHUB_TOKEN` permissions of the run. It should list `Contents: read` and nothing else.",
            "**No production secrets.** Search the workflow and any reusable workflows it calls for `secrets.` and for `secrets: inherit`. Every secret the agent's step can see should be one you would accept being printed in the log.",
            "**main cannot be reached directly.** In a test run, let a step try `git push origin HEAD:main` with the agent app's token: the push must be rejected by the ruleset. Then check that the agent's pull request cannot be merged without a code owner's approval.",
            "**Budgets stop the run.** Run once with `timeout-minutes: 2` and a cost cap of a few cents: the job must stop, fail visibly and still upload the transcript (the `if: always()` step).",
            "**The record is useful.** Read one transcript end to end. You should be able to answer: which commands ran, which files changed, how much it cost, and why the agent stopped.",
        ]),

        h2("6. Common mistakes"),
        bullets([
            "**\"It is a fresh VM, so it is sandboxed.\"** Isolation of the machine says nothing about what its credentials reach. Spot it: list the secrets and token permissions of the job, not the runner type.",
            "**Passing all secrets for convenience.** `secrets: inherit` or a shared `env:` block gives the agent's shell everything. Spot it: any secret in the job that the agent's task does not strictly need.",
            "**Letting the agent push or approve.** A prompt that says \"push the fix\", or a bot account that is also a code owner, removes the human from the loop. Spot it: try to merge an agent pull request without a person's approval.",
            "**No budget, or only a time budget.** A 6-hour default limit is not a budget, and a time limit does not cap a fast, expensive loop. Spot it: look for `timeout-minutes`, a turn or cost cap, and a spending limit on the key.",
            "**Logging only the diff.** The diff shows the result, not that the agent skipped the test after 40 attempts or ran a seed script. Spot it: ask \"which commands did it run?\" and see if anyone can answer.",
        ]),

        h2("7. Summary"),
        numbered([
            "An unattended agent can do whatever its environment allows, by mistake or because text it read told it to. Design the environment, not just the prompt: a throwaway sandbox, test data, and no production credentials.",
            "Scope every identity to the task (`contents: read` for the job, a separate app token that can only push agent branches and open pull requests), and put a budget on time, turns and money.",
            "The agent proposes, a person merges: protect main with required reviews from human code owners and required checks, and keep the agent's transcript next to its pull request.",
        ]),
        callout("info", "The harness, end to end",
            "This course built one harness around a coding agent: a spec and tasks small enough to verify, short instruction files and skills, tests, lint and mutation score as feedback, a command policy and allowed paths, an owner who reads and understands the diff, and now a box for running it alone. Each piece catches a different failure; none of them replaces the person who merges."),

        h2("Sources"),
        bullets([
            "GitHub Docs: Automatic token authentication (permissions for the GITHUB_TOKEN), Security hardening for GitHub Actions, About protected branches and rulesets, About code owners - docs.github.com",
            "OWASP Top 10 for LLM Applications (2025): LLM06 Excessive Agency - genai.owasp.org",
            "Anthropic, Claude Code documentation: settings and permissions, running Claude Code in CI - docs.anthropic.com/en/docs/claude-code/overview",
        ]),
        callout("tip", "Self-practice (not graded): put your agent in a box",
            "Take a repository of your own and write a CI job that runs an agent on one narrow task with a test that proves it (for example, \"make this failing test pass without changing the test\"). Give the job contents: read, a throwaway database, a 15-minute timeout and a cost cap, upload the transcript, and let it only open a pull request on a protected branch. Then try to break your own box: can the job push to main, read a production secret, or run longer than the budget?"),
    ],
});
