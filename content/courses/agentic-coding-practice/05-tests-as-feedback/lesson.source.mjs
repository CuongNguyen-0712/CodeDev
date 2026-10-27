// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-acp-2-2",
    title: "Feedback loops: tests, lint & choosing which tests to run",
    slug: { _type: "slug", current: "feedback-loops-tests-lint-choosing-tests" },
    description:
        "A coding agent changed how progress is rounded, ran the tests in test/progress, saw them pass in two seconds and reported success; CI failed 14 minutes later in the leaderboard and certificate tests, and a type error was never checked at all. Learn what makes a feedback loop useful to an agent (fast, relevant, short, trusted), how typecheck and lint fit next to tests, how to choose the tests to run from the import graph, when to give up on selection and run everything, and how to check that the loop catches real mistakes.",
    estimatedTime: 20,

    scenario: {
        role: "Backend developer who owns the agent workflow, CodeDev learning platform",
        problem:
            "Learners complained that the course page showed 100% while one lesson was still open (199 of 200 lessons rounds to 100). A coding agent got the task \"round progress percentages down instead of to the nearest integer\". It edited src/progress/percent.ts, ran npx vitest run test/progress (2 files, 1.9 s, green) and wrote \"Done, all tests pass.\" It then took two follow-up tasks and pushed three more commits on the same branch. Fourteen minutes after the first push, the full suite in CI failed in test/leaderboard/rank.test.ts and test/certificates/eligibility.test.ts, and a reviewer running tsc found a type error in src/api/progressRoute.ts that CI does not check. Untangling which of the four commits broke what took an hour.",
    },

    content: [
        h2("1. The incident: green in two seconds, red fourteen minutes later"),
        p("The change itself was small and correct for its own module. `percent()` now rounds down, and returns `null` when a course has no lessons yet, instead of dividing by zero:"),
        code("typescript", `
// src/progress/percent.ts (after the agent's change)
export function percent(completed: number, total: number): number | null {
  if (total === 0) return null;
  return Math.floor((completed / total) * 100);
}`, "percent.ts"),
        p("The agent did what its instructions asked: \"run the tests after every change\". It chose which tests by the folder of the file it edited, which is what a person in a hurry often does too:"),
        code("text", `
$ git diff --name-only
src/progress/percent.ts
$ npx vitest run test/progress
 ✓ test/progress/percent.test.ts (6 tests)
 ✓ test/progress/summary.test.ts (4 tests)
 Test Files  2 passed (2)
   Duration  1.9s
Agent: "Done, all tests pass."`, "agent session"),
        p("CI runs the full suite on every push. It started late because of a queue and finished fourteen minutes after the first push, by which time three more commits sat on top:"),
        code("text", `
 FAIL  test/leaderboard/rank.test.ts > ties are broken by progress
   AssertionError: expected [ 'u_17', 'u_4' ] to deeply equal [ 'u_4', 'u_17' ]
 FAIL  test/certificates/eligibility.test.ts > 100% progress unlocks the certificate
   AssertionError: expected false to be true
 Test Files  2 failed | 36 passed (38)
      Tests  2 failed | 212 passed (214)
   Duration  6m 41s`, "CI, full suite"),
        p("The agent's loop was **fast but blind**: it gave a confident green answer about the two test files it looked at, and nothing about the 36 it did not. Every minute between a mistake and the signal that reveals it is a minute in which the agent keeps building on the mistake."),

        h2("2. Reproduce it and read the evidence"),
        p("Ask the question the agent did not: which test files can observe a change to `percent.ts`? Follow the imports backwards. A plain search shows the first level:"),
        code("bash", `
$ grep -rl "progress/percent" src test
src/progress/summary.ts
src/leaderboard/rank.ts
test/progress/percent.test.ts

$ grep -rl "leaderboard/rank" src test
src/certificates/eligibility.ts
test/leaderboard/rank.test.ts`, "terminal"),
        p("So `rank.ts` uses `percent()` to break ties, and `eligibility.ts` uses `rank.ts`. Both failing tests sit at the end of an import chain that starts at the changed file, in folders the agent never looked at. Most test runners can do this walk for you. With Vitest, `vitest related` runs the tests that import the given files, directly or through other modules (Jest's equivalent is `--findRelatedTests`); check the CLI documentation of your version for the exact flags:"),
        code("bash", `
$ npx vitest related src/progress/percent.ts --run
 ✓ test/progress/percent.test.ts (6 tests)
 ✓ test/progress/summary.test.ts (4 tests)
 ✗ test/leaderboard/rank.test.ts (5 tests | 1 failed)
 ✗ test/certificates/eligibility.test.ts (3 tests | 1 failed)
 ✓ test/api/routes.test.ts (9 tests)
 Test Files  2 failed | 3 passed (5)
   Duration  3.2s`, "the same change, related tests"),
        p("Five files, 3.2 seconds, and both failures. The same loop also missed something no test can see. The project's `test` script runs Vitest, which by default strips TypeScript types without checking them; the type checker is a separate command, and CI never runs it:"),
        code("bash", `
$ npx tsc --noEmit
src/api/progressRoute.ts:22:5 - error TS2322: Type 'number | null' is not assignable to type 'number'.`, "terminal"),

        h2("3. Core idea: the agent is only as good as its feedback"),
        p("An agent works in a loop: plan, edit, run something, read the result, decide (lesson 1.1). The \"run something\" step is the only place where reality talks back. If it says nothing useful, the agent's next decision is a guess presented as a fact. A useful feedback loop has four properties:"),
        bullets([
            "**Fast.** Seconds, so it can run after every edit. A check that takes ten minutes is run once at the end, if at all.",
            "**Relevant.** It covers what the edit could break, not what happens to be nearby. A fast run of the wrong tests is worse than no run, because it produces a confident \"all tests pass\".",
            "**Short.** Agents read the whole output into their context. A 5,000-line log with one failure in the middle wastes the context and hides the signal; prefer reporters that print failures only.",
            "**Trusted.** No flaky tests and no warnings that everybody ignores. An agent that sees a test fail and then pass on retry learns that red means \"try again\".",
        ]),
        h3("Layers, from seconds to minutes"),
        p("No single check is enough. Stack them so that cheap checks run often and expensive ones run where they are needed:"),
        numbered([
            "**Typecheck** (`tsc --noEmit`, seconds): wrong types, missing null checks, changed signatures. Tests pass happily over these when no test happens to run that path.",
            "**Lint on the changed files** (`eslint --max-warnings 0`, seconds): mistakes rules can find, for example a promise that is never awaited (`@typescript-eslint/no-floating-promises`). Make warnings fail the run, or the agent will ignore them as people do.",
            "**Related tests** (seconds): the tests that can observe the change, chosen from the import graph.",
            "**Full suite in CI** (minutes): everything, on every push, as the backstop. Selection is a speed-up for the inner loop, never a replacement for this.",
            "**Mutation testing on the changed files** (minutes, lesson 2.3): do the tests notice when the code is wrong?",
        ]),
        h3("When not to trust a selection"),
        p("Choosing tests from imports only works when imports describe the dependencies. Some changes reach every test without any import, so a selection must fall back to running everything:"),
        bullets([
            "**Config and lockfiles:** `package.json`, `package-lock.json`, `tsconfig.json`, `vitest.config.ts`, `.env.test`. A new dependency version or compiler flag can change any test.",
            "**Test infrastructure:** setup files, global fixtures and helpers that the runner loads by configuration, not by import.",
            "**Dynamic loading:** `import(path)` with a computed path, files read at runtime (`readFileSync(\"fixtures/...\")`), snapshots. Static import analysis does not see these; Vitest's documentation says the same about `related`.",
        ]),
        p("And whatever the selection says, report what it could **not** cover. A changed file that no test reaches is not \"tested and passing\"; it is untested, and the agent should say so instead of writing \"all tests pass\"."),
        challenge("chal_quiz_acp_221"),

        h2("4. Worked example: CodeDev's agent check"),
        p("CodeDev turned the layers into one command the agent runs after every edit, and one sentence in AGENTS.md that tells it to:"),
        code("bash", `
#!/usr/bin/env bash
# scripts/agent-check.sh - the agent's inner loop: seconds, not minutes
set -euo pipefail

npx tsc --noEmit

changed=$(git diff --name-only HEAD --diff-filter=d -- '*.ts' '*.tsx')
if [ -n "$changed" ]; then
  npx eslint --max-warnings 0 $changed
fi

# selection: which test files to run, as JSON { all, tests, untested }
node scripts/select-tests.mjs > .agent/selection.json
node scripts/run-selected.mjs .agent/selection.json --reporter=dot`, "scripts/agent-check.sh"),
        code("text", `
## Checks
After every change, run \`scripts/agent-check.sh\` and fix what it reports before you continue.
Say "done" only when it passes. If it lists untested files, name them in your summary.
Never skip, delete or weaken a test to make the check pass; ask instead.`, "AGENTS.md (excerpt)"),
        p("Why their own selector instead of only `vitest related`? The runner does the graph walk well, but CodeDev also wanted two rules the runner does not know: run **everything** when a config file or lockfile changes, and list the changed files that **no** test reaches. The selector reads three things:"),
        bullets([
            "the changed files and their status, from `git diff --name-status` (added, modified, deleted);",
            "the import graph of the repository after the change - which file imports which - exported by a dependency analysis tool such as madge or dependency-cruiser, or by the bundler;",
            "the imports of each test file, and the list of paths that force a full run.",
        ]),
        p("Deleted files deserve a moment. After `src/progress/legacyRound.ts` is deleted, it is no longer a node of the new graph, but `summary.ts` may still import it. The tests that reach it must run: they fail with a missing-module error, which is exactly the feedback the agent needs. A deleted test file, on the other hand, has nothing left to run."),
        p("The graph can also contain cycles - `a.ts` imports `b.ts`, which imports `a.ts` again - which is common in real code. A walk over the graph must remember what it has already visited, or it goes round forever. Now write the selector."),
        challenge("chal_coding_acp_222"),
        p("With the selector in place, the incident replays differently: the first check after the edit runs five test files and tsc, prints two failing tests and one type error in about five seconds, and the agent fixes `rank.ts`, `eligibility.ts` and `progressRoute.ts` before it pushes anything. CI still runs the full suite, and it is green."),

        h2("5. How to verify the loop catches mistakes"),
        bullets([
            "**Plant a mistake on purpose.** On a scratch branch, change `Math.floor` back to `Math.round` (or `>=` to `>` somewhere) and run the agent check. It must fail within seconds. If it passes, your selection or your tests have a hole.",
            "**Count escapes.** Log the selection on every push (\"5 of 38 test files\") and compare with CI. A push where the selection was green and the full suite was red is an escape; look at why the graph missed it (a dynamic import, a fixture, a missing runAll entry).",
            "**Time it.** If the agent check takes more than a minute, agents and people start skipping it. Measure, and move slow tests to CI rather than dropping the check.",
            "**Read the agent's summary against the output.** \"All tests pass\" must match a check that actually ran the related tests and printed no untested files.",
        ]),

        h2("6. Common mistakes"),
        bullets([
            "**Choosing tests by folder or file name.** Callers of the changed module live elsewhere. Spot it: the inner loop is green and CI fails in a different folder.",
            "**\"Tests pass\" taken as \"types are right\".** Many TypeScript test setups do not typecheck. Spot it: no `tsc --noEmit` (or equivalent) in the agent check or in CI.",
            "**Warnings that never fail anything.** The agent reads \"12 warnings\" and moves on. Spot it: `--max-warnings` missing, and a warning count that only grows.",
            "**Selection without a fallback.** A lockfile update runs three tests. Spot it: no list of paths that force a full run, and escapes after dependency updates.",
            "**Making the check pass by editing the tests.** `it.skip`, a loosened assertion, a deleted test file, `--passWithNoTests`. Spot it: review every change under `test/` in an agent's diff first, and say in AGENTS.md that this needs a human.",
        ]),

        h2("7. Summary"),
        numbered([
            "An agent's feedback loop must be fast, relevant, short and trusted: typecheck and lint in seconds, related tests after every edit, the full suite in CI as the backstop.",
            "Choose related tests by walking the import graph from the changed files (with a visited set for cycles), run everything when config or lockfiles change, and report the changed files no test reaches.",
            "Verify the loop by planting mistakes and counting escapes; a green run that looked at the wrong tests is the most dangerous result there is.",
        ]),

        h2("Sources"),
        bullets([
            "Vitest documentation: CLI (vitest related, --changed, reporters) and Testing Types (typecheck mode) - vitest.dev",
            "Jest documentation: CLI options --findRelatedTests and --onlyChanged - jestjs.io",
            "TypeScript documentation: tsc CLI options (--noEmit) - typescriptlang.org",
            "typescript-eslint: no-floating-promises rule; ESLint CLI --max-warnings",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Write the agent check for a project of yours: tsc, lint on changed files with --max-warnings 0, related tests. Time it, then plant three mistakes in three different modules and note which ones it catches in under a minute. Add the paths that should force a full run, and one line to your AGENTS.md that says when the agent may say \"done\"."),
    ],
});
