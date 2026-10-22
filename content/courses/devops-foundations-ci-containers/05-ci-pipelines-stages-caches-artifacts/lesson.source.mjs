// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// YAML blocks are normal template literals: every GitHub expression is written \${{ ... }} so JavaScript keeps it as text.
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-devf-3-1",
    title: "CI pipelines: stages, caches & artifacts",
    slug: { _type: "slug", current: "devops-ci-pipelines-stages-caches-artifacts" },
    description:
        "Rice Rocket's CI was flaky for a week: tests ran against a stale virtualenv because the cache key never changed, and a deploy job with if: always() shipped a commit whose tests had failed - after building the image a second time. Learn how a GitHub Actions workflow is built from jobs and steps, how needs turns it into a graph that runs in parallel, what if: really checks, the difference between a cache and an artifact, why you build once and deploy what you tested, and how concurrency, timeouts, pinned actions and fork rules keep a pipeline honest.",
    estimatedTime: 24,

    scenario: {
        role: "Junior DevOps engineer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "On Monday a developer upgraded the Redis client in requirements.txt and changed the dispatch code to the new API. From then on the unit tests failed on some branches and passed on others. On Wednesday the tests failed on main, and the deploy job ran anyway: it had if: always(), built a fresh Docker image from the failing commit and pushed it to production. The refund endpoint returned 500 for 40 minutes - the very bug the failed test had caught.",
    },

    content: [
        h2("1. The incident"),
        p("This was Rice Rocket's workflow file, `.github/workflows/ci.yml`, on the day of the outage:"),
        code("yaml", `
name: ci
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.14"
      - uses: actions/cache@v4
        id: deps
        with:
          path: .venv
          key: deps-\${{ runner.os }}            # the same key forever
      - if: steps.deps.outputs.cache-hit != 'true'
        run: python -m venv .venv && .venv/bin/pip install -r requirements.txt
      - run: .venv/bin/pytest

  deploy:
    needs: test
    if: always()                                # "so a flaky test cannot block releases"
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: docker build -t ghcr.io/ricerocket/api:latest .
      - run: docker push ghcr.io/ricerocket/api:latest
      - run: ./deploy.sh ghcr.io/ricerocket/api:latest`, ".github/workflows/ci.yml"),
        p("Three separate mistakes lined up:"),
        bullets([
            "**The cache key never changed.** `deps-Linux` was saved once, months ago. Every later run restored that old `.venv` - still with the old Redis client - and the install step was skipped because the cache \"hit\". Whether a branch saw the old or a newer `.venv` depended on which branch had saved a cache first, so the tests looked **flaky**.",
            "**`if: always()` turned off the safety net.** `needs: test` makes deploy wait for test, but `always()` tells GitHub to run the job whatever happened to test - failed, skipped or cancelled.",
            "**Deploy built its own image.** The image in production was not the one any test had run against. It came from a second `docker build`, in a different job, minutes later, tagged with the moving tag `latest`.",
        ]),

        h2("2. Reproduce it"),
        p("You cannot run GitHub's runners on your laptop, but you can see the cache bug in one line. A good cache key changes **exactly when the thing you cache would change**. Compare the old key with a key that contains a hash of `requirements.txt`, before and after the Redis upgrade:"),
        code("bash", `
$ printf 'redis==4.6.0\\nfastapi==0.115.0\\n' > requirements.txt
$ echo "old key: deps-Linux   new key: deps-Linux-$(sha256sum requirements.txt | cut -c1-12)"
old key: deps-Linux   new key: deps-Linux-<12 hex characters>

$ sed -i 's/redis==4.6.0/redis==5.2.1/' requirements.txt
$ echo "old key: deps-Linux   new key: deps-Linux-$(sha256sum requirements.txt | cut -c1-12)"
old key: deps-Linux   new key: deps-Linux-<12 different hex characters>`),
        p("The old key is identical before and after the upgrade, so the old `.venv` keeps \"hitting\". In the Actions log of a failing run the cache step said something similar to this, and the install step was shown as skipped:"),
        code("text", `
Run actions/cache@v4
Cache restored from key: deps-Linux
...
Post job cleanup.
Cache hit occurred on the primary key deps-Linux, not saving cache.`),

        h2("3. Workflow, jobs, steps and runners"),
        p("A GitHub Actions **workflow** is a YAML file in `.github/workflows/`. The `on:` key says which events start it (`push`, `pull_request`, a schedule, a manual `workflow_dispatch`). One start is a **workflow run**."),
        bullets([
            "**Job**: a group of steps that runs on one **runner** - for `runs-on: ubuntu-latest`, a fresh virtual machine that is thrown away afterwards. Jobs do **not** share files: whatever job A created is gone when job B starts on its own machine.",
            "**Step**: one command (`run:`) or one reusable **action** (`uses: actions/checkout@v4`). Steps of a job run in order, in the same machine and the same working directory, so step 3 sees the files of step 2.",
            "**A step that exits with a non-zero code fails the job**, and the following steps are skipped (unless they have their own `if:`). That is the exit code from lesson 1, now deciding whether code reaches production.",
        ]),
        p("Many CI systems call groups of jobs **stages** (GitLab CI has a `stages:` list: build, test, deploy). GitHub Actions has no stages keyword - the order comes only from `needs`, which is more flexible: it describes a **graph**, not a fixed list."),

        h2("4. needs: from a list of jobs to a graph"),
        p("Jobs without `needs` all start at the same time, each on its own runner. `needs` adds an edge: \"start this job only after these jobs finished successfully\"."),
        code("yaml", `
jobs:
  lint:            # 2 min, starts at once
    ...
  unit:            # 5 min, starts at once, in parallel with lint
    ...
  build:
    needs: [lint, unit]   # starts when BOTH are done: minute 5
    ...
  deploy:
    needs: build          # starts at minute 8, ends at minute 10
    ...`),
        image("needs-graph-timeline", {
            alt: "Top left, the needs graph: lint (2 min) and unit (5 min) both point to build (3 min), which points to deploy (2 min); build uploads the image as an artifact, deploy downloads the same artifact with no rebuild, and unit restores its dependency cache with a key made of the OS and a hash of requirements.txt. unit, build and deploy are violet: the critical path. Top right, the run with enough runners on a timeline from 0 to 10 minutes: lint runs 0 to 2 and then waits 3 minutes of slack, unit runs 0 to 5, build 5 to 8, deploy 8 to 10; wall time 10 minutes equals unit 5 plus build 3 plus deploy 2. Bottom left, red, before: deploy waits for test but not for it to pass, if: always() deploys even after the tests failed, deploy builds the image again so it was never tested, the cache key deps-Linux never changes so the .venv is stale; result: flaky tests and untested releases. Bottom right, green, after: build needs lint and unit and deploy needs build, the default if: success() skips everything after a failure, build once and deploy the artifact that was tested, the key includes hashFiles of requirements.txt; result: what you tested is what you ship.",
            caption: "needs makes the order explicit. Jobs off the critical path have slack; making them faster does not make the run faster.",
        }),
        p("With enough runners, a job starts at the **latest end** of the jobs it needs. The total time of the run (the **wall time**) is set by the longest chain of jobs, the **critical path**: here `unit -> build -> deploy` = 5 + 3 + 2 = 10 minutes. `lint` has 3 minutes of slack - making it faster changes nothing. To speed up the pipeline, find the critical path first; that is exactly what you will compute in the challenge."),
        bullets([
            "**A job that needs a failed job is skipped**, and so is everything that needs a skipped job. Skipping spreads through the graph.",
            "**`needs` must name existing jobs and must not form a cycle.** GitHub refuses such a file before running anything (the run fails with an error such as \"The workflow is not valid\").",
            "**Parallel is not free**: every job checks out the code and installs tools again on a new machine. Split jobs where it shortens the critical path, not more.",
        ]),

        h2("5. if: and the status functions"),
        p("Every job and step has a hidden condition: **`if: success()`** - run only if everything before (for a job: every job in `needs`, and their needs) succeeded. Writing your own `if:` keeps that default, unless your expression uses a **status function**:"),
        bullets([
            "**`success()`**: the default. `if: github.ref == 'refs/heads/main'` really means `success() && github.ref == 'refs/heads/main'`.",
            "**`always()`**: true whatever happened, even after a failure or a cancel. Right for cleanup and for uploading test reports; wrong for anything that changes production.",
            "**`failure()`**: true when something before failed. Use it for a \"notify the team\" job or step.",
            "**`cancelled()`**: true when the run was cancelled.",
        ]),
        code("yaml", `
  notify-failure:
    needs: [unit, build, deploy]
    if: failure()                 # only when one of them failed
    runs-on: ubuntu-latest
    steps:
      - run: ./notify-chat.sh "CI failed on \${{ github.ref_name }}: \${{ github.server_url }}/\${{ github.repository }}/actions/runs/\${{ github.run_id }}"`),
        callout("warning", "A flaky test is a bug report, not a reason for if: always()",
            "When a test fails at random, people reach for a quick escape: if: always(), continue-on-error: true, or retrying the job until it passes. Each of them makes the pipeline green while the bug is still there, and the next real failure goes out the same door. Find out why it is flaky - shared state between tests, the clock, test order, a real network call, or a stale cache like in this incident - and fix that."),

        h2("6. Cache or artifact?"),
        p("Both move files between machines, but they answer different questions:"),
        bullets([
            "**Cache** (`actions/cache`): \"make this job faster next time\". It holds things you could always download again - pip's download cache, npm's cache. It is shared between runs, it may be **evicted** at any time (GitHub removes caches that were not used for 7 days, and older ones when the repository's cache storage is full), and a missing cache must never change the result, only the time.",
            "**Artifact** (`actions/upload-artifact` / `actions/download-artifact`): \"hand this exact output to a later job or a human\". It belongs to one workflow run: the built image, a wheel, a coverage report. It stays for the run's retention period (90 days by default) and is the same bytes every time it is downloaded.",
        ]),
        h3("A cache key that changes when it should"),
        code("yaml", `
      - uses: actions/cache@v4
        with:
          path: ~/.cache/pip
          key: pip-\${{ runner.os }}-\${{ hashFiles('requirements*.txt') }}
          restore-keys: |
            pip-\${{ runner.os }}-
      - run: pip install -r requirements.txt     # always runs: the cache only saves downloads`),
        numbered([
            "**`key`** is looked up first. `hashFiles()` returns a SHA-256 of the matching files' contents, so the key changes exactly when a requirements file changes - and never on a commit that only touches code.",
            "**`restore-keys`** are prefixes used when the exact key misses: the most recent cache whose key starts with `pip-Linux-` is restored. An older cache is still a good start; pip only downloads what is new.",
            "**At the end of the job**, if the exact key missed, the post step saves a new cache under the new key. **Caches are immutable**: an existing key is never overwritten. That is why a constant key like `deps-Linux` freezes the first content forever.",
            "**Cache what is safe to be old** (downloads), not the result itself (`.venv` with a skipped install). If you do cache a whole environment, the key must include everything it depends on - the Python version too.",
        ]),
        p("`actions/setup-python` can do the same for you: `with: { python-version: \"3.14\", cache: pip }` caches pip's downloads with a key built from your requirements files. Caches are also scoped by branch: a run can restore caches from its own branch and from the default branch (for a pull request, also from the base branch)."),

        h2("7. Build once, deploy what you tested"),
        p("The deploy job in the incident ran `docker build` again. Even from the same commit, a second build can differ - a base image tag that moved, a dependency without a pinned version, a different time of day for anything that downloads. And it was tagged `latest`, which says nothing about which commit it is. The rule is simple: **the bytes that passed the tests are the bytes that go to production.**"),
        code("yaml", `
  build:
    needs: [lint, unit]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: docker build -t api:\${{ github.sha }} .
      - run: docker save api:\${{ github.sha }} -o api.tar
      - uses: actions/upload-artifact@v4
        with:
          name: api-image
          path: api.tar
          retention-days: 7

  deploy:
    needs: build
    if: github.ref == 'refs/heads/main'          # success() is still implied
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      - uses: actions/download-artifact@v4
        with:
          name: api-image
      - run: docker load -i api.tar
      - run: ./deploy.sh api:\${{ github.sha }}`, ".github/workflows/ci.yml"),
        bullets([
            "**Tag with the commit SHA** (`github.sha`), never only with `latest`: you can always tell which code runs, and roll back to an exact earlier tag (lesson 7).",
            "**Most teams push the image to a registry** in the build job and deploy it by tag or digest instead of passing a tarball - the idea is the same: one build, many uses.",
            "**`environment: production`** lets you protect the deploy with required reviewers and keep production secrets available only to that job.",
        ]),

        h2("8. Keep the pipeline honest: fail fast, timeouts, concurrency"),
        bullets([
            "**Fail fast**: put the quick checks (lint, type check, unit tests) first, so a typo fails in 2 minutes instead of after a 15-minute build. In a `strategy.matrix`, `fail-fast` (on by default) cancels the other matrix jobs when one fails.",
            "**`timeout-minutes`**: the default limit of a job is 360 minutes. A test that hangs on a network call should fail after 15, not block a runner for six hours.",
            "**`concurrency`**: runs in the same group never overlap. For pull requests, cancel the older run when a new commit arrives; for deploys, set `cancel-in-progress: false` so a running deploy is never cancelled halfway through. A group holds at most one running and one pending run: if three merges land quickly, the second pending deploy is replaced by the third and never runs - fine for deploys, because the newest commit contains the older ones.",
        ]),
        code("yaml", `
concurrency:                      # whole workflow: one run per branch or PR
  group: ci-\${{ github.ref }}
  cancel-in-progress: true

jobs:
  deploy:
    concurrency:                  # one production deploy at a time, a running one is never cancelled
      group: deploy-production
      cancel-in-progress: false
    timeout-minutes: 20`),

        h2("9. Secrets, forks and pinned actions"),
        bullets([
            "**Secrets** (`\${{ secrets.REGISTRY_TOKEN }}`) are masked in logs, but a step can still leak them - never `echo` them or write them into an artifact.",
            "**Pull requests from forks get no secrets**: except for `GITHUB_TOKEN` (with read-only permissions), secrets are not passed to a workflow triggered by a fork's pull request, because that code is not yours yet. Do not \"fix\" this with `pull_request_target` plus a checkout of the PR's code - that runs a stranger's code with your secrets.",
            "**`permissions:`** at the top of the workflow limits what `GITHUB_TOKEN` can do. Start with `contents: read` and add only what a job needs.",
            "**Pin third-party actions to a full commit SHA**: a tag like `@v4` can be moved to different code by whoever controls that repository. In March 2025 the tags of the popular `tj-actions/changed-files` action were moved to a malicious commit that printed CI secrets into public logs. A SHA cannot be moved: `uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2`.",
        ]),

        h2("10. Your turn"),
        p("First, read two workflow snippets the way the runner does."),
        challenge("chal_quiz_devf_311", "For each job, ask two questions: did every job in its needs succeed, and does its if: use a status function that replaces the default success()? For the cache, remember that caches are never overwritten."),
        p("Then the question that started the speed-up project after the incident: which jobs actually decide how long a run takes? Write the planner that the team used to find out - it also has to catch broken graphs before anyone waits for them."),
        challenge("chal_coding_devf_312", "Check unknown needs first, then plan in rounds: a job is ready when all of its needs are planned; if a round finds no ready job, the remaining jobs are the cycle error. A ready job is skipped when any need is not success, otherwise start = latest end of its needs. For the critical path, walk backwards from the job with the latest end, always to the need that ended last."),

        h2("11. Pitfalls"),
        bullets([
            "**A cache key without a hash of what it depends on** (`deps-Linux`): the first content is restored forever, because caches are never overwritten.",
            "**Skipping the install step on a cache hit**: if the key is wrong, the job silently runs with old packages. Let the installer run; a cache should only make it faster.",
            "**Passing build output through a cache**: it can be evicted between jobs. Use an artifact or a registry.",
            "**`if: always()` or `continue-on-error: true` on anything that changes production**: it removes the dependency on the jobs before it.",
            "**Building again in the deploy job**, or deploying a moving tag like `latest`: production runs something no test has seen.",
            "**Retrying flaky tests until green**: the bug stays, and real failures start to look \"flaky\" too.",
            "**No `timeout-minutes`**: a hanging job can block a runner for 6 hours.",
            "**Third-party actions pinned to a tag** instead of a commit SHA, and workflows with write permissions they do not need.",
        ]),

        h2("12. Checklist"),
        bullets([
            "Every job that must wait for another has `needs`, and you know the critical path of your workflow.",
            "Fast checks run first; every job has `timeout-minutes`.",
            "No `always()` on deploy steps; `always()` only for cleanup and reports, `failure()` for notifications.",
            "Cache keys contain `hashFiles()` of the lock or requirements files (and the runtime version); the install step always runs.",
            "Build output moves between jobs as an artifact or a registry image, tagged with the commit SHA - built once, deployed as tested.",
            "Deploys run in a `concurrency` group with `cancel-in-progress: false` (a running deploy is never cancelled), behind a protected `environment`.",
            "`permissions:` is minimal, fork PRs never see secrets, third-party actions are pinned to a commit SHA.",
        ]),
    ],
});
