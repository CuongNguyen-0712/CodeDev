// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-pat-1-1",
    title: "Test cases from the contract",
    slug: { _type: "slug", current: "python-api-test-cases-from-contract" },
    description:
        "Rice Rocket's first API suite replayed 40 valid orders from a Postman collection and passed, while orders with quantity 0 and 230-character notes reached production. Learn to derive test cases from the OpenAPI contract - one case per rule, on both sides of every boundary - and run them with pytest and httpx.",
    estimatedTime: 15,

    scenario: {
        role: "QA engineer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "POST /orders has an OpenAPI contract with limits on quantity, note and payment method. The suite tested only orders that were already valid, so two broken validation rules went unnoticed for a week.",
    },

    content: [
        h2("Situation"),
        p("The suite was a Postman collection exported to pytest: 40 real orders, all valid, all passing. A week later the order table held this:"),
        code("text", `
order_id  restaurant_id  quantity  length(note)  payment_method
  91822             42         0             8   momo
  91906             17         3           230   cash
  92011              8         2            12   cod`, "orders (production)"),
        bullets([
            "`quantity: 0` was accepted although the contract says `minimum: 1`: the check was written as `quantity >= 0`.",
            "A 230-character note passed a `maxLength: 200` rule: the validator used a constant of 250 from an old screen.",
            "`cod` went through as a payment method although the enum lists only `cash`, `momo` and `card`: nothing checked the enum.",
        ]),

        h2("The core you need"),
        bullets([
            "**The contract is the source of the cases.** Every rule in the request schema (`required`, `type`, `minimum`, `maximum`, `minLength`, `maxLength`, `enum`) is a behaviour to test. A suite of valid requests tests one behaviour: valid input is accepted.",
            "**One case per rule, one change per case.** Start from one valid body (the schema's `example` values) and change a single property, so a failure points at exactly one rule.",
            "**Boundaries, not random values.** Off-by-one bugs only show next to a boundary: for `minimum: 1, maximum: 20` the cases are 0 and 1, 20 and 21. A value in the middle is accepted by correct and buggy code alike.",
            "**Both directions.** For each rule, the value just inside must be accepted (201) and the value just outside rejected (422 in Rice Rocket's contract). Testing only rejections misses a rule that rejects too much.",
            "**Names that explain the failure.** `pytest.param(body, 422, id=\"quantity-below-min\")` turns a failing run into a sentence about the contract.",
            "**Generators exist.** Tools such as Schemathesis generate cases from an OpenAPI document; knowing how to derive them by hand tells you what such a tool covers and what it cannot know (business rules outside the schema).",
        ]),

        h2("Apply it in the project"),
        p("The suite reads the schema from the API's own OpenAPI document and parametrizes one test with the derived cases:"),
        code("python", `
import httpx
import pytest
import yaml

from test_cases import derive_cases

SPEC = yaml.safe_load(open("openapi.yaml"))
ORDER_SCHEMA = SPEC["components"]["schemas"]["CreateOrder"]
CASES = derive_cases(ORDER_SCHEMA)


@pytest.fixture(scope="session")
def api():
    with httpx.Client(base_url="http://localhost:3000", timeout=5) as client:
        yield client


@pytest.mark.parametrize("case", CASES, ids=[c["id"] for c in CASES])
def test_create_order(api, case):
    response = api.post("/orders", json=case["body"])
    expected = 201 if case["expect"] == "accepted" else 422
    assert response.status_code == expected, response.text`, "tests/api/test_orders.py"),
        callout("info", "Where the valid example comes from",
            "Put `example` values on every property of the OpenAPI schema. They document the API for client developers and give the suite its valid starting body, so the two cannot drift apart."),

        h2("Verify"),
        code("bash", `
pytest tests/api/test_orders.py -q
# ....F.........F....F                                  [100%]
# FAILED tests/api/test_orders.py::test_create_order[quantity-below-min] - assert 201 == 422
# FAILED tests/api/test_orders.py::test_create_order[note-over-max-length] - assert 201 == 422
# FAILED tests/api/test_orders.py::test_create_order[payment_method-not-in-enum] - assert 201 == 422
# 3 failed, 17 passed in 1.84s`, "terminal"),
        p("The three failures name the three production incidents. Fix the validators, rerun, and the same cases keep them fixed."),

        h2("Pitfalls"),
        bullets([
            "**Changing two properties in one case.** A body with a bad quantity and a bad note is rejected even when one of the two checks is missing. Detect it by reviewing the cases: each id names exactly one property.",
            "**Expected values copied from the implementation.** If the expected status comes from running the API, the suite tests that the API does what it does. Expectations come from the contract; when the two disagree, one of them is a bug to discuss.",
            "**Schemas without `example`.** Without a valid starting body every case fails for the wrong reason (a missing required field). Make a missing `example` a failing lint on the OpenAPI document.",
        ]),

        challenge("chal_quiz_pat_111"),
        p("Now build the generator. The editor starts from `test_cases.py` with its rule blocks missing, each marked by a `# [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces test values far from the boundary on purpose. Run sends every case to the real validation rules and to builds that carry the bugs from production."),
        challenge("chal_coding_pat_112"),
    ],
});
