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
    # @piece json-type: The JSON type of a decoded Python value
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, int) or (isinstance(value, float) and value.is_integer()):
        return "integer"
    if isinstance(value, float):
        return "number"
    if isinstance(value, str):
        return "string"
    return "array" if isinstance(value, list) else "object"
    # @end


def validate(schema, value, path="$"):
    problems = []
    allowed = schema.get("type")
    allowed = allowed if isinstance(allowed, list) else [allowed] if allowed else []
    # @piece type-check: Stop at a value of the wrong type
    actual = json_type(value)
    if allowed and actual not in allowed and not (actual == "integer" and "number" in allowed):
        return [f"{path}: expected {' or '.join(allowed)}, got {actual}"]
    # @end
    if isinstance(value, dict):
        # @piece object-rules: Missing, nested and unexpected properties
        for name in schema.get("required", []):
            if name not in value:
                problems.append(f"{path}.{name}: missing")
        props = schema.get("properties", {})
        for name, sub in props.items():
            if name in value:
                problems += validate(sub, value[name], f"{path}.{name}")
        if schema.get("additionalProperties") is False:
            problems += [f"{path}.{name}: not allowed" for name in value if name not in props]
        # @end
    if isinstance(value, list) and "items" in schema:
        # @piece array-items: Every element of an array
        for i, item in enumerate(value):
            problems += validate(schema["items"], item, f"{path}[{i}]")
        # @end
    # @piece value-rules: Allowed values, minimum and date-time format
    if "enum" in schema and value not in schema["enum"]:
        problems.append(f"{path}: {json.dumps(value)} is not one of {json.dumps(schema['enum'])}")
    if "minimum" in schema and json_type(value) in ("integer", "number") and value < schema["minimum"]:
        problems.append(f"{path}: {value} is below the minimum {schema['minimum']}")
    if schema.get("format") == "date-time" and isinstance(value, str) and not DATE_TIME.match(value):
        problems.append(f"{path}: not a date-time with an offset")
    # @end
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
