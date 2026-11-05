// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-gha-2-2",
    title: "Environments, approvals and concurrency groups",
    slug: { _type: "slug", current: "github-actions-environments-approvals-concurrency" },
    description:
        "Two merges a minute apart deployed at the same time and the older one finished last, so Rice Rocket's old version went live; anyone who merged also deployed to production unreviewed. Learn how environments (reviewers, branch rules, scoped secrets) and concurrency groups (one running, one pending) make deploys orderly, and why a deploy group must never cancel the deploy in progress.",
    estimatedTime: 16,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "Images are now built and pushed per commit, and a deploy workflow ships every push to main to the VPS. On a busy Friday two merges deployed in parallel, the slower and older deploy finished last and put the old version back. A quick fix with `cancel-in-progress: true` then killed a deploy halfway through a database migration.",
    },

    content: [
        h2("Situation"),
        p("This is the deploy workflow after the image lesson. It works for one merge at a time:"),
        code("yaml", `
on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v5
      - run: ./deploy/build-image.sh "\${{ github.sha }}"

  deploy:
    needs: build
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v5
      - run: ./deploy/ship.sh production "\${{ github.sha }}"
        env:
          SSH_KEY: \${{ secrets.SSH_KEY }}       # a repository secret`, ".github/workflows/deploy.yml"),
        bullets([
            "Merge `a1f3c2e` (with a slow migration) and merge `b7d9e01` a minute later: both deploy jobs ran at once, `b7d9e01` finished first, then `a1f3c2e` finished and the VPS ran the older code.",
            "Every developer who can merge to main deploys to production; nobody reviews a release, and nothing runs on a staging server first.",
            "After adding `concurrency: { group: deploy, cancel-in-progress: true }`, a new merge cancelled the running deploy in the middle of `node dist/migrate.js`.",
        ]),

        h2("The core you need"),
        bullets([
            "**An environment is a named deploy target with rules.** It is created under Settings > Environments; a job joins it with `environment: { name: production, url: https://ricerocket.vn }`. Before such a job starts, GitHub applies the environment's protection rules: required reviewers (someone clicks Approve), deployment branches (only `main` may deploy) and an optional wait timer. The `url` shows on the run and on the Deployments page.",
            "**Environment secrets are scoped.** A secret stored on `production` reaches only jobs that declare `environment: production`, and only after its rules passed. Every other job reads an empty string, without an error. Moving `SSH_KEY` from the repository to the environment means no other workflow can read it.",
            "**A concurrency group allows one running job and one pending job.** `concurrency: { group: deploy-production }` on a job puts every job with that group string in one line. If a job is running, the next one waits as pending; if another arrives while one is pending, the older pending one is cancelled and the newer one waits instead. For deploys of main that is exactly right: the newest commit contains all older ones.",
            "**`cancel-in-progress` decides who loses.** `true` cancels the running job when a new one arrives: right for CI on a pull request (an outdated test run is worthless), wrong for a deploy (a half-applied migration). Deploy groups use `false`. CI groups put the ref in the name, `ci-${{ github.ref }}`, so pull requests do not cancel each other.",
            "**`needs` builds the release path.** `deploy-production` with `needs: deploy-staging` starts only after staging succeeded; a failed or skipped staging job skips production. `if: github.ref == 'refs/heads/main'` on the first deploy job keeps a manual `workflow_dispatch` run from a feature branch from deploying anything.",
        ]),

        h2("Apply it in the project"),
        p("Settings > Environments now holds two environments: `staging` (secret `STAGING_SSH_KEY`, any branch) and `production` (secret `PROD_SSH_KEY`, required reviewer: the tech lead, deployment branches: `main`). The workflow:"),
        code("yaml", `
name: deploy

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read

jobs:
  build:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v5
      - run: ./deploy/build-image.sh "\${{ github.sha }}"

  deploy-staging:
    needs: build
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-24.04
    environment:
      name: staging
      url: https://staging.ricerocket.vn
    concurrency:
      group: deploy-staging
      cancel-in-progress: false
    steps:
      - uses: actions/checkout@v5
      - run: ./deploy/ship.sh staging "\${{ github.sha }}"
        env:
          SSH_KEY: \${{ secrets.STAGING_SSH_KEY }}

  deploy-production:
    needs: deploy-staging
    runs-on: ubuntu-24.04
    environment:
      name: production
      url: https://ricerocket.vn
    concurrency:
      group: deploy-production
      cancel-in-progress: false
    steps:
      - uses: actions/checkout@v5
      - run: ./deploy/ship.sh production "\${{ github.sha }}"
        env:
          SSH_KEY: \${{ secrets.PROD_SSH_KEY }}`, ".github/workflows/deploy.yml"),
        p("Replaying the Friday merges (`a1f3c2e` with a 5-minute migration, then `b7d9e01` and `c4e2a9b` a minute apart):"),
        bullets([
            "Staging: `a1f3c2e` runs; `b7d9e01` waits; `c4e2a9b` arrives, `b7d9e01` is cancelled while pending and `c4e2a9b` waits; `a1f3c2e` finishes, then `c4e2a9b` deploys. Live: `c4e2a9b`.",
            "Production: the same order, each one after its staging deploy and the reviewer's approval. Nothing is cut short, and the newest commit ends up live.",
        ]),
        callout("info", "Job level or workflow level",
            "`concurrency:` at the top of the file applies to whole runs, so a new run would also wait behind an old run's build job. At job level only the deploy jobs line up, and builds of new commits keep running in parallel. Group names are shared across all workflows of the repository, so a manual hotfix workflow using `deploy-production` waits in the same line."),

        h2("Verify"),
        code("bash", `
gh run list --workflow deploy.yml --limit 4
# in_progress  ...  c4e2a9b  main  push
# cancelled    ...  b7d9e01  main  push
# completed    ...  a1f3c2e  main  push
gh run view <run id of b7d9e01> --log | grep -i canceling
# Canceling since a higher priority waiting request for deploy-staging exists
gh api repos/rice-rocket/app/deployments --jq '.[0] | {environment, sha}'
# { "environment": "production", "sha": "c4e2a9b..." }
curl -s https://ricerocket.vn/health
# {"status":"ok","version":"sha-c4e2a9b"}`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**A group name that changes per commit.** `group: deploy-${{ github.sha }}` gives every commit its own group, which is the same as no group. Detect it in the run list: two deploy jobs in progress at once. Keep deploy group names constant.",
            "**Approving your own release.** A required reviewer who merged the change can approve its deploy unless the environment has \"Prevent self-review\" checked. Detect it on the Deployments page (approver equals the author of the merge); turn the option on for `production`.",
            "**Secrets left at repository level.** If `PROD_SSH_KEY` also exists as a repository secret, every workflow (and every job without `environment:`) can still read it. Delete the repository copy after moving it to the environment.",
        ]),

        challenge("chal_quiz_gha_151"),
        p("Now rebuild the deploy workflow. The editor holds `.github/workflows/deploy.yml` with its key blocks missing, each marked by a `# [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces repeat Friday's mistakes on purpose. Run replays three quick merges, a failed staging deploy and a manual run from a feature branch on one clock, with the environments' rules and concurrency groups."),
        challenge("chal_coding_gha_152"),
    ],
});
