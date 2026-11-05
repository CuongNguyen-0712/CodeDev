// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-gha-3-2",
    title: "Reusable workflows for many repositories",
    slug: { _type: "slug", current: "github-actions-reusable-workflows" },
    description:
        "Rice Rocket's three repositories copied one CI file and the copies drifted apart. Learn how a reusable workflow takes typed inputs, secrets and outputs, which contexts each part may read, and how callers pin it - then write the shared Node CI workflow all three repositories call.",
    estimatedTime: 16,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "Rice Rocket now has three repositories: app (api and web), admin and courier-app. Each started from the same ci.yml, and six months later the copies disagree on the Node version, the cache and the time limit. A fix to CI has to be made three times, and it never is.",
    },

    content: [
        h2("Situation"),
        p("The same job, as it reads today in the three repositories:"),
        code("text", `
app/.github/workflows/ci.yml           node-version: 24   cache: npm   timeout-minutes: 15
admin/.github/workflows/ci.yml         node-version: 20   cache: npm   timeout-minutes: 15
courier-app/.github/workflows/ci.yml   node-version: 24   (no cache)   (no timeout: up to 360 min)`, "drift"),
        bullets([
            "admin still tests on Node 20 while production runs Node 24, so a `structuredClone` bug reached staging untested.",
            "courier-app downloads every dependency on every run: 3 minutes of `npm ci` per pull request.",
            "A hung integration test in courier-app held a runner for six hours last week.",
        ]),

        h2("The core you need"),
        bullets([
            "**A reusable workflow is a workflow with `on: workflow_call`.** It lives in `.github/workflows/` of any repository the callers can reach; here the organization's `rice-rocket/.github` repository. A caller uses it as a whole job: `jobs: { ci: { uses: rice-rocket/.github/.github/workflows/node-ci.yml@v1 } }`.",
            "**Inputs are typed.** Each entry under `on.workflow_call.inputs` has a `type` (`string`, `boolean` or `number`), and `required: true` or a `default`. The caller passes them with `with:`; GitHub refuses an undeclared input or a missing required one before any job starts. Inside, read them with `inputs.<name>`; `github.event.inputs` belongs to `workflow_dispatch` and is empty here.",
            "**Booleans stay booleans.** `if: inputs.run-integration` is enough. `inputs.run-integration == 'true'` compares a boolean with a string: the expression language converts both to numbers (`true` is 1, `'true'` is NaN), so the comparison is always false.",
            "**Secrets are passed on purpose.** The called workflow sees none of the caller's secrets unless the caller lists them under `secrets:` (each one declared under `on.workflow_call.secrets`) or writes `secrets: inherit`.",
            "**Outputs go step, job, workflow.** A step writes `name=value` to `$GITHUB_OUTPUT`; the job maps it in `outputs:` with `steps.<id>.outputs.<name>`; the workflow maps the job's in `on.workflow_call.outputs.<name>.value` with `jobs.<id>.outputs.<name>`. The `steps` context does not exist at the workflow level.",
            "**Callers pin a version.** `@v1` is a tag the platform team moves when a release is ready; `@main` changes under every repository at once. A full commit SHA is the strictest pin.",
        ]),

        h2("Apply it in the project"),
        p("The shared workflow, in the organization's `.github` repository:"),
        code("yaml", `
name: node-ci

on:
  workflow_call:
    inputs:
      working-directory:
        type: string
        required: true
      node-version:
        type: string
        default: "24"           # a string: "24.1" or "lts/*" work too
      run-integration:
        type: boolean
        default: false
    secrets:
      NPM_TOKEN:
        required: false         # only callers with private packages pass it
    outputs:
      coverage:
        description: Line coverage of the tests, in percent
        value: \${{ jobs.test.outputs.coverage }}

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-24.04
    timeout-minutes: 15
    outputs:
      coverage: \${{ steps.cov.outputs.pct }}
    defaults:
      run:
        working-directory: \${{ inputs.working-directory }}
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: \${{ inputs.node-version }}
          cache: npm
          cache-dependency-path: \${{ inputs.working-directory }}/package-lock.json
      - run: npm ci
        env:
          NODE_AUTH_TOKEN: \${{ secrets.NPM_TOKEN }}
      - run: npm run test:coverage
      - id: cov
        name: Read the coverage
        run: echo "pct=$(jq .total.lines.pct coverage/coverage-summary.json)" >> "$GITHUB_OUTPUT"
      - name: Integration tests
        if: inputs.run-integration
        run: npm run test:integration`, "rice-rocket/.github: .github/workflows/node-ci.yml"),
        p("Each repository keeps a short `ci.yml` that decides when CI runs and what to pass. In app:"),
        code("yaml", `
name: ci
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  ci:
    uses: rice-rocket/.github/.github/workflows/node-ci.yml@v1
    with:
      working-directory: api
      run-integration: true
    secrets: inherit

  report:
    needs: ci
    runs-on: ubuntu-24.04
    steps:
      - run: echo "Coverage \${{ needs.ci.outputs.coverage }}%" >> "$GITHUB_STEP_SUMMARY"`, "app: .github/workflows/ci.yml"),
        callout("info", "A private .github repository",
            "If `rice-rocket/.github` is private, callers get \"workflow was not found\" until its settings allow it: Settings > Actions > General > Access > \"Accessible from repositories in the 'rice-rocket' organization\"."),

        h2("Verify"),
        code("bash", `
# in rice-rocket/.github: release the workflow
git tag -a v1 -m "node-ci v1" && git push origin v1

# in app: open a pull request, then
gh run view --json jobs --jq '.jobs[].name'
# ci / test
# report
gh run view --log | grep -E 'setup-node|Integration tests' | head -3
# ci / test  Run actions/setup-node@v5 ... node-version: 24
gh run view --log --job <report job id> | grep Coverage
# Coverage 87.5%`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**Comparing a boolean input with a string.** `if: inputs.run-integration == 'true'` is always false, so the integration tests silently never run. Detect it when the step shows as skipped in a run that passed `true`; use `if: inputs.run-integration`.",
            "**Forgetting the secrets.** Without `secrets: inherit` or an explicit `secrets:` map, `secrets.NPM_TOKEN` is empty inside and `npm ci` fails with `E401` on the private package. Detect it in the `npm ci` log; pass the secret from the caller.",
            "**Calling `@main`.** A change merged into the shared workflow reaches every repository's next run, including a broken one. Call `@v1` (or a SHA), test changes from a branch with `@my-branch` in one repository, then move the tag.",
        ]),

        p("Now write the shared workflow. The editor holds `node-ci.yml` with its key blocks missing, each marked by a `# [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces are wrong on purpose. Run calls the workflow the way app, admin and courier-app do and reports the Node version, the folder, the integration tests and the coverage output each caller gets."),
        challenge("chal_coding_gha_182"),
    ],
});
