// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-pat-3-2",
    title: "Reports that point to the cause",
    slug: { _type: "slug", current: "api-testing-reports-root-cause" },
    description:
        "After a bad deploy Rice Rocket's CI listed 40 failures as `assert 500 == 201`, nobody could find the matching server logs, and one report leaked a refresh token. Learn to capture the HTTP exchange behind a failure, keep the server's request id, redact secrets, group failures by root cause and report flaky tests separately.",
    estimatedTime: 15,

    scenario: {
        role: "QA engineer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "The API suite runs on every deploy to staging. When it goes red, the on-call engineer gets a wall of assertion lines and spends the first half hour working out whether it is one bug or forty.",
    },

    content: [
        h2("Situation"),
        code("text", `
FAILED tests/test_courier.py::test_courier_accepts_order - assert 500 == 201
FAILED tests/test_courier.py::test_accept_twice_is_409 - assert 500 == 409
FAILED tests/test_courier.py::test_accept_after_cancel - assert 500 == 201
... 37 more ...
FAILED tests/test_auth.py::test_refresh_rotates_token - AssertionError: {'title': 'Refresh token reused',
  'access_token': 'at-91f2...', ...}
40 failed, 23 passed, 2 rerun in 4m02s`, "CI summary"),
        bullets([
            "Forty lines, one cause: a migration had not run, so every courier assignment hit `column courier_zone does not exist`.",
            "No line said which request failed or carried the server's request id, so nobody could open the matching log entry.",
            "The auth test printed the response body, with a live access token, into the CI log that is mirrored to Slack.",
        ]),

        h2("The core you need"),
        bullets([
            "**Capture the exchange, not just the assertion.** An httpx client accepts event hooks (`event_hooks={\"request\": [...], \"response\": [...]}`); a hook that stores the last request and response on the test lets the report show method, path, status and body for any failure.",
            "**Carry the request id.** If the API returns an `X-Request-Id` (or a trace id) on every response, the report should print it: it is the one value that finds the server's log lines and traces for that call.",
            "**Group by signature.** Replace ids in the path with a template (`/orders/{id}/accept`), and group failures by endpoint, status and error title. Forty failures with one signature are one bug.",
            "**Redact before anything is written.** Headers such as `Authorization`, `Cookie` and API keys, and JSON fields such as `password`, `token` or `otp`, are replaced before the record reaches a log, a JUnit file or a chat message.",
            "**Flaky is its own outcome.** With pytest-rerunfailures a test can fail and then pass. Report it as flaky, with its first failure, instead of counting it as passed or as a failure.",
            "**Hooks to attach it.** `pytest_runtest_makereport` (as a hook wrapper) sees each test's outcome; `record_property` adds fields to the JUnit XML that CI dashboards display.",
        ]),

        h2("Apply it in the project"),
        code("python", `
import httpx
import pytest
from tests.report import failure_record, summarize

@pytest.fixture
def api(request):
    def keep(response):
        response.read()
        request.node.last_exchange = {
            "method": response.request.method, "url": str(response.request.url.raw_path, "ascii"),
            "request_headers": dict(response.request.headers), "status": response.status_code,
            "response_headers": dict(response.headers), "response_body": response.text,
        }
    with httpx.Client(base_url=API_URL, event_hooks={"response": [keep]}) as client:
        yield client

@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item, call):
    outcome = yield
    report = outcome.get_result()
    if report.when == "call" and report.failed and hasattr(item, "last_exchange"):
        record = failure_record(item.nodeid, item.last_exchange)
        item.user_properties.append(("request_id", record["request_id"]))
        report.sections.append(("HTTP", f"{record['request']} -> {record['status']} {record['error']}\\n{record['excerpt']}"))`, "tests/conftest.py"),
        code("text", `
2 root causes, 40 failed tests, 2 flaky
  38 x POST /orders/{id}/accept -> 500 Courier assignment failed      request ids: req-7f3a01, req-7f3a19, ...
   2 x POST /payments/{id}/refund -> 502 HTTP 502                     request ids: req-55e010, req-55e044
flaky: tests/test_menu.py::test_menu_cache`, "report summary"),
        callout("info", "Redaction lives in one place",
            "Put the list of secret headers and keys in the report module and call it from every place that writes test output (the report, `repr` of the API wrapper, debug logging). A second, forgotten print statement is how tokens usually leak."),

        h2("Verify"),
        code("bash", `
pytest -q --reruns 2 --junitxml=reports/api.xml
python -m tests.report reports/api.xml        # prints the grouped summary
grep -c "Bearer [^[]" reports/api.xml         # 0: no unredacted token in the artifact`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**Grouping on the raw URL.** `/orders/5112/accept` and `/orders/5140/accept` look like two problems. Template the path (numbers and UUIDs to `{id}`) and drop the query string before grouping.",
            "**Redacting headers only.** Tokens also travel in response bodies (`access_token`, nested objects) and in plain-text error messages (`Bearer ...`). Test the redaction on a body that contains one.",
            "**Reruns that disappear.** A test that passed on its second attempt and is reported as passed is a bug you will meet again in production. Keep a flaky list and watch it shrink.",
        ]),

        p("Now build the report. The editor starts from `tests/report.py` with its key blocks missing, each marked by a `# [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces are wrong on purpose. Run feeds it the results of real-looking CI runs: one bug behind three failures, a leaked token, a flaky test and two causes at once."),
        challenge("chal_coding_pat_182"),
    ],
});
