"""
Rice Rocket's response checker for the API suite.

The courier app crashed when GET /orders/{id} began sending `total` as the string "125000", and
again when `courier` came back null for an order nobody had picked up yet. The suite checked only
the status code and the id. `validate(schema, value)` checks a whole response against its schema
(a JSON Schema / OpenAPI 3.1 subset) and returns every problem as "<path>: <message>":

  type        "string" | "integer" | "number" | "boolean" | "object" | "array" | "null", or a list
              of them (["object", "null"] = nullable). JSON true / false is a boolean, never an
              integer. An integer is a number with no fractional part (2.0 counts, 2.5 does not);
              an integer is also a number.
              "<path>: expected <types joined by ' or '>, got <type>"
              A value of the wrong type gets no other check.
  required    "<path>.<name>: missing" for an absent property (a property that is present with
              the value null is NOT missing)
  properties  each present property is checked at "<path>.<name>"
  additionalProperties: false
              "<path>.<name>: not allowed" for a property not listed in `properties`
  items       each element is checked at "<path>[<i>]"
  enum        "<path>: <value as JSON> is not one of <enum as JSON>"
  minimum     "<path>: <value> is below the minimum <minimum>"
  format      "date-time": RFC 3339 with an offset (2026-11-06T11:30:00+07:00 or ...Z)
              "<path>: not a date-time with an offset"

Problems come in this order: type, required (in `required` order), properties (in schema order),
additionalProperties (in response order), items, enum, minimum, format.
"""
import json
import re
import sys

DATE_TIME = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$")


def json_type(value):
    # [ ] The JSON type of a decoded Python value


def validate(schema, value, path="$"):
    problems = []
    allowed = schema.get("type")
    allowed = allowed if isinstance(allowed, list) else [allowed] if allowed else []
    # [ ] Stop at a value of the wrong type
    if isinstance(value, dict):
        # [ ] Missing, nested and unexpected properties
    if isinstance(value, list) and "items" in schema:
        # [ ] Every element of an array
    # [ ] Allowed values, minimum and date-time format
    return problems


# ---------------------------------------------------------------- test runner (do not change)
# One test on stdin: {"schema": {...}, "responses": {"<name>": <decoded JSON body>}}.
# Prints {"<name>": [<problems>]} for every response.
if __name__ == "__main__":
    test = json.load(sys.stdin)
    try:
        print(json.dumps({name: validate(test["schema"], body) for name, body in test["responses"].items()}))
    except Exception as error:
        print(json.dumps({"error": f"{type(error).__name__}: {error}"}))
