// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-pat-2-3",
    title: "Testing idempotency and retries",
    slug: { _type: "slug", current: "api-testing-idempotency-retries" },
    description:
        "Customers were charged twice when the courier app retried POST /orders after a timeout, although the API \"supported idempotency keys\" and its test sent each request once. Learn the Idempotency-Key contract and the four situations a test must create - replay, reused key, duplicate in flight, lost response - and write checks that catch each broken implementation.",
    estimatedTime: 15,

    scenario: {
        role: "QA engineer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "The mobile client sends an Idempotency-Key with every POST /orders and retries after a 10-second timeout. Support found 37 doubled orders in one rainy evening, every one of them after a timeout.",
    },

    content: [
        h2("Situation"),
        p("The only idempotency test the suite had, and what the logs showed for one doubled order:"),
        code("python", `
def test_order_accepts_idempotency_key(api):
    response = api.post("/orders", json=ORDER, headers={"Idempotency-Key": "abc"})
    assert response.status_code == 201`, "tests/test_orders.py"),
        code("text", `
18:42:07.120  POST /orders  key=8f1c...  201  order 51873   (response lost: client timeout at 10 s)
18:42:17.488  POST /orders  key=8f1c...  201  order 51874   (retry)
18:42:17.903  payment captured for order 51873
18:42:18.311  payment captured for order 51874`, "api log"),
        bullets([
            "The test sends the key once, so an API that ignores the header passes it.",
            "The API stored the key only after it had sent the response; the response was lost, so the retry looked new.",
        ]),

        h2("The core you need"),
        bullets([
            "**The contract.** Rice Rocket follows the IETF draft for the `Idempotency-Key` header (still a draft, widely used in the style of Stripe's API): the first request with a key is processed; a repeat with the same key and body gets the stored answer again; the same key with a different body is an error (422); a repeat while the first is still running gets 409; a request without a key on an endpoint that requires one gets 400.",
            "**A replay is the same answer, not just the same status.** Compare the body (the same order id) and look for the marker your API adds to replays (`Idempotent-Replayed: true` here). A status-only check passes on an API that creates a second order.",
            "**Count the side effect.** The real promise is \"one order, one charge\". After a retry, list the customer's orders and assert there is exactly one.",
            "**Create the failure modes on purpose.** A lost response (the server finished, the client timed out), two requests racing with one key, a key reused for another body: a test client that can drop a response or start a request without waiting for it makes them reproducible.",
            "**A test must fail on a broken implementation.** Before trusting a check, run it against a deliberately broken variant (no idempotency, key stored too late, no in-flight lock) and see it go red.",
        ]),

        h2("Apply it in the project"),
        code("python", `
import uuid

def test_retry_after_lost_response_creates_one_order(api, customer, restaurant):
    key = str(uuid.uuid4())
    body = {"customer_id": customer["id"], "restaurant_id": restaurant["id"], "items": [{"dish": "com-tam", "qty": 2}]}
    # Staging-only header: the server finishes the order, then waits 2 s before it answers.
    with pytest.raises(httpx.ReadTimeout):
        api.post("/orders", json=body, headers={"Idempotency-Key": key, "X-Test-Delay-Response-Ms": "2000"}, timeout=1.0)
    retry = api.post("/orders", json=body, headers={"Idempotency-Key": key})
    orders = api.get(f"/orders?customer_id={customer['id']}").json()
    assert retry.status_code == 201
    assert [o["id"] for o in orders] == [retry.json()["id"]]

def test_replay_returns_the_first_answer(api, customer, restaurant):
    key, body = str(uuid.uuid4()), {...}
    first = api.post("/orders", json=body, headers={"Idempotency-Key": key})
    again = api.post("/orders", json=body, headers={"Idempotency-Key": key})
    assert (again.status_code, again.json()) == (first.status_code, first.json())
    assert again.headers["Idempotent-Replayed"] == "true"`, "tests/test_idempotency.py"),
        callout("info", "Racing two requests",
            "On a real staging API, start the first request in a thread (or with `httpx.AsyncClient` and `asyncio.gather`) and send the duplicate right away; a test-only delay header on the order handler makes the window wide enough to hit every time."),

        h2("Verify"),
        code("bash", `
pytest -q tests/test_idempotency.py
# 5 passed in 3.41s
# against the build with the key stored after the response (the incident):
API_URL=https://pr-1412.staging.ricerocket.vn pytest -q tests/test_idempotency.py
# FAILED tests/test_idempotency.py::test_retry_after_lost_response_creates_one_order
#   AssertionError: assert [51873, 51874] == [51874]`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**One shared key for the whole suite.** A fixed key like `\"abc\"` replays the previous test's answer in the next run. Generate a key per test (`uuid4`).",
            "**Asserting the retry status only.** `201` after a retry is right for a correct API and for one that created a second order. Count orders, or compare the order id.",
            "**Expecting a replay for a different body.** Reusing a key with another body is a client bug the API should reject; a test that expects the old answer back hides that bug.",
        ]),

        p("Now write the checks. The editor starts from `tests/test_idempotency.py` with the five checks missing, each marked by a `# [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces check the wrong thing on purpose. Run plays your checks against a correct API and against APIs with one known defect each."),
        challenge("chal_coding_pat_162"),
    ],
});
