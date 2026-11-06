// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-pat-3-1",
    title: "Parallel runs and shared state",
    slug: { _type: "slug", current: "api-testing-parallel-runs-shared-state" },
    description:
        "Moving Rice Rocket's API suite to pytest-xdist cut CI from 14 minutes to 4 and made it fail at random: a shared courier was busy, a count included other tests' orders, two workers wrote the same receipt file. Learn how xdist runs tests, what workers share and what they do not, and how to make each test own its data, its files and its assertions.",
    estimatedTime: 15,

    scenario: {
        role: "QA engineer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "The suite now runs with `pytest -n 4` against one staging API. Every run has two or three red tests, never the same ones, and the team has started adding reruns.",
    },

    content: [
        h2("Situation"),
        code("text", `
$ pytest -n 4 -q
[gw2] FAILED tests/test_courier.py::test_courier_accepts_order - assert 409 == 200 (courier is busy with another delivery)
[gw0] FAILED tests/test_orders.py::test_order_history - AssertionError: expected 2 orders in the history, found 7
[gw3] FAILED tests/test_receipts.py::test_receipt - read back: 'receipt for order 5112'
3 failed, 60 passed in 3m58s

$ pytest -n 0 -q
63 passed in 13m51s`, "terminal"),
        p("The helpers the tests used:"),
        code("python", `
def courier_for(api, ctx):
    return 1                                   # the seeded demo courier

def my_order_count(api, customer_id):
    return len(api.get("/orders")[1])          # every order on staging

def artifact_path(ctx, name):
    return f"/tmp/{name}"`, "tests/helpers.py"),

        h2("The core you need"),
        bullets([
            "**Workers are separate processes.** `pytest -n 4` (pytest-xdist) starts four Python processes, `gw0` to `gw3`, and hands tests to them. They share nothing in memory, but they share everything outside: the staging API, its data, the CI machine's disk.",
            "**Each worker has its own session.** A `scope=\"session\"` fixture runs once per worker, so four workers create \"the\" seeded record four times. The `worker_id` fixture tells a test which worker it is on (`master` when xdist is off).",
            "**Distribution modes.** `--dist load` (the default) gives each test to one worker; `loadscope` and `loadfile` keep a module or file on one worker; `each` runs every test on every worker. With `each`, or with two CI jobs on one staging, the same test name runs twice at the same moment.",
            "**Own the data, the files and the assertion.** Create what the test changes (its own courier), name it with the worker and the test, write files under `tmp_path` (a fresh directory per test and worker), and assert only on what the test created (filter by its customer, compare ids instead of totals).",
            "**Reruns hide coupling.** pytest-rerunfailures turns a collision into a green report; keep reruns for things you do not control, and track how often they fire.",
        ]),

        h2("Apply it in the project"),
        code("python", `
import pytest

@pytest.fixture
def ctx(request, worker_id, tmp_path):
    return {"worker_id": worker_id, "test_name": request.node.name, "tmp_dir": str(tmp_path)}

def namespace(ctx):
    return f"{ctx['worker_id']}-{ctx['test_name']}"

def courier_for(api, ctx):
    status, body = api.post("/couriers", {"name": f"QA Courier {namespace(ctx)}"})
    assert status == 201
    return body["id"]

def my_order_count(api, customer_id):
    return len(api.get(f"/orders?customer_id={customer_id}")[1])

def artifact_path(ctx, name):
    return f"{ctx['tmp_dir']}/{name}"`, "tests/helpers.py"),
        callout("info", "Something that must happen once per run",
            "If the suite really needs one shared thing (a seeded menu), create it in a CI step before pytest starts, or follow the pytest-xdist docs: the first worker creates it under a file lock in the shared temp directory and the others read its id from a file."),

        h2("Verify"),
        code("bash", `
pytest -n 4 -q -p randomly                 # random order and four workers
pytest -n 2 --dist each -q tests/test_courier.py tests/test_receipts.py   # the same tests twice at once
# 4 passed in 6.02s
pytest -n 4 -q --count=5                   # pytest-repeat: every test five times
# 315 passed in 4m12s`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**Global counts and \"the latest\" record.** `GET /orders` totals, \"the newest order\" or \"the last email in the inbox\" belong to whichever worker wrote last. Detect them by searching the suite for unfiltered list calls; filter by an id the test created.",
            "**Fixed names outside the process.** `/tmp/report.json`, port 8080 for a mock server, a queue called `qa-test`: anything named once in code collides across workers. Use `tmp_path`, port 0 (let the OS choose) and the namespace.",
            "**Running the suite serially to make it pass.** `-n 0` in CI hides the coupling until someone parallelizes again. Run `-n 4 --dist each` on the flaky files until they pass every time.",
        ]),

        challenge("chal_quiz_pat_171"),
        p("Now fix the helpers. The editor starts from `tests/helpers.py` with four helper bodies missing, each marked by a `# [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces are the old helpers on purpose. Run plays pytest-xdist with one, two, three and four workers whose requests interleave."),
        challenge("chal_coding_pat_172"),
    ],
});
