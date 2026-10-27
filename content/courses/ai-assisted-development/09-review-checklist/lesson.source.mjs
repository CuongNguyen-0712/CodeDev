// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-aad-3-3",
    title: "An automated review checklist: tests added, no unknown dependencies, no TODOs",
    slug: { _type: "slug", current: "automated-review-checklist-tests-dependencies-todos" },
    description:
        "The October review retro shows CodeDev reviewers writing the same mechanical comments again and again - add a test, remove the console.log, why is this package here, this file is not part of the task - while the SQL injection in PR #612 almost slipped through. Learn which review questions a bot can answer reliably, which it cannot, how to design five checks that stay quiet when nothing is wrong, and how to build the checklist from the PR's files and package.json so its output is the same every time.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer improving the review process, CodeDev learning platform",
        problem:
            "After PR #612 (the injectable search) and PR #655 (the swallowed payment error), the team held a review retro. In October 41 pull requests were merged into the API repository, 29 of them written mostly by AI assistants. More than half of all review comments were mechanical, and the two PRs that caused real damage were reviewed in under ten minutes each. The team wants a bot to answer the mechanical questions before a human opens the PR, so the human can spend the ten minutes on what only a human can check.",
    },

    content: [
        h2("1. The incident: reviewers busy with the wrong questions"),
        p("The retro started from data, not opinions. Someone exported every review comment on the 41 PRs merged in October and tagged it:"),
        code("text", `
review comments, API repository, October 2026 (41 merged PRs, 29 AI-assisted)

tag                               comments   PRs   example
source changed, no test changed         17     9   "please add a test for the new branch"
debug output / TODO left in             23    14   "remove console.log(req.body)"
dependency nobody asked for              6     3   "why lodash? we have this in utils"
file outside the task                    8     5   "this PR also changes the CI workflow?"
PR too large to review                   4     4   "can you split this? 1,900 lines"
behaviour / design / security           19    11   "this builds SQL from q", "catch returns null"
---------------------------------------------------------------------
median time to approve: 34 min; PR #612: 7 min; PR #655: 9 min`, "Retro notes"),
        p("Five of the six tags are questions with a mechanical answer: did a test file change, is `console.log(` in an added line, is this package new, is this path in the task, how many lines changed. A reviewer who spends their attention on those has less of it left for the last row - the only one that found real bugs, and the one AI-generated code needs most. AI assistants make the mechanical problems more frequent, too: they add a quick `console.log` while debugging, reach for a package they remember from training data (sometimes one that does not exist), \"tidy up\" files near the task, and produce a 300-line PR in minutes."),
        p("The decision: a bot posts a checklist on every PR before a human opens it. This lesson is about designing that checklist well, because a noisy one is worse than none - people learn to ignore it within a week."),

        h2("2. What a bot can check, and what it cannot"),
        p("A check belongs in the checklist when it is **cheap** (seconds, no network beyond the PR itself), **deterministic** (the same PR always gives the same answer), **objective** (two engineers would agree on the answer) and **rarely wrong** (few false alarms). Each of the five tags above qualifies. The sixth does not, and no amount of rules will make it:"),
        bullets([
            "A bot can see **that** a test file changed. It cannot see whether the test would fail if the behaviour were wrong - the PR #612 test passed for any function that returns an array.",
            "A bot can see **that** a package is new and unvetted. It cannot judge whether the code needs a package at all, or whether the package is trustworthy - that takes a registry check and a human (lesson 4.1).",
            "A bot can see **that** a file is outside the allowed paths. It cannot tell whether a change inside them does what the request asked.",
        ]),
        p("So the checklist does not approve anything. It turns five questions into red and green marks, and a red mark is a question for the author: \"no test changed - is that on purpose?\" Some answers are a legitimate yes (a comment-only change, a rename). That is why most teams make only some checks blocking."),
        h3("Blocking or warning"),
        p("Decide per check, based on how often a red mark is a real problem. A new unvetted dependency is almost always worth stopping for: block. A source change without a test change is usually a problem, but not always: warn, and let the author answer in the PR. A very large PR is a request to split, not a defect: warn. If a blocking check fires falsely more than once or twice a month, people will add an override label to every PR and the check is dead. Start with warnings, measure, then promote."),

        h2("3. The five checks"),
        p("Each check returns a list of findings; it passes when the list is empty. Precise rules matter more than clever ones, because every vague rule produces false alarms."),
        numbered([
            "**tests - source changed, no test changed.** Define source (code under `src/`, not a test, not a type declaration file) and test (a `.test.` or `.spec.` file name, or a `test`, `tests` or `__tests__` folder). Removed files need no tests. Findings: the source files that changed.",
            "**dependencies - a new package that is not on the allowlist.** Compare package names before and after, across `dependencies` and `devDependencies` together. A version bump is not new, and a package that moved from devDependencies to dependencies was already in the project. A dev dependency counts: it runs in CI and on every developer's machine, with their tokens in the environment. Findings: the new names nobody has vetted - including invented names and typos like `expresss`.",
            "**debug_markers - TODO, FIXME or console.log( in an added line.** Only added lines: the PR should not be blamed for old TODOs. `console.log` in a server leaks request data into logs (lesson 4.2 on secrets shows why that matters); a TODO in AI-generated code is the assistant telling you the work is unfinished. Findings: one per file and marker.",
            "**paths - a changed file outside the allowed paths.** An entry ending in `/` is a folder; anything else is one exact file. Removed files count: an AI \"cleanup\" that deletes `.github/workflows/ci.yml` is the most dangerous change outside the task. Findings: the paths.",
            "**size - a very large PR.** Sum added and deleted lines, but skip lock files: `package-lock.json` changes by hundreds of generated lines for one new dependency. Findings: one line with the total and the limit.",
        ]),
        p("Two properties make the output useful to people and to tools: the checks always come **in the same order**, and each list of findings is **sorted and has no duplicates**. The bot edits its comment on every push; with a stable order, the comment only changes when a finding changes, and the PR timeline shows exactly what got fixed."),

        challenge("chal_quiz_aad_331"),

        h2("4. Worked example: wiring the checklist into CI"),
        p("The checklist is a pure function from data to results, so the CI job has two jobs of its own: collect the data, and publish the result. Collecting it needs nothing more than git and the GitHub CLI:"),
        code("yaml", `
# .github/workflows/review-checklist.yml
name: review-checklist
on: pull_request
permissions:
  contents: read
  pull-requests: write
jobs:
  checklist:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - name: Collect PR data
        run: node scripts/review/collect.mjs "origin/\${{ github.base_ref }}" > pr.json
      - name: Run checklist
        run: node scripts/review/checklist.mjs pr.json > checklist.json
      - name: Post or update the comment
        run: node scripts/review/comment.mjs checklist.json
        env: { GH_TOKEN: "\${{ secrets.GITHUB_TOKEN }}", PR: "\${{ github.event.number }}" }`, "review-checklist.yml"),
        code("bash", `
# what collect.mjs runs to build pr.json
git diff --name-status "$BASE"...HEAD          # path and status (A, M, D, R100 old new)
git diff --numstat "$BASE"...HEAD              # additions and deletions per file
git diff --unified=0 "$BASE"...HEAD            # added lines: the ones that start with "+"
git show "$BASE":package.json                  # package.json before
cat package.json                               # package.json after
cat .github/review-policy.json                 # knownDependencies, allowedPaths, maxChangedLines`, "Data sources"),
        p("Keeping the policy in a file in the repository matters more than it looks. Adding a package to `knownDependencies` is then itself a change in a pull request, with a reviewer and a history: vetting becomes visible. And a task-specific policy is easy: the agent's request for the search feature can come with `allowedPaths: [\"src/courses/\", \"test/courses/\"]`, which would have flagged `config/rate-limits.ts` in PR #612 automatically."),
        code("json", `
[
  { "check": "tests", "passed": true, "details": [] },
  { "check": "dependencies", "passed": false, "details": ["sql-sanitize-lite"] },
  { "check": "debug_markers", "passed": false, "details": ["src/courses/search.service.ts: console.log("] },
  { "check": "paths", "passed": false, "details": ["config/rate-limits.ts"] },
  { "check": "size", "passed": true, "details": [] }
]`, "checklist.json for a search PR"),
        callout("info", "Pure function, thin edges",
            "Only collect.mjs knows about git and only comment.mjs knows about GitHub. checklist.mjs takes JSON and returns JSON, so it is tested with fixtures in milliseconds, runs the same on a laptop and in CI, and can be pointed at last month's PRs to measure it. That is the function you write in the challenge."),

        h2("5. How to verify the checklist itself"),
        bullets([
            "**One fixture per rule, and one per false alarm you want to avoid.** A source change with a test in `__tests__/`, a `.d.ts`-only change, a moved dependency, a version bump, a lock-file-only size jump. A checklist is judged as much by what it stays quiet about as by what it reports.",
            "**Replay last month.** Run it on the 41 merged PRs and compare with the tagged review comments: how many mechanical comments would it have made unnecessary, and how many red marks would have been noise? Promote a check to blocking only when its noise is close to zero.",
            "**Stable output.** Run it twice on the same input and on the files in a different order; the JSON must be identical. Otherwise the bot comment churns on every push.",
            "**Watch the override rate.** If authors answer \"intended\" to the same check on most PRs, the rule is wrong, not the authors.",
        ]),

        h2("6. The challenge"),
        p("Write `reviewChecklist(pr)`: the pure function from section 4. The input is the PR's changed files (path, status, line counts and added lines), `package.json` before and after, and the policy. The exact rules for the five checks are in the challenge description; they are the ones from section 3, made precise enough to test. The hidden tests include the false alarms the checklist must not raise, a PR that deletes the CI workflow, and a 300-file PR whose findings must come out sorted."),
        challenge("chal_coding_aad_332"),

        h2("7. Common mistakes"),
        bullets([
            "**Treating a passed checklist as an approval.** Spot it: PRs approved within a minute of the checklist turning green. The checklist frees the reviewer's time for behaviour and security; it does not replace them.",
            "**Fuzzy matching.** `path.includes(\"src\")` allows `scripts/srcmap.ts`; `startsWith(\"package.json\")` allows `package.json.bak`. Spot it: write the rule as a sentence first (\"an entry ending in / is a folder, anything else is one exact file\") and test the near misses.",
            "**Reporting every package.json change as a new dependency.** Version bumps and moves between sections make the check fire on every PR, and people stop reading it. Spot it: compare names, not lines.",
            "**Counting generated files.** Lock files, snapshots and generated clients make a three-line change look huge. Spot it: look at the largest contributor to the line count on the PRs flagged as too large.",
            "**Unstable output.** Findings in the order the API happened to return the files make every bot comment edit look like a change. Spot it: run the checklist twice with the files shuffled and diff the JSON.",
        ]),

        h2("8. Summary"),
        numbered([
            "Automate the review questions that are cheap, deterministic, objective and rarely wrong - tests changed, new dependencies, debug markers, paths outside the task, size - so humans spend review time on behaviour and security, which no checklist can judge.",
            "Precise rules beat clever ones: name-based dependency comparison across both sections, exact versus folder path entries, removed files counted where they matter, lock files excluded from size.",
            "Keep the checklist a pure function with stable, sorted output, test it with fixtures for findings and for false alarms, and promote a check to blocking only when its noise is near zero.",
        ]),

        h2("Sources"),
        bullets([
            "GitHub REST API documentation: List pull requests files (filename, status, additions, deletions, patch)",
            "GitHub documentation: About protected branches and required status checks",
            "npm documentation: package.json - dependencies and devDependencies",
        ]),
        callout("tip", "Self-practice (not graded): measure your own review comments",
            "Export the review comments of the last 20 merged PRs in a repository you work on and tag them like the retro table in section 1. Which tags are mechanical? Write the rule for one of them as a sentence precise enough to test, list two inputs where it should stay quiet, and decide whether it should block or warn. Then check how many of your behaviour comments were on AI-generated code."),
    ],
});
