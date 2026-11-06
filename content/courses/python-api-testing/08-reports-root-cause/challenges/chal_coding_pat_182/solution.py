"""
Failure report of Rice Rocket's API suite (tests/report.py), written by a pytest hook after the
run (with pytest-rerunfailures, a test can have several attempts).

Input (stdin): {"results": [{"test": "<node id>", "attempts": [attempt, ...]}, ...]} where an
attempt is {"outcome": "passed"} or {"outcome": "failed", "exchange": {...}}; an exchange is the
last HTTP call of the attempt as the httpx event hook recorded it: method, url (path and query),
request_headers, status, response_headers, response_body (text).

The report:
  records  one per FAILED test (its last attempt failed), in input order:
           {test, request: "<METHOD> <path without query>", endpoint: "<METHOD> <path template>",
            status, request_id (the X-Request-Id response header, or null), error (the problem
            details "title" of a JSON body, else "HTTP <status>"), excerpt (first 120 characters of
            the redacted response body), request_headers (redacted)}
  groups   failed tests grouped by signature "<endpoint> -> <status> <error>", most tests first
           (then by signature): {signature, count, tests (sorted), request_ids (sorted, no nulls)}
  flaky    tests that failed and then passed on a rerun (sorted); they are not failures
Path templates: every all-digit segment and every UUID segment becomes {id}.
Redaction: headers Authorization, Cookie and X-Api-Key (any case); in JSON bodies the values of
keys password, token, access_token, refresh_token, card_number and otp at any depth (re-serialized
compactly); in other bodies "Bearer <token>". The replacement is always "[REDACTED]".
"""
import json
import re
import sys

UUID = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
SECRET_HEADERS = {"authorization", "cookie", "x-api-key"}
SECRET_KEYS = {"password", "token", "access_token", "refresh_token", "card_number", "otp"}


def endpoint_template(path):
    """/orders/5112/accept?x=1 -> /orders/{id}/accept"""
    # @piece endpoint-template: Turn ids in the path into one template
    path = path.split("?", 1)[0]
    return "/".join("{id}" if s.isdigit() or UUID.match(s) else s for s in path.split("/"))
    # @end


def redact(headers, body):
    """Headers and body text with every secret replaced."""
    # @piece redact-secrets: Hide credentials in headers and in the body
    clean_headers = {k: "[REDACTED]" if k.lower() in SECRET_HEADERS else v for k, v in headers.items()}

    def scrub(value):
        if isinstance(value, dict):
            return {k: "[REDACTED]" if k in SECRET_KEYS else scrub(v) for k, v in value.items()}
        if isinstance(value, list):
            return [scrub(v) for v in value]
        return value

    try:
        clean_body = json.dumps(scrub(json.loads(body)), separators=(",", ":"))
    except ValueError:
        clean_body = re.sub(r"Bearer\s+\S+", "Bearer [REDACTED]", body)
    return clean_headers, clean_body
    # @end


def failure_record(test, exchange):
    """What a reader needs to start debugging one failed test."""
    headers, body = redact(exchange["request_headers"], exchange["response_body"])
    # @piece failure-record: Request, request id and error of a failure
    try:
        error = json.loads(exchange["response_body"]).get("title") or f"HTTP {exchange['status']}"
    except (ValueError, AttributeError):
        error = f"HTTP {exchange['status']}"
    response_headers = {k.lower(): v for k, v in exchange["response_headers"].items()}
    return {
        "test": test,
        "request": f"{exchange['method']} {exchange['url'].split('?', 1)[0]}",
        "endpoint": f"{exchange['method']} {endpoint_template(exchange['url'])}",
        "status": exchange["status"],
        "request_id": response_headers.get("x-request-id"),
        "error": error,
        "excerpt": body[:120],
        "request_headers": headers,
    }
    # @end


def summarize(results):
    records, flaky = [], []
    for result in results:
        attempts = result["attempts"]
        # @piece flaky-tests: Tell flaky tests from failing ones
        if attempts[-1]["outcome"] == "passed":
            if any(a["outcome"] == "failed" for a in attempts):
                flaky.append(result["test"])
            continue
        # @end
        records.append(failure_record(result["test"], attempts[-1]["exchange"]))
    # @piece group-failures: One group per root cause, biggest first
    groups = {}
    for r in records:
        groups.setdefault(f"{r['endpoint']} -> {r['status']} {r['error']}", []).append(r)
    ordered = sorted(groups.items(), key=lambda kv: (-len(kv[1]), kv[0]))
    group_list = [{
        "signature": signature,
        "count": len(rs),
        "tests": sorted(r["test"] for r in rs),
        "request_ids": sorted(r["request_id"] for r in rs if r["request_id"]),
    } for signature, rs in ordered]
    # @end
    return {"groups": group_list, "flaky": sorted(flaky), "records": records}


# ---------------------------------------------------------------- test runner (do not change)
if __name__ == "__main__":
    print(json.dumps(summarize(json.load(sys.stdin)["results"])))
