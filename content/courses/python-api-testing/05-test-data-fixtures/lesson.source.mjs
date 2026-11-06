// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-pat-2-2",
    title: "Test data: factories, fixtures and cleanup",
    slug: { _type: "slug", current: "api-testing-test-data-fixtures-cleanup" },
    description:
        "Rice Rocket's API suite passed in the usual order and failed in a random one, a CI job killed halfway blocked every later run, and staging filled up with orphaned QA customers. Learn how pytest fixtures set up and tear down, how to make test data unique per test and per run, and how to clean up in the order the API allows.",
    estimatedTime: 15,

    scenario: {
        role: "QA engineer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "The API tests run with pytest and httpx against the staging API. They share one QA customer and the demo restaurant, create orders without removing them, and a test that closes a restaurant breaks every test that runs after it.",
    },

    content: [
        h2("Situation"),
        p("The suite's `conftest.py` and one of its tests, as they were:"),
        code("python", `
import pytest

@pytest.fixture(scope="session")
def customer(api):
    status, body = api.post("/customers", {"email": "qa@ricerocket.test", "name": "QA"})
    return {"id": body["id"], "email": "qa@ricerocket.test"}

@pytest.fixture
def restaurant():
    return {"id": 1}          # the demo restaurant from the seed data

def test_closed_restaurant_rejects_orders(api, restaurant, customer):
    api.patch(f"/restaurants/{restaurant['id']}", {"open": False})
    status, _ = api.post("/orders", {"customer_id": customer["id"], "restaurant_id": restaurant["id"]})
    assert status == 409`, "tests/conftest.py"),
        code("text", `
$ pytest -q -p randomly --randomly-seed=1730851200
FAILED tests/test_orders.py::test_place_order - assert 409 == 201
FAILED tests/test_orders.py::test_reorder - assert 409 == 201
2 failed, 38 passed in 41.20s

# the next CI run, after the previous job was cancelled during setup
ERROR tests/test_orders.py::test_place_order - KeyError: 'id'   (POST /customers -> 409 email already used)

$ curl -s https://staging-api.ricerocket.vn/admin/stats | jq .qa_customers
12873`, "terminal"),
        bullets([
            "Random order: the closed-restaurant test ran first, closed the shared demo restaurant, and every later order got `409 restaurant is closed`.",
            "A cancelled job never deleted `qa@ricerocket.test`, so the next run could not create it again.",
            "Nothing deleted orders or customers, and the web team's demo restaurant stayed closed after the run.",
        ]),

        h2("The core you need"),
        bullets([
            "**A yield fixture is setup, `yield`, teardown.** pytest runs the code after `yield` when the test finishes, also when it fails. It does not run when the setup itself raised before `yield`, so create the object first and yield it before anything else can fail.",
            "**Teardown runs in reverse order.** A test that asks for `(restaurant, customer)` gets the restaurant set up first and torn down last. Write each teardown so it works in that order: delete the orders a customer placed before the customer, because the API refuses to delete a customer that still has orders.",
            "**Scope decides who shares the object.** `scope=\"function\"` (the default) gives every test its own; `session` shares one across the run. Share only what no test changes; anything a test modifies needs function scope.",
            "**Unique by test and by run.** Build identifiers from the CI run id (`GITHUB_RUN_ID`) and a counter, under a reserved domain (`.test` is reserved for testing by RFC 2606), so retries, parallel jobs and leftovers of a killed run never collide.",
            "**Own your data, never borrow seed data.** A test that needs a restaurant creates one. Seed data used for demos or by other teams is read-only for tests, or better, invisible to them.",
            "**Factories keep tests short.** A factory function (or a library such as factory_boy) fills in valid defaults so each test only states the fields it is about.",
        ]),

        h2("Apply it in the project"),
        code("python", `
import os
import itertools
import httpx
import pytest

RUN_ID = os.environ.get("GITHUB_RUN_ID", "local")
_seq = itertools.count(1)

@pytest.fixture(scope="session")
def api():
    with httpx.Client(base_url=os.environ["API_URL"], timeout=10) as client:
        yield StagingApi(client)          # thin wrapper returning (status, body)

@pytest.fixture
def customer(api):
    email = f"qa+{RUN_ID}-{next(_seq)}@ricerocket.test"
    status, body = api.post("/customers", {"email": email, "name": "QA Customer"})
    assert status == 201, f"POST /customers -> {status} {body}"
    created = {"id": body["id"], "email": email}
    try:
        yield created
    finally:
        for order in api.get(f"/orders?customer_id={created['id']}")[1]:
            api.delete(f"/orders/{order['id']}")
        api.delete(f"/customers/{created['id']}")`, "tests/conftest.py"),
        callout("info", "A janitor for what teardown cannot reach",
            "A CI job killed with SIGKILL runs no teardown at all. A nightly janitor that deletes `qa+*@ricerocket.test` customers older than a day catches those leftovers; the reserved domain makes sure it can never match a real customer."),

        h2("Verify"),
        code("bash", `
pip install pytest-randomly
pytest -q -p randomly                      # a new random order every run
pytest -q -p randomly --randomly-seed=1730851200   # replay the failing order
pytest -q --count=3 -x                     # pytest-repeat: run every test 3 times in a row
curl -s https://staging-api.ricerocket.vn/admin/stats | jq .qa_customers   # 0 after the run`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**Cleanup inside the test body.** `api.delete(...)` as the last line of a test never runs when an assertion above it fails. Detect it by running one failing test and checking staging; move the cleanup after `yield`.",
            "**Session scope for mutable data.** A session-scoped customer that one test renames or deactivates changes every later test. Detect it with a random order; keep anything a test changes at function scope.",
            "**A janitor matching too much.** Deleting \"every customer whose name starts with QA\" can hit real people. Match only the reserved test domain and the age, and log what it deletes.",
        ]),

        p("Now fix the fixtures. The editor starts from `tests/conftest.py` with its key blocks missing, each marked by a `# [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces are the old fixtures on purpose. Run plays the suite in several orders, with a failing test, with leftovers of a killed run and twice in a row, and counts what is left on staging."),
        challenge("chal_coding_pat_152"),
    ],
});
