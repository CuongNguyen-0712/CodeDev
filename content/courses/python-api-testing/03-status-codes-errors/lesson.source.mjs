// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-pat-1-3",
    title: "Status codes, error bodies and edge cases",
    slug: { _type: "slug", current: "python-api-status-codes-errors" },
    description:
        "Rice Rocket's tests accepted any 4xx and never looked at error bodies, so a 400 where clients expected 422 and a 200 carrying an error reached the courier app. Learn which status codes clients depend on, RFC 9457 problem details, and the edge cases every endpoint needs a test for.",
    estimatedTime: 15,

    scenario: {
        role: "QA engineer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "The courier app shows field errors next to inputs for a 422, signs the user out on a 401 and retries on a 429. The suite asserted `status < 500`, so three answers that broke those client behaviours went unnoticed.",
    },

    content: [
        h2("Situation"),
        p("Three responses from one release, all passing the suite:"),
        code("text", `
POST /orders {"quantity": 0}           -> 400 {"message": "invalid"}                 (contract: 422 + field errors)
POST /orders  restaurant 17 is closed  -> 200 {"error": "restaurant closed"}         (contract: 409)
GET  /admin/payouts  as a courier      -> 401                                        (contract: 403)`, "api log"),
        bullets([
            "The app showed a generic \"something went wrong\" instead of marking the quantity field.",
            "The app said \"order placed\" for an order that did not exist.",
            "Couriers who tapped the payouts link were signed out.",
        ]),

        h2("The core you need"),
        bullets([
            "**Clients branch on the status code first.** 2xx means it worked, whatever the body says. Assert the exact code the contract names, never a class (`400 <= s < 500`).",
            "**The 4xx codes that matter.** 400 malformed request (bad JSON), 401 not authenticated (log in again), 403 authenticated but not allowed, 404 no such resource, 409 conflicts with the current state (restaurant closed, order already paid), 415 wrong content type, 422 well-formed but breaks a rule (if your contract uses it), 429 too many requests with `Retry-After`.",
            "**Problem details (RFC 9457).** Errors share one shape with media type `application/problem+json`: `type` (a URI naming the problem), `title`, `status` (equal to the HTTP status), optional `detail`, `instance` and extension members such as `errors: [{pointer, detail}]`. Clients and tests key on `type` and the pointers, not on the English text.",
            "**Compare media types, not header strings.** `application/problem+json; charset=utf-8` is the same media type; split off the parameters and compare case-insensitively.",
            "**Edge cases every endpoint gets.** An empty body, invalid JSON, the wrong `Content-Type`, an unknown id, a duplicate submission, and a body over the size limit. Each has a code in the contract and a test.",
        ]),

        h2("Apply it in the project"),
        p("One helper checks every response against what the case expects, and the tests stay one line each:"),
        code("python", `
import pytest
from assertions import check_response

VALIDATION = "https://api.ricerocket.vn/problems/validation"


def as_dict(response):
    body = response.json() if response.content else None
    return {"status": response.status_code, "headers": dict(response.headers), "body": body}


@pytest.mark.parametrize("body, expected", [
    pytest.param({**ORDER, "quantity": 0}, {"status": 422, "problem_type": VALIDATION, "pointers": ["/quantity"]}, id="quantity-below-min"),
    pytest.param({**ORDER, "restaurant_id": 17}, {"status": 409, "problem_type": "https://api.ricerocket.vn/problems/restaurant-closed", "pointers": None}, id="restaurant-closed"),
])
def test_create_order_errors(api, body, expected):
    failures = check_response(expected, as_dict(api.post("/orders", json=body)))
    assert not failures, failures


def test_invalid_json_is_400(api):
    response = api.post("/orders", content=b'{"quantity": 2,', headers={"Content-Type": "application/json"})
    assert check_response({"status": 400, "problem_type": None, "pointers": None}, as_dict(response)) == []`, "tests/api/test_order_errors.py"),
        callout("info", "httpx headers",
            "`response.headers` is already case-insensitive in httpx; converting to a plain dict loses that, which is why the helper lower-cases the names itself."),

        h2("Verify"),
        code("bash", `
pytest tests/api/test_order_errors.py -q
# F.F                                                       [100%]
# FAILED ...::test_create_order_errors[quantity-below-min] - ['status: expected 422, got 400']
# FAILED ...::test_invalid_json_is_400 - ['content-type: expected application/problem+json, got application/json', 'body: missing type', ...]
# 2 failed, 1 passed in 0.71s`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**Asserting on the error message.** `assert body[\"detail\"] == \"quantity must be at least 1\"` breaks when someone fixes a typo or translates it. Assert `type`, `status` and the pointers.",
            "**Testing errors only through the happy client.** The real app sends well-formed JSON, so nobody notices that invalid JSON returns a 500 HTML page. Send raw bytes in a test, as above.",
            "**Order-sensitive field errors.** The API may report several fields in any order; compare the pointers as a set.",
        ]),

        challenge("chal_quiz_pat_131"),
        p("Now fix the helper. The editor starts from `assertions.py` with its checks missing, each marked by a `# [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces are the old helper's checks, which passed broken responses or failed correct ones. Run feeds the helper real and broken responses from the order API."),
        challenge("chal_coding_pat_132"),
    ],
});
