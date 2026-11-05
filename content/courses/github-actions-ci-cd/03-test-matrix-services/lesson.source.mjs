// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-gha-1-3",
    title: "Test matrices, fail-fast and a real Postgres",
    slug: { _type: "slug", current: "github-actions-test-matrix-postgres" },
    description:
        "Rice Rocket's first integration test matrix cancelled itself after one failure, looked for the database at a hostname that does not exist on the runner, and flaked while Postgres was starting. Learn how matrices expand with include, what fail-fast and continue-on-error decide, and how a job reaches a Postgres service container.",
    estimatedTime: 16,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "Staging still runs Postgres 16, production runs Postgres 17, and the api has to work on Node 22 and 24 until every server is upgraded. The unit tests from lessons 1 and 2 never touch a database, so last month a query that only Postgres 17 accepts reached staging and failed there.",
    },

    content: [
        h2("Situation"),
        p("The first attempt at integration tests in CI copied the database settings from `compose.yaml`:"),
        code("yaml", `
jobs:
  integration:
    runs-on: ubuntu-24.04
    strategy:
      matrix:
        node: [22, 24]
        postgres: [16, 17]
    services:
      postgres:
        image: postgres:\${{ matrix.postgres }}
        env:
          POSTGRES_PASSWORD: test
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: \${{ matrix.node }}
      - run: npm ci
        working-directory: api
      - run: npm run test:integration
        working-directory: api
        env:
          DATABASE_URL: postgres://postgres:test@postgres:5432/postgres`, ".github/workflows/integration.yml"),
        bullets([
            "Every combination failed with `Error: getaddrinfo ENOTFOUND postgres`.",
            "After the host was changed to `localhost`, the runs failed with `ECONNREFUSED 127.0.0.1:5432`, then, once a port was published, about one run in five failed with `FATAL: the database system is starting up`.",
            "When one combination failed for a real reason, the other three showed `cancelled`, so nobody could tell whether the bug was in Postgres 16 or Node 22.",
        ]),

        h2("The core you need"),
        bullets([
            "**A matrix is a cartesian product.** `node: [22, 24]` and `postgres: [16, 17]` start four jobs, and each job reads its values as `matrix.node` and `matrix.postgres`, also in `runs-on`, service images and step inputs. `exclude` removes combinations that match all of its keys.",
            "**`include` joins or adds.** Each `include` entry is merged into every original combination it can join without overwriting an original value; when it would overwrite one, it becomes a new combination. `{node: 25, postgres: 17, experimental: true}` adds a fifth job, because no original combination has Node 25.",
            "**`fail-fast` defaults to `true`.** The first failing job of a matrix cancels every job of that matrix still queued or running. `fail-fast: false` lets each combination report its own result, which is the point of a version matrix.",
            "**`continue-on-error` on the job.** A job with `continue-on-error: true` can fail without failing the run and without triggering fail-fast. With an expression such as `${{ matrix.experimental == true }}` it applies to the experimental combination only.",
            "**Where a service container lives.** Services run in Docker on the runner. A job with `container:` shares their network and reaches Postgres at `postgres:5432`; a job without one runs on the runner VM and reaches it only through a published port, `localhost:5432` with `ports: - 5432:5432`.",
            "**The runner can wait for a service.** `options:` passes `docker create` flags; with `--health-cmd \"pg_isready -U postgres\"` and the `--health-*` timings, the runner waits until the container is healthy before the first step starts. Without a health check it starts the steps as soon as the container exists.",
        ]),

        h2("Apply it in the project"),
        p("The integration workflow, with Node 25 tried early on Postgres 17 without blocking merges:"),
        code("yaml", `
jobs:
  integration:
    runs-on: ubuntu-24.04
    timeout-minutes: 20
    strategy:
      fail-fast: false
      matrix:
        node: [22, 24]
        postgres: [16, 17]
        include:
          - node: 25
            postgres: 17
            experimental: true
    continue-on-error: \${{ matrix.experimental == true }}
    services:
      postgres:
        image: postgres:\${{ matrix.postgres }}
        env:
          POSTGRES_PASSWORD: test
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U postgres"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: \${{ matrix.node }}
          cache: npm
          cache-dependency-path: api/package-lock.json
      - run: npm ci
        working-directory: api
      - run: npm run test:integration
        working-directory: api
        env:
          DATABASE_URL: postgres://postgres:test@localhost:5432/postgres`, ".github/workflows/integration.yml"),
        callout("info", "Why a folded block for options",
            "`>-` folds the lines into one string separated by spaces, with no newline at the end: exactly the single command line `docker create` expects, while each flag stays on its own line in the file."),

        h2("Verify"),
        p("Open the run and read the job list and the setup of one job:"),
        code("text", `
integration (22, 16)                   passed  2m 04s
integration (22, 17)                   passed  2m 01s
integration (24, 16)                   passed  1m 58s
integration (24, 17)                   passed  1m 59s
integration (25, 17, true)             passed  2m 10s

Initialize containers
  Starting postgres service container
  Waiting for all services to be ready
  postgres service is healthy.`, "Actions run"),
        code("bash", `
# Run one combination locally, the way the job does
docker run -d --name pg16 -e POSTGRES_PASSWORD=test -p 5432:5432 postgres:16
until docker exec pg16 pg_isready -U postgres; do sleep 1; done
DATABASE_URL=postgres://postgres:test@localhost:5432/postgres npm run test:integration --prefix api`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**`continue-on-error: true` for the whole job.** Every combination may then fail while the run stays green, and branch protection lets a broken query merge. Detect it when a run shows a failed job under a green check; scope it to the experimental combination with a matrix expression.",
            "**A service image that ignores the matrix.** `image: postgres:17` in a Postgres 16/17 matrix tests version 17 twice. Detect it in the job's \"Initialize containers\" step, which prints the image it pulled.",
            "**Required checks named after matrix jobs.** Branch protection lists `integration (22, 16)` and the others by name; after a change to the matrix, a required name that no longer exists stays pending forever. Detect it on the pull request's checks list; require a small summary job that `needs` the matrix instead.",
        ]),

        challenge("chal_quiz_gha_131"),
        p("Now build the matrix yourself. The editor holds the integration workflow with its matrix, service and test settings missing, each marked by a `# [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces repeat the first attempt's mistakes on purpose. Run expands the matrix, resolves each combination's database connection and replays failures under fail-fast."),
        challenge("chal_coding_gha_132"),
    ],
});
