// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-pat-1-2",
    title: "Validating responses against a schema",
    slug: { _type: "slug", current: "python-api-response-schemas" },
    description:
        "The courier app crashed on two responses the suite called fine: a total sent as a string and a courier that was null. Learn to check every response against its schema - JSON types, nullability, required fields, nested arrays, enums and date-times - and report every problem with its path.",
    estimatedTime: 14,

    scenario: {
        role: "QA engineer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "GET /orders/{id} feeds the courier app. Tests checked the status code and the id only, so a serializer change that turned `total` into a string, and unassigned orders with `courier: null`, reached the app before any test noticed.",
    },

    content: [
        h2("Situation"),
        p("The test that had guarded GET /orders/{id} for a year:"),
        code("python", `
def test_get_order(api, order_id):
    response = api.get(f"/orders/{order_id}")
    assert response.status_code == 200
    assert response.json()["id"] == order_id`, "tests/api/test_orders.py"),
        p("Two crash reports from the courier app in the same week, both with that test green:"),
        code("text", `
TypeError: Cannot read properties of null (reading 'name')      at OrderCard (courier.name)
Invariant: expected number for total, got string "125000"      at formatVnd(total)`, "crash reports"),
        bullets([
            "A library upgrade on the api serialized integers stored as `NUMERIC` as strings.",
            "Unassigned orders had always returned `courier: null`; the app had only been tested with assigned ones.",
        ]),

        h2("The core you need"),
        bullets([
            "**The schema is the response contract.** The OpenAPI document already describes each response (types, required fields, enums, formats). Checking the whole body against it catches every field at once, including the ones no test asserted.",
            "**JSON types are not Python types.** `true` is a boolean in JSON, but Python's `bool` is a subclass of `int`, so `isinstance(True, int)` is true. An integer in JSON Schema is a number with no fractional part. Write the type check in JSON terms.",
            "**Absent is not null.** `required` means the key is present; `courier: null` is present. Nullability is a type: OpenAPI 3.1 writes it as `type: [\"object\", \"null\"]`.",
            "**Report every problem with a path.** `$.items[1].quantity: 0 is below the minimum 1` tells the developer where to look; stopping at the first problem hides the rest.",
            "**Strict where it protects you.** `additionalProperties: false` on an object such as `courier` catches a field that should never leave the server (a phone number). For most objects, tolerating extra fields keeps old clients working when the API grows.",
            "**In a real suite** a library does this: `jsonschema` (Draft 2020-12, the dialect of OpenAPI 3.1) or a Pydantic model with `TypeAdapter(...).validate_python(...)`. Writing the core yourself once shows what those libraries promise.",
        ]),

        h2("Apply it in the project"),
        p("The response schema comes from the OpenAPI document; every response test validates the whole body:"),
        code("python", `
import pytest
import yaml
from jsonschema import Draft202012Validator, FormatChecker

SPEC = yaml.safe_load(open("openapi.yaml"))
ORDER = SPEC["components"]["schemas"]["Order"]
validator = Draft202012Validator(ORDER, format_checker=FormatChecker())


def assert_matches_schema(body):
    problems = [f"$.{'.'.join(map(str, e.absolute_path))}: {e.message}" for e in validator.iter_errors(body)]
    assert not problems, "\\n".join(problems)


@pytest.mark.parametrize("order_id", [91822, 91906])   # one assigned, one unassigned
def test_get_order_matches_schema(api, order_id):
    response = api.get(f"/orders/{order_id}")
    assert response.status_code == 200
    assert_matches_schema(response.json())`, "tests/api/test_orders.py"),
        code("yaml", `
Order:
  type: object
  required: [id, status, total, items, courier, placed_at]
  properties:
    total: { type: integer, minimum: 0 }
    courier:
      type: [object, "null"]
      required: [id, name]
      additionalProperties: false
      properties:
        id: { type: integer }
        name: { type: string }
    placed_at: { type: string, format: date-time }`, "openapi.yaml (excerpt)"),
        callout("info", "Format checks are opt-in",
            "In jsonschema, `format: date-time` is only an annotation until you pass a `FormatChecker`, and some formats need extra packages. Without it, a time with no offset passes silently."),

        h2("Verify"),
        code("bash", `
pytest tests/api/test_orders.py -k schema -q
# F.                                                        [100%]
# AssertionError: $.total: '125000' is not of type 'integer'
# 1 failed, 1 passed in 0.62s`, "terminal"),
        p("Run it against both an assigned and an unassigned order: the schema has to accept `courier: null`, and the app has to handle it."),

        h2("Pitfalls"),
        bullets([
            "**Testing with one fixture order.** A single assigned order never shows the null branch. Pick fixtures that cover each nullable field and each enum value the app renders.",
            "**`isinstance(x, int)` for integers.** It accepts `true`. Check `bool` first, as JSON does.",
            "**Formats that are silently skipped.** Detect it by sending a known-bad date-time in a unit test of your checker; it must fail.",
        ]),

        p("Now write the checker. The editor starts from `schema_check.py` with its rule blocks missing, each marked by a `# [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces carry Python's usual type traps on purpose. Run checks real and broken order responses and compares every reported problem."),
        challenge("chal_coding_pat_122"),
    ],
});
