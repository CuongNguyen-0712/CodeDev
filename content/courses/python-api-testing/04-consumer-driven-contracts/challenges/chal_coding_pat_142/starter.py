"""
Rice Rocket's provider verification for the courier app's contract (a small Pact-style verifier).

The order API renamed `eta_minutes` to `eta`; its own tests passed and the courier app broke. Now
the courier app publishes a pact: for each interaction, the request it sends and the parts of the
response it reads, written with matchers. Before deploying, the order API replays each request
and `verify(expected, actual)` compares the actual body with the pact:

  literal value          equal to the actual value ("$.status: expected <e>, got <a>", as JSON)
  {"$like": example}     same JSON type as the example ("$.x: expected <type>, got <type>");
                         when the example is an object, each of its keys is matched with $like too
  {"$regex": p, ...}     a string that fully matches p ("$.x: <value as JSON> does not match <p>")
  {"$eachLike": example, "min": n}
                         an array of at least n (default 1) elements, each matched with $like
                         against the example ("$.x: expected at least <n> elements, got <len>")
  object (plain map)     every key of the pact is present ("$.x.key: missing") and matches;
                         keys the consumer does not read are ignored
  array (plain list)     same length and element by element

JSON types: null, boolean, number (any int or float, never a bool), string, array, object.
Paths start at "$"; object keys add ".key", array elements "[i]".
"""
import json
import re
import sys


def json_type(value):
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, (int, float)):
        return "number"
    if isinstance(value, str):
        return "string"
    return "array" if isinstance(value, list) else "object"


def like(example, actual, path):
    if json_type(actual) != json_type(example):
        return [f"{path}: expected {json_type(example)}, got {json_type(actual)}"]
    if isinstance(example, dict):
        return verify({key: {"$like": value} for key, value in example.items()}, actual, path)
    return []


def verify(expected, actual, path="$"):
    # [ ] Same type as the example, not the same value
    # [ ] A string that fully matches the pattern
    # [ ] Enough elements, each like the example
    # [ ] Only the keys the consumer reads
    if isinstance(expected, list):
        if not isinstance(actual, list) or len(actual) != len(expected):
            return [f"{path}: expected an array of {len(expected)} elements"]
        problems = []
        for i, (e, a) in enumerate(zip(expected, actual)):
            problems += verify(e, a, f"{path}[{i}]")
        return problems
    # [ ] Exactly the value in the pact
    return []


# ---------------------------------------------------------------- test runner (do not change)
# One test on stdin: {"pact": {"interactions": [{"description", "response": {"status", "body"}}]},
#                     "actual": {"<description>": {"status": 200, "body": ...}}}.
# Prints {"<description>": "ok" | [<problems>], "can_deploy": <every interaction ok>}.
if __name__ == "__main__":
    test = json.load(sys.stdin)
    try:
        out = {}
        for interaction in test["pact"]["interactions"]:
            name = interaction["description"]
            want, got = interaction["response"], test["actual"][name]
            problems = [] if want["status"] == got["status"] else [f"status: expected {want['status']}, got {got['status']}"]
            if not problems and "body" in want:
                problems = verify(want["body"], got.get("body"))
            out[name] = problems or "ok"
        out["can_deploy"] = all(v == "ok" for v in out.values())
        print(json.dumps(out))
    except Exception as error:
        print(json.dumps({"error": f"{type(error).__name__}: {error}"}))
