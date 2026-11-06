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
    # [ ] Turn ids in the path into one template


def redact(headers, body):
    """Headers and body text with every secret replaced."""
    # [ ] Hide credentials in headers and in the body


def failure_record(test, exchange):
    """What a reader needs to start debugging one failed test."""
    headers, body = redact(exchange["request_headers"], exchange["response_body"])
    # [ ] Request, request id and error of a failure


def summarize(results):
    records, flaky = [], []
    for result in results:
        attempts = result["attempts"]
        # [ ] Tell flaky tests from failing ones
        records.append(failure_record(result["test"], attempts[-1]["exchange"]))
    # [ ] One group per root cause, biggest first
    return {"groups": group_list, "flaky": sorted(flaky), "records": records}


# ---------------------------------------------------------------- test runner (do not change)
if __name__ == "__main__":
    print(json.dumps(summarize(json.load(sys.stdin)["results"])))
