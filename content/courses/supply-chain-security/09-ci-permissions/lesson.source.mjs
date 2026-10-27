// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-ssc-3-3",
    title: "CI token permissions & dependency confusion",
    slug: { _type: "slug", current: "ci-token-permissions-dependency-confusion" },
    description:
        "A typo fix from a fork ran with the Vercel token and a writable GITHUB_TOKEN, and CI installed a company package from the public registry because only laptops knew the private scope. Learn to treat CI as production: least-privilege permissions, why pull_request_target must never run pull request code, pinning actions to a commit SHA, OIDC instead of long-lived cloud keys and how to scope its trust policy, which secrets forks can see, a scope registry in the repository's .npmrc, and branch protection that keeps all of it from being edited away.",
    estimatedTime: 25,

    scenario: {
        role: "DevOps engineer, CodeDev learning platform",
        problem:
            "A pull request from a new account, \"docs: fix typo in CONTRIBUTING.md\", also changed scripts/build-preview.mjs. The preview workflow, triggered by pull_request_target, checked out that commit and built it with VERCEL_TOKEN in the environment and a GITHUB_TOKEN that could write to the repository. Ten minutes later the Vercel audit log showed the token creating a deploy hook from an unknown address. The review that followed found a second problem in the same pipeline: CI installs @codedev/grading-client from the public npm registry, where someone else has published version 2.99.0.",
    },

    content: [
        h2("1. The incident: a typo fix with a build script"),
        p("CodeDev accepts course-content fixes from the community, so outside contributors open pull requests from forks every week. To show content writers a live preview, someone added this workflow a year ago. It used `pull_request_target` because with the plain `pull_request` trigger, previews failed on forks: the deploy step had no token."),
        code("yaml", `
# .github/workflows/preview.yml - as it was
name: preview
on: pull_request_target
jobs:
  preview:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
        with:
          ref: \${{ github.event.pull_request.head.sha }}
      - uses: some-org/setup-preview@v2
      - run: npm ci
      - run: npm run build:preview
      - run: npx vercel deploy --prebuilt --token "$VERCEL_TOKEN"
        env:
          VERCEL_TOKEN: \${{ secrets.VERCEL_TOKEN }}`, "preview.yml"),
        p("The pull request's diff was three lines in `CONTRIBUTING.md` and one in the build script:"),
        code("text", `
--- a/scripts/build-preview.mjs
+++ b/scripts/build-preview.mjs
@@ -1,3 +1,4 @@
 import { build } from "./lib/build.mjs";
+import "./lib/telemetry.mjs";   // new file in the same pull request
 await build({ mode: "preview" });`, "pull request #530"),
        p("`telemetry.mjs` replaced `node_modules/.bin/vercel` with a wrapper that sent its arguments - including `--token` - to an outside address before calling the real CLI. Every line of the workflow did what it said. The problem is what the trigger means."),

        h2("2. Read the evidence"),
        p("Start with what the job could reach. The **Set up job** section at the top of every Actions log lists the permissions of its `GITHUB_TOKEN`:"),
        code("text", `
GITHUB_TOKEN Permissions
  Actions: write
  Checks: write
  Contents: write
  Deployments: write
  ...
Secret source: Actions`, "job log of run 9201377645, Set up job"),
        p("The workflow had no `permissions:` block, and the repository was created when GitHub's default token was read-write, so the fork's code also held a token that could push to branches without protection and create tags. `Secret source: Actions` means repository secrets were available, as they always are for `pull_request_target`. The hosting provider shows the other side:"),
        code("text", `
2026-10-21 02:24:11  token "ci-preview"  created deploy hook "sync"   project codedev-web   ip 198.51.100.23
2026-10-21 02:24:40  token "ci-preview"  listed environment variables project codedev-web   ip 198.51.100.23`, "Vercel audit log (abridged)"),
        p("While reviewing the rest of the pipeline, the team compared the install logs of a laptop and of CI for the same commit:"),
        code("text", `
laptop: npm http fetch GET 200 https://npm.codedev.test/@codedev%2fgrading-client 41ms
CI:     npm http fetch GET 200 https://registry.npmjs.org/@codedev%2fgrading-client 212ms
CI:     added 1 package: @codedev/grading-client@2.99.0`, "npm install, --loglevel http"),
        p("The private registry's latest version is 2.6.1. Someone had published 2.99.0 on the public registry under the same name, a number chosen to satisfy `^2.4.0`. That is **dependency confusion**: the same name exists in two registries and the build picks the wrong one. Laptops were safe only because each developer's `~/.npmrc` maps the `@codedev` scope to the private registry; the CI runner has no home-directory config."),
        callout("warning", "Respond as if both tokens were used",
            "Revoke VERCEL_TOKEN and delete the deploy hook; check the repository for new tags, branches and workflow files created during the run; remove @codedev/grading-client@2.99.0 from every lockfile and cache, and treat any machine that installed it as compromised. Report the package to npm. Then fix the pipeline, so the next fork cannot repeat it."),

        h2("3. Core idea: CI is production with a different front door"),
        p("Your CI holds deploy tokens, cloud credentials and write access to the code. List who can make code run there: anyone who opens a pull request, anyone who can push a branch, every dependency's install script, and every third-party action. Each control below closes one of those doors."),
        h3("Least privilege for GITHUB_TOKEN"),
        p("Set the organisation or repository default to read-only, start every workflow with `permissions: {}` or `contents: read`, and grant extra scopes per job, only where a step needs them (`pull-requests: write` to comment, `id-token: write` for OIDC). A job that is compromised can only do what its token allows. Remember the limit: `permissions:` controls `GITHUB_TOKEN` and nothing else. Repository secrets are not affected by it."),
        h3("pull_request vs pull_request_target"),
        bullets([
            "**`pull_request`** runs the workflow from the pull request's merge commit. For a fork, it gets no repository secrets and a read-only `GITHUB_TOKEN`. Running untrusted code here is the designed use.",
            "**`pull_request_target`** runs the workflow file from the **base** branch, with secrets and a token that can write. It exists for jobs that must act on a pull request without running it: labelling, commenting, triaging. The moment such a job checks out `head.sha` and runs `npm ci`, a build, or tests, the fork's code runs with your secrets.",
            "**If you need both** - build the fork's code, then do something privileged with the result - split them: a `pull_request` workflow builds and uploads an artifact, and a `workflow_run` workflow downloads it and treats it as untrusted data, never executing it.",
        ]),
        p("Forks and secrets in short: with `pull_request`, a fork sees no secrets; with `pull_request_target` and `workflow_run`, the workflow sees all of them, so those workflows must never execute the pull request's code. Dependabot's pull requests get only Dependabot secrets. For first-time contributors, the repository setting that requires approval before running workflows from forks gives a maintainer a look at the diff first."),
        h3("Pin actions to a commit SHA"),
        p("`uses: some-org/setup-preview@v2` runs whatever commit the tag `v2` points to today. Tags can be moved by anyone who controls that repository. In March 2025 the tags of the widely used `tj-actions/changed-files` action were moved to a malicious commit that printed CI secrets into job logs. A full 40-character commit SHA cannot be moved. Keep the version in a comment so Dependabot or Renovate can propose updates:"),
        code("yaml", `
- uses: actions/checkout@<40-character commit SHA of the v4 release>   # v4.2.2
- uses: some-org/setup-preview@<40-character commit SHA>               # v2.3.0`, "pinned actions"),
        h3("OIDC instead of long-lived cloud keys"),
        p("An `AWS_ACCESS_KEY_ID` stored as a secret works from anywhere until someone rotates it. With OpenID Connect, a job that has `id-token: write` asks GitHub for a short-lived signed token describing the run - repository, branch, environment, trigger - and the cloud exchanges it for credentials that expire within an hour. Nothing long-lived is stored. The security now sits in the role's trust policy, which decides which runs qualify. Match the token's `sub` claim exactly (`repo:codedev/platform:environment:production`), not with `repo:codedev/platform:*`, which accepts every branch and pull request of the repository."),
        h3("Dependency confusion: one registry per scope"),
        p("Put the scope mapping in the repository, not in personal config, so every laptop and runner resolves the same way:"),
        code("text", `
# .npmrc, committed
@codedev:registry=https://npm.codedev.test/
//npm.codedev.test/:_authToken=\${CODEDEV_NPM_TOKEN}
registry=https://registry.npmjs.org/`, ".npmrc"),
        p("With a scope line, npm sends every `@codedev/*` request to that registry and nowhere else; it never compares versions between registries. Also register the `codedev` organisation on npmjs.com, even if you publish nothing there, so the name cannot be taken. Unscoped internal names (`grading-client` without a scope) cannot be protected this way: rename them into the scope. And install with `npm ci` from a lockfile whose `resolved` URLs you can review (lesson 2)."),
        h3("Branch protection holds it together"),
        p("All of the above lives in files: workflows, `.npmrc`, lockfiles. If anyone can push to `main` or edit `.github/workflows/` without review, each control is one commit away from being removed. Protect `main` with a ruleset: pull requests required, at least one approving review, required status checks (the secrets scan from lesson 7, the dependency checks), no force pushes. Add a `CODEOWNERS` entry so changes to `.github/workflows/` and `.npmrc` need a review from the platform team, and use environments with required reviewers for deploy jobs."),
        challenge("chal_quiz_ssc_331"),

        h2("4. Worked example: the preview pipeline, rebuilt"),
        p("The fixed design has two workflows. The first runs the contributor's code with nothing worth stealing:"),
        code("yaml", `
# .github/workflows/preview-build.yml
name: preview-build
on: pull_request
permissions:
  contents: read
jobs:
  build:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@<commit SHA>             # v4.2.2
        with:
          persist-credentials: false
      - run: npm ci --ignore-scripts
      - run: npm run build:preview
      - uses: actions/upload-artifact@<commit SHA>      # v4.6.0
        with:
          name: preview-site
          path: out/`, "preview-build.yml"),
        p("The second deploys the built files. It never checks out or runs the pull request's code, deploys static files only, and runs in an environment whose deploys a maintainer approves for forks:"),
        code("yaml", `
# .github/workflows/preview-deploy.yml
name: preview-deploy
on:
  workflow_run:
    workflows: [preview-build]
    types: [completed]
permissions:
  actions: read          # to download the artifact
  pull-requests: write   # to comment the preview URL
jobs:
  deploy:
    if: github.event.workflow_run.conclusion == 'success'
    runs-on: ubuntu-24.04
    environment: preview   # required reviewers
    steps:
      - uses: actions/download-artifact@<commit SHA>    # v4.1.8
        with:
          name: preview-site
          run-id: \${{ github.event.workflow_run.id }}
          github-token: \${{ github.token }}
          path: site/
      - run: npx --yes vercel@<pinned version> deploy site/ --token "$VERCEL_TOKEN"
        env:
          VERCEL_TOKEN: \${{ secrets.VERCEL_PREVIEW_TOKEN }}`, "preview-deploy.yml"),
        bullets([
            "The build job sees no secret and holds a read-only token, so a malicious build script can only break its own build.",
            "The deploy job handles the artifact as data: it uploads files, it does not execute them. The Vercel CLI comes from the registry at a pinned version, not from the pull request's `node_modules`.",
            "`VERCEL_PREVIEW_TOKEN` is a new token scoped to the preview project only; the production deploy uses OIDC and a separate environment.",
        ]),

        h2("5. How to verify"),
        bullets([
            "**Read the Set up job section** of a run for each workflow: the listed `GITHUB_TOKEN` permissions must match the `permissions:` block you wrote.",
            "**Static checks on workflows.** OpenSSF Scorecard reports Token-Permissions, Pinned-Dependencies and Dangerous-Workflow; `zizmor` and `actionlint` flag `pull_request_target` with a checkout of the pull request head, unpinned actions and template injection. Run one of them as a required check.",
            "**A canary pull request from a fork.** Open a pull request from a test fork that prints `echo \"${#VERCEL_PREVIEW_TOKEN}\"` (the length, never the value) in the build. With the fixed design it prints 0.",
            "**Prove the trust policy.** From a branch other than the allowed one, run a job that tries `aws sts get-caller-identity` after assuming the role: it must fail with `AccessDenied`.",
            "**Prove the registry.** `npm config get @codedev:registry` in CI prints `https://npm.codedev.test/`, and no `@codedev/` entry in `package-lock.json` has a `resolved` URL on `registry.npmjs.org`.",
        ]),

        h2("6. Common mistakes"),
        bullets([
            "**Treating `permissions:` as a sandbox for secrets.** It limits `GITHUB_TOKEN` only. Spot it when a workflow has a tight `permissions:` block and still passes `secrets.*` to steps that run pull request code.",
            "**Checking out the pull request head in `pull_request_target`.** Spot it by searching workflows for `pull_request_target` together with `head.sha`, `head.ref` or `github.event.pull_request.head` in a checkout.",
            "**Pinning to a tag and calling it pinned.** `@v4` and `@v4.2.2` are both movable. Spot it with a search for `uses:` lines that do not end in a 40-character hex SHA.",
            "**A wildcard OIDC subject.** `repo:org/repo:*` lets any branch or pull request run assume the role. Spot it by reading the role's trust policy, not the workflow.",
            "**Scope config only on laptops.** Builds work locally and resolve differently in CI. Spot it by diffing `npm config list` on a laptop and in a CI job, or by checking `resolved` URLs in the lockfile.",
        ]),

        h2("7. Summary"),
        numbered([
            "CI holds production credentials, so give every workflow a read-only default token, grant scopes per job, and never execute pull request code in `pull_request_target` or `workflow_run`.",
            "Remove what can be stolen or moved: OIDC with an exact `sub` condition instead of stored cloud keys, actions pinned to commit SHAs, and a committed `.npmrc` that maps your scope to your registry.",
            "Protect the files that hold these controls with branch rulesets, CODEOWNERS and environment reviewers, and check them continuously with tools such as OpenSSF Scorecard.",
        ]),

        h2("Sources"),
        bullets([
            "GitHub Docs: Automatic token authentication (permissions for the GITHUB_TOKEN), Events that trigger workflows (pull_request_target, workflow_run), Security hardening for GitHub Actions",
            "GitHub Docs: About security hardening with OpenID Connect, and Configuring OpenID Connect in Amazon Web Services",
            "npm Docs: npmrc and scope configuration; SLSA (slsa.dev) build track requirements",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Run OpenSSF Scorecard or zizmor on one of your own repositories. For every workflow, write down its trigger, its token permissions, the secrets it can read and whether it executes pull request code; then fix the first workflow where all four together would let a fork reach a secret."),
    ],
});
