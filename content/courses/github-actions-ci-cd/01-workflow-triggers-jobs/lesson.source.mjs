// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-gha-1-1",
    title: "Workflows, triggers and jobs for every pull request",
    slug: { _type: "slug", current: "github-actions-workflows-triggers-jobs" },
    description:
        "Rice Rocket's first CI workflow, copied from a blog post, ran twice for every pull request, on every branch and on docs-only changes, with a write-all token and no time limit. Learn how a workflow file is read - events and their filters, jobs on fresh runners, steps, needs, the token and timeouts - and write the pull request workflow the team keeps.",
    estimatedTime: 15,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "Deploys used to be a script run by hand over SSH (the Docker & Nginx course). The team now wants every pull request into main checked before it merges. The first workflow worked, but it burned runner minutes on every branch, started twice per pull request, ran for README typos and once hung for six hours on a stuck test.",
    },

    content: [
        h2("Situation"),
        p("The repository `rice-rocket/app` holds the api in `api/` (Node version in `api/.nvmrc`, dependencies locked in `api/package-lock.json`), the static site in `web/` and the runbooks in `docs/`. This is the workflow a teammate copied in:"),
        code("yaml", `
name: ci
on: [push, pull_request]
permissions: write-all

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
      - run: cd api && npm install && npm run lint && npm test`, ".github/workflows/ci.yml"),
        bullets([
            "Every push to an open pull request shows two runs, one `push` and one `pull_request`.",
            "A push to any branch, even one with no pull request, starts a run; so does a pull request that only fixes a typo in `docs/`.",
            "One run hung on a test that waited for a socket and was killed after 6 hours.",
            "`npm install` rewrote `package-lock.json` on the runner, so CI tested versions nobody had locked.",
        ]),

        h2("The core you need"),
        bullets([
            "**A workflow is a YAML file in `.github/workflows/`.** `on:` says which events start it, `jobs:` what runs. GitHub reads the file from the commit the event points at.",
            "**Events and filters.** `pull_request` fires when a pull request is opened, gets new commits or is reopened; `branches:` under it filters on the **base** branch (where it will merge). `push` fires for pushed commits and tags; `branches:` filters on the pushed branch. When only `branches:` is set, tag pushes do not start the workflow. `paths-ignore:` skips the run when every changed file matches (`docs/**`, `**/*.md`).",
            "**What a pull request run tests.** `actions/checkout` fetches `refs/pull/<n>/merge`: the branch merged into the current main, which is what will land. That is why CI runs on `pull_request`, and `push` is kept for `main` only.",
            "**Jobs run in parallel on fresh runners.** Each job gets its own virtual machine and an empty workspace: it checks out the code and installs what it needs. `needs: lint` makes a job wait for `lint` to succeed; it shares no files.",
            "**Steps run in order inside one job** and share its workspace. A step is either `uses:` (an action, `owner/repo@version`) or `run:` (a shell command). `defaults.run.working-directory` sets the folder of every `run:` step.",
            "**The token and the clock.** Every job gets a `GITHUB_TOKEN`; `permissions:` sets what it may do, and a map grants only the scopes it names (`contents: read` is enough to check out and test). `timeout-minutes:` caps a job; the default is 360 minutes.",
            "**`npm ci`, not `npm install`.** `npm ci` installs exactly what `package-lock.json` says and fails when it disagrees with `package.json`; `npm install` may update the lock file.",
        ]),

        h2("Apply it in the project"),
        p("Replace the copied file. Pull requests into main and pushes to main run it, docs-only changes do not, the token can only read, and `test` waits for `lint`:"),
        code("yaml", `
name: ci

on:
  pull_request:
    branches: [main]
    paths-ignore:
      - "docs/**"
      - "**/*.md"
  push:
    branches: [main]
    paths-ignore:
      - "docs/**"
      - "**/*.md"

permissions:
  contents: read

defaults:
  run:
    working-directory: api

jobs:
  lint:
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version-file: api/.nvmrc
      - run: npm ci
      - run: npm run lint

  test:
    needs: lint
    runs-on: ubuntu-24.04
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version-file: api/.nvmrc
      - run: npm ci
      - run: npm test`, ".github/workflows/ci.yml"),
        callout("info", "Why a pinned runner image",
            "`ubuntu-latest` moves to a new Ubuntu release on GitHub's schedule, and a build that passed yesterday can fail on new system packages. `ubuntu-24.04` changes only when you edit the file."),

        h2("Verify"),
        code("bash", `
git switch -c chore/ci && git add .github/workflows/ci.yml
git commit -m "ci: run lint and tests on pull requests" && git push -u origin chore/ci
gh pr create --fill --base main
gh pr checks --watch
# ci / lint   pass   41s
# ci / test   pass   1m12s
gh run list --branch chore/ci --limit 3   # one run per push, event pull_request
gh run view --log | grep -m1 "refs/pull"  # the merge ref was checked out`, "terminal"),
        p("Push a commit that only edits `docs/deploy.md`: `gh run list` shows no new run. Push a branch without a pull request: no run either."),

        h2("Pitfalls"),
        bullets([
            "**A required check behind a path filter.** When branch protection requires `ci / test` and a pull request only touches `docs/`, the workflow is skipped and the check stays \"Expected - Waiting for status to be reported\", blocking the merge. Either do not require that check, or move the filter into the job (a first step that decides and later steps with `if:`).",
            "**Jobs that rely on each other's files.** A `test` job with `needs: install` and no checkout fails with `ENOENT ... package.json`. Each job checks out and installs, or downloads an artifact the other job uploaded.",
            "**Patterns that match less than you think.** In filters `*` does not cross `/`: `docs/*` misses `docs/runbooks/db.md`, and `*.md` misses `api/README.md`. Use `docs/**` and `**/*.md`.",
        ]),

        challenge("chal_quiz_gha_111"),
        p("Now write the pull request workflow. The editor starts from the corrected file with its key blocks missing, each marked by a `# [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces repeat the copied workflow's mistakes on purpose. Run checks the file against pull requests, branch and tag pushes and docs-only changes, then lists each job's steps."),
        challenge("chal_coding_gha_112"),
    ],
});
