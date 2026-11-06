"""
Rice Rocket's response assertions, used by every API test.

The old helper let three bugs through: a rule violation answered 400 instead of 422 ("both are
4xx"), a closed restaurant answered 200 with {"error": ...}, and error bodies in three different
shapes. `check_response(expected, response)` returns every failure as "<what>: <message>":

  expected  {"status": 422, "problem_type": "<uri>" | None, "pointers": ["/quantity", ...] | None}
  response  {"status": 422, "headers": {"Content-Type": "..."}, "body": <decoded JSON> | None}

  1. status: the exact code, else ["status: expected <e>, got <a>"] and nothing else is checked.
  2. a success (status < 400): a body object with an "error" key is
     "body: error body on a success status".
  3. an error (status >= 400) must be RFC 9457 problem details:
     - "content-type: expected application/problem+json, got <header or 'none'>" unless the media
       type (case-insensitive, parameters such as charset ignored) is application/problem+json
     - "body: missing <member>" for each of type, title, status that the body object lacks
     - "body.status: expected <e>, got <a>" when the body's status differs from the HTTP status
     - "body.type: expected <e>, got <a>" when problem_type is given and differs
     - "body.errors: expected <sorted pointers>, got <sorted pointers>" when pointers are given:
       the set of errors[].pointer must equal them, in any order
     - "retry-after: missing" for a 429 without a Retry-After header of whole seconds
Header names are case-insensitive.
"""
import json
import sys


def check_response(expected, response):
    headers = {k.lower(): v for k, v in (response.get("headers") or {}).items()}
    body = response.get("body")
    status = response["status"]
    # @piece status-exact: The status code the contract promises
    if status != expected["status"]:
        return [f"status: expected {expected['status']}, got {status}"]
    # @end
    failures = []
    # @piece success-error-body: No error hidden in a success response
    if status < 400:
        if isinstance(body, dict) and "error" in body:
            failures.append("body: error body on a success status")
        return failures
    # @end
    # @piece problem-content-type: Error bodies are application/problem+json
    media_type = headers.get("content-type", "").split(";")[0].strip().lower()
    if media_type != "application/problem+json":
        failures.append(f"content-type: expected application/problem+json, got {headers.get('content-type', 'none')}")
    # @end
    problem = body if isinstance(body, dict) else {}
    failures += [f"body: missing {member}" for member in ("type", "title", "status") if member not in problem]
    if "status" in problem and problem["status"] != status:
        failures.append(f"body.status: expected {status}, got {problem['status']}")
    if expected.get("problem_type") and problem.get("type") != expected["problem_type"]:
        failures.append(f"body.type: expected {expected['problem_type']}, got {problem.get('type')}")
    # @piece field-pointers: The fields the error names, in any order
    if expected.get("pointers") is not None:
        got = sorted(e.get("pointer") for e in problem.get("errors", []))
        if got != sorted(expected["pointers"]):
            failures.append(f"body.errors: expected {sorted(expected['pointers'])}, got {got}")
    # @end
    # @piece retry-after: A 429 says when to come back
    if status == 429 and not str(headers.get("retry-after", "")).isdigit():
        failures.append("retry-after: missing")
    # @end
    return failures


# ---------------------------------------------------------------- test runner (do not change)
# One test on stdin: {"<case name>": {"expected": {...}, "response": {...}}, ...}.
# Prints {"<case name>": [<failures>]}.
if __name__ == "__main__":
    cases = json.load(sys.stdin)
    try:
        print(json.dumps({name: check_response(c["expected"], c["response"]) for name, c in cases.items()}))
    except Exception as error:
        print(json.dumps({"error": f"{type(error).__name__}: {error}"}))
