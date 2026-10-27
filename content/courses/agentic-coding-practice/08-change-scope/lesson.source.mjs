// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-acp-3-2",
    title: "Keep the agent in scope: allowed paths & reviewable diffs",
    slug: { _type: "slug", current: "agent-change-scope-allowed-paths" },
    description:
        "An agent asked to fix the catalog's level filter opened a 47-file pull request: it also skipped a test in the CI workflow, regenerated the lockfile and moved a shared helper. Learn to declare which paths a task may change before the agent starts, which paths no task may touch, how globs like * and ** really match, why a rename changes two paths, and how to keep diffs small enough that a reviewer actually reads them.",
    estimatedTime: 25,

    scenario: {
        role: "Tech lead, CodeDev learning platform",
        problem:
            "The task was one line in the tracker: \"The Level filter on the catalog page ignores 'advanced'\". The agent's pull request changed 47 files (+2,316 / -904). The 12-line fix in src/catalog/filterCourses.ts was in there, together with a change to .github/workflows/ci.yml that skipped tests/catalog/legacyFilter.test.ts as \"flaky\", a regenerated package-lock.json (+1,880 lines), and a move of src/shared/formatPrice.ts into a new folder with 31 updated imports. The reviewer approved after eight minutes. Two days later a real regression in the legacy filter reached production, because its test no longer ran in CI.",
    },

    content: [
        h2("1. The incident: a good fix inside a PR nobody could review"),
        p("Every change in the pull request had a reason the agent could explain. The legacy test failed after the fix, so it was \"flaky\" and skipped. `npm install` was run to add a test helper, so the lockfile changed. `formatPrice` was in the wrong folder for the new code, so it moved. Each step was locally sensible. Together they produced a diff that hid the one change that mattered most: CI no longer ran a test that would have caught a regression."),
        code("text", `
$ git diff --stat main...agent/catalog-level-filter | tail -6
 src/shared/money/formatPrice.ts                  |    0
 src/catalog/filterCourses.ts                     |   12 +-
 tests/catalog/filterCourses.test.ts              |   58 +
 .github/workflows/ci.yml                         |    3 +-
 package-lock.json                                | 1880 +++++++----
 47 files changed, 2316 insertions(+), 904 deletions(-)`, "terminal"),
        p("The reviewer was not careless. Eight minutes is about what a 47-file diff gets on a busy afternoon, and the interesting three lines of `ci.yml` sat between 1,880 lines of lockfile and 31 import updates. The lesson is not \"review harder\". It is: **decide what the task may change before the agent starts, and let a machine check the diff against that decision**."),

        h2("2. Read the evidence: what did the diff really touch?"),
        p("`--stat` shows sizes. `--name-status` shows what happened to each path, which is what a scope check needs. `-M` asks git to detect renames, so a moved file appears as one `R` line with its old and new path instead of a delete and an add:"),
        code("text", `
$ git diff --name-status -M main...agent/catalog-level-filter
M       src/catalog/filterCourses.ts
A       tests/catalog/filterCourses.test.ts
M       .github/workflows/ci.yml
M       package-lock.json
R100    src/shared/formatPrice.ts       src/shared/money/formatPrice.ts
M       src/progress/ProgressBar.tsx
M       src/admin/CoursePriceCell.tsx
...                                     (31 files that import formatPrice)`, "terminal"),
        bullets([
            "`M` modified, `A` added, `D` deleted. `R100` is a rename with 100% similarity: the file moved without edits. A lower number such as `R087` means it moved and changed.",
            "Read the two paths of an `R` line as two changes: the new path gains a file and the old path loses one. If the old path is a migration or a test that CI runs by folder, the move is as serious as a delete.",
            "`...` (three dots) compares the branch with the point where it left `main`, so changes merged into `main` meanwhile do not show up as the agent's.",
        ]),
        p("And the change that caused the regression, three lines that are easy to miss in a long list:"),
        code("yaml", `
# .github/workflows/ci.yml (diff)
       - name: Unit tests
-        run: npx vitest run
+        run: npx vitest run --exclude tests/catalog/legacyFilter.test.ts   # flaky, see #412`, "ci.yml"),

        h2("3. Scope: allowed paths per task, forbidden paths for every task"),
        p("A task given to an agent should say where the work happens. Lesson 2 wrote tasks small enough for an agent to finish; this lesson adds one field to them, the **allowed paths**, written as glob patterns. On top of every task's list, the repository keeps a short list of **forbidden paths** that no agent task may touch without a person deciding otherwise:"),
        bullets([
            "**Migrations** (`db/migrations/**`): they change shared data and run once; a deleted or moved migration breaks every fresh database.",
            "**CI and deployment config** (`.github/**`, pipeline files): a change here can switch off the checks that judge the agent's own work. That is what happened in the incident.",
            "**Secrets and keys** (`.env`, `.env.local`, `*.pem`, `secrets/**`): an agent should never write them, and a diff that touches them is a leak waiting to be pushed.",
            "**Lockfiles** (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`), **unless the task allows them.** An upgrade task needs to change the lockfile; a filter fix does not. This entry can be lifted by the task's own allowed list; the others cannot.",
        ]),
        code("yaml", `
# tasks/catalog-level-filter.yml
title: The Level filter on the catalog page ignores "advanced"
acceptance:
  - tests/catalog/filterCourses.test.ts covers beginner, intermediate, advanced and "all"
scope:
  allowed:
    - src/catalog/**
    - tests/catalog/**/*.test.{ts,tsx}
  max_changed_files: 10        # a reviewer reads all of it in one sitting`, "tasks/catalog-level-filter.yml"),
        p("Write the allowed paths into the instruction the agent gets (lesson 3) so it knows the boundary, **and** check them after it finishes. The instruction makes in-scope work more likely; only the check makes out-of-scope work visible. An agent under pressure from a failing test will cross a line it was told about, exactly as it did here."),
        h3("When a bigger scope is right"),
        p("Scope is not \"as small as possible\". A task that renames a shared type legitimately touches many files; a dependency upgrade must change the lockfile; a schema change needs a migration. Say so in the task: list those paths, and give the large mechanical change its own pull request so the reviewer can check it as mechanical (\"31 files, all import paths\") instead of searching through it for logic. Exploratory spikes are another exception: let the agent roam in a throwaway branch, then write a scoped task for the real change."),

        h2("4. How the globs match"),
        p("Scope checks live or die by glob semantics, and every tool's dialect differs a little (gitignore, CODEOWNERS, minimatch and shells all have their own corner cases). The harness in this lesson uses a small, precisely defined subset, the same one as the exercise:"),
        bullets([
            "`*` matches any characters **inside one path segment**: `src/catalog/*.ts` matches `src/catalog/filterCourses.ts`, not a file in a sub-folder of `src/catalog`.",
            "`**` as a whole segment matches **zero or more** whole segments: `src/catalog/**` covers the folder at any depth, and `**/.env` also matches `.env` at the root.",
            "`?` matches exactly one character in a segment: `docs/adr/00??-*.md` matches a four-digit ADR number.",
            "`{a,b}` is a choice: `*.{ts,tsx}` is `*.ts` or `*.tsx`.",
            "Every other character is literal. That matters in a Next.js app, where `app/(catalog)/courses/[slug]/page.tsx` has parentheses and brackets that mean something very different in a regular expression.",
        ]),
        callout("warning", "A pattern is a promise about every future path",
            "Before you add `src/**` to make an annoying violation go away, ask what else it now allows. A pattern that is too wide passes the check today and lets the next agent rewrite an unrelated module tomorrow. Prefer adding the one extra path the task really needs."),

        challenge("chal_quiz_acp_321"),

        h2("5. Worked example: from git to a list of changes"),
        p("The check runs in CI on every agent pull request, and locally in the harness before the PR is opened. It needs the changed paths in a structured form. This part turns `git diff --name-status -M -z` output into change objects; `-z` separates fields with NUL bytes so paths with spaces or tabs survive:"),
        code("typescript", `
// harness/changedFiles.ts
import { execFileSync } from "node:child_process";

export type Change =
    | { status: "added" | "modified" | "deleted"; path: string }
    | { status: "renamed"; from: string; path: string };

export function changedFiles(base: string): Change[] {
    const out = execFileSync("git", ["diff", "--name-status", "-M", "-z", \`\${base}...HEAD\`], { encoding: "utf8" });
    const fields = out.split("\\0").filter((f) => f !== "");
    const changes: Change[] = [];
    for (let i = 0; i < fields.length; ) {
        const code = fields[i++];
        if (code.startsWith("R")) {
            changes.push({ status: "renamed", from: fields[i], path: fields[i + 1] });
            i += 2;
        } else if (code === "A" || code === "M" || code === "D") {
            const status = code === "A" ? "added" : code === "M" ? "modified" : "deleted";
            changes.push({ status, path: fields[i++] });
        } else {
            // C (copy), T (type change), U (unmerged): not expected from an agent branch - stop and ask
            throw new Error(\`unexpected status \${code} for \${fields[i]}\`);
        }
    }
    return changes;
}`, "changedFiles.ts"),
        p("Notice the `else` branch: a status the code does not understand stops the check instead of being skipped. The same rule as the command policy in lesson 7 - what the guardrail cannot judge, it does not let through. The size limit is the cheap part:"),
        code("bash", `
# fail the agent PR when it is too big to review in one sitting
files=$(git diff --name-only main...HEAD | wc -l)
if [ "$files" -gt 10 ]; then
  echo "agent PR changes $files files (limit 10): split it or widen the task on purpose"
  exit 1
fi`, "ci step"),
        p("Now write the check itself: the glob subset, renames as two paths, invalid paths, forbidden patterns that a task may or may not lift, and a sorted report:"),
        challenge("chal_coding_acp_322"),

        h2("6. How to verify the scope check"),
        bullets([
            "**Replay the incident.** Keep the incident's `--name-status` output as a fixture. The check must report `ci.yml`, the lockfile and both paths of the `formatPrice` move, and pass when only the catalog files remain.",
            "**Test the glob dialect, not just your paths.** One test per rule: `*` at a folder boundary, `**` matching zero segments, a brace group, a path with `(`, `[` and `.`. Glob bugs hide in exactly these corners, and a wrong one fails open.",
            "**Run it where the agent cannot edit it.** If the check lives in `.github/workflows` and the agent can change that folder, the agent can switch it off - which is why CI config is on the forbidden list. Branch protection with required status checks, and CODEOWNERS for sensitive folders on GitHub, add a layer the agent's branch cannot change by itself.",
            "**Look at the numbers.** Median changed files per agent PR, and how many PRs the check blocked. If almost every PR is blocked, the tasks are written too narrowly; if none ever is, check that the check runs at all.",
        ]),

        h2("7. Common mistakes"),
        bullets([
            "**Checking only the new path of a rename.** A migration moved into `src/` looks like a new file in scope. Spot it: put an `R` line from a forbidden folder into a test fixture; the old path must be reported.",
            "**Reading `*` as \"everything below\".** `src/catalog/*.ts` silently excludes every sub-folder, and agents like to create sub-folders. Spot it: a test file one folder deeper than the pattern.",
            "**Scope only in the prompt.** \"Only edit src/catalog\" in the instructions is guidance, not enforcement. Spot it: search the CI config for a step that compares the diff with the task's paths; if there is none, nothing checks.",
            "**Forbidding the lockfile for every task.** An upgrade task then edits `package.json` without the lockfile, or the agent finds another way around. Spot it: tasks that need a lockfile change list it in their allowed paths, and the check lifts that one entry.",
            "**Ignoring deletions.** A deleted test is the easiest way to make a suite green. Spot it: `D` lines are checked like any other change, and a deleted file under `tests/` outside the task's scope is a violation.",
        ]),

        h2("8. Summary"),
        bullets([
            "Every agent task names its allowed paths before the agent starts; a short repository-wide list forbids migrations, CI config, secrets and (unless the task allows them) lockfiles.",
            "A machine checks the diff against both lists after the agent finishes: every path of every change, both sides of a rename, deletions included, with a glob dialect you have tested.",
            "Small, scoped diffs are what make human review real; a large mechanical change gets its own PR so it can be checked as mechanical.",
        ]),

        h2("Sources"),
        bullets([
            "Git documentation: git diff, options --name-status, -M (rename detection) and -z - git-scm.com/docs/git-diff",
            "GitHub Docs: About code owners, and About protected branches (required status checks)",
            "AGENTS.md, a shared format for repository instructions to coding agents - agents.md",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Take the last five pull requests an agent opened in one of your repositories. For each, write down the allowed paths you would have given the task, then run git diff --name-status -M against the base and count the paths outside that list. Were they needed? Write the forbidden list for that repository and put both into the task template your team uses."),
    ],
});
