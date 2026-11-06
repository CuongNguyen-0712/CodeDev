"""
Rice Rocket's API test-case generator.

The order API suite only tested the happy path, so `quantity: 0` and a 230-character note went to
production. This module turns the request body schema of an endpoint (a small OpenAPI subset)
into test cases, one per rule of the contract. Each case changes ONE property of the valid example:

  valid-example                     every property at its `example`              -> accepted
  missing-<name>                    a required property left out                 -> rejected
  <name>-wrong-type                 integer sent as its string form ("2"),
                                    string sent as the number 12345              -> rejected
  <name>-at-min / <name>-below-min  integer `minimum`, minimum - 1              -> accepted / rejected
  <name>-at-max / <name>-above-max  integer `maximum`, maximum + 1              -> accepted / rejected
  <name>-at-min-length / <name>-under-min-length
                                    "x" * minLength, "x" * (minLength - 1)
                                    (only when minLength > 0)                   -> accepted / rejected
  <name>-at-max-length / <name>-over-max-length
                                    "x" * maxLength, "x" * (maxLength + 1)      -> accepted / rejected
  <name>-is-<value>                 each `enum` value                            -> accepted
  <name>-not-in-enum                "not-a-<name>"                               -> rejected

Cases come property by property in schema order, each property in the order of the table.
"""
import json
import sys


def derive_cases(schema):
    props = schema.get("properties", {})
    required = schema.get("required", [])
    base = {name: spec["example"] for name, spec in props.items()}
    cases = [{"id": "valid-example", "body": base, "expect": "accepted"}]

    def case(case_id, name, value, expect):
        body = dict(base)
        body[name] = value
        cases.append({"id": case_id, "body": body, "expect": expect})

    for name, spec in props.items():
        kind = spec["type"]
        # [ ] A case for each required property left out
        # [ ] The example sent as the wrong JSON type
        # [ ] Both sides of an integer's minimum and maximum
        # [ ] Both sides of a string's length limits
        # [ ] Every allowed value, and one that is not allowed
    return cases


# ---------------------------------------------------------------- test runner (do not change)
# One test on stdin: {"schema": {...}, "bugs": {"<property>": "<bug>"}}. Every generated case is
# sent to two stand-ins of the endpoint: the real validation rules, and builds that each carry ONE
# of the listed bugs. Prints the case ids with their expected outcome, whether the real rules agree
# with every expectation, and which bugs at least one case catches.
def accepts(schema, body, bugs=None):
    bugs = bugs or {}
    for name in schema.get("required", []):
        if name not in body and bugs.get(name) != "not_required":
            return False
    for name, value in body.items():
        spec = schema["properties"].get(name)
        if spec is None:
            continue
        bug = bugs.get(name)
        if spec["type"] == "integer":
            if bug == "accepts_numeric_strings" and isinstance(value, str) and value.isdigit():
                value = int(value)
            if not isinstance(value, int) or isinstance(value, bool):
                return False
            low = spec.get("minimum")
            if low is not None and value < (low - 1 if bug == "min_off_by_one" else low):
                return False
            high = spec.get("maximum")
            if high is not None and value > (high + 1 if bug == "max_off_by_one" else high):
                return False
        elif spec["type"] == "string":
            if not isinstance(value, str):
                return False
            if len(value) < spec.get("minLength", 0):
                return False
            limit = spec.get("maxLength")
            if limit is not None and len(value) > (limit + 50 if bug == "max_length_plus_50" else limit):
                return False
            if "enum" in spec and value not in spec["enum"] and bug != "enum_unchecked":
                return False
    return True


if __name__ == "__main__":
    test = json.load(sys.stdin)
    schema, bugs = test["schema"], test.get("bugs", {})
    try:
        cases = derive_cases(schema)
        outcome = lambda ok: "accepted" if ok else "rejected"
        caught = {f"{name}:{bug}" for name, bug in bugs.items()
                  if any(outcome(accepts(schema, c["body"], {name: bug})) != c["expect"] for c in cases)}
        print(json.dumps({
            "cases": [[c["id"], c["expect"]] for c in cases],
            "real_rules_agree": all(outcome(accepts(schema, c["body"])) == c["expect"] for c in cases),
            "bugs_caught": sorted(caught),
        }))
    except Exception as error:
        print(json.dumps({"error": f"{type(error).__name__}: {error}"}))
