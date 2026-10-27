// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-qpr-2-2",
    title: "Throughput & error rate from a load test log",
    slug: { _type: "slug", current: "throughput-error-rate-from-load-test-log" },
    description:
        "A load test report said 341.8 requests per second and 0.41% errors, PASS. The same log, read again, showed 321 submissions per second actually accepted, 5% turned away by the rate limiter and a test script sending expired tokens. Learn to compute throughput and error rates from a raw load test log: which window, which timestamp, offered versus served throughput, and why 5xx, timeouts, 429 and other 4xx are four different signals that must be counted separately and per endpoint.",
    estimatedTime: 25,

    scenario: {
        role: "QA / performance engineer, CodeDev learning platform",
        problem:
            "After the open-model rehearsal (lesson 2.1) the report script printed \"POST /api/submissions: 341.8 req/s, error rate 0.41%, PASS\". The release manager signed off. In the next rehearsal with real learners, the Submit button showed \"Too many requests, please try again\" to about one learner in twenty, and the submit worker accepted fewer submissions per minute than the report promised. The raw log of the load test was still on the generator machine.",
    },

    content: [
        h2("1. The incident: two numbers that answered the wrong questions"),
        p("The report script was 15 lines long. Its core:"),
        code("python", `
rows = [r for r in read_log("run-2026-10-20.jsonl") if r["status"]]      # skip rows without a status
rows = [r for r in rows if WINDOW_START <= r["done_ms"] < WINDOW_END]   # steady state, 900 s
throughput = len(rows) / 900
error_rate = sum(1 for r in rows if r["status"] >= 500) / len(rows)`, "report.py (before)"),
        p("Each line looks reasonable. Together they answer a question nobody asked: how many responses arrived in the window, with the requests that never got a response thrown away and every status under 500 counted as fine. Read again with the steady-state window and every status class, the same log says:"),
        code("text", `
POST /api/submissions, steady-state window 10:05:00-10:20:00 (900 s), requests SENT in the window
 status              requests      share
 201 Created          289,350     93.90%
 429 Too Many Req.     15,120      4.91%
 401 Unauthorized       1,890      0.61%
 503 Unavailable        1,260      0.41%
 0 (no response)          540      0.18%
 total                308,160
offered throughput:  308,160 / 900 = 342.4 requests/s
served throughput:   289,350 / 900 = 321.5 submissions/s accepted
server error rate:   (1,260 + 540) / 308,160 = 0.58%`, "the same log, re-analysed"),
        p("Three things the report hid. The rate limiter turned away almost 5% of submissions: correct protective behaviour, but not capacity. 1,890 requests failed with 401 because 400 of the 5,000 test accounts had tokens that expired during the run: a broken test, not a broken API. And the 540 requests that got no response at all were silently dropped by `if r[\"status\"]`, because the generator logs status 0 for them."),

        h2("2. Read the evidence: what a load test log contains"),
        p("Every load tool can export one row per request. The fields differ by tool and version (k6 has CSV and JSON outputs, Locust has a CSV history, wrk2 prints aggregates; check current docs for the exact columns), but you need four things per request, and you should know which timestamp you have:"),
        code("json", `
{"sent_ms": 305012, "endpoint": "POST /api/submissions", "status": 201, "duration_ms": 412}
{"sent_ms": 305014, "endpoint": "GET /api/leaderboard",  "status": 200, "duration_ms": 37}
{"sent_ms": 305019, "endpoint": "POST /api/submissions", "status": 429, "duration_ms": 4}
{"sent_ms": 295871, "endpoint": "POST /api/submissions", "status": 0,   "duration_ms": 10000}`, "run-2026-10-20.jsonl, rows in completion order"),
        p("The last row was sent almost 10 s earlier than the rows around it: the log is written when a request completes, and that one waited for the 10 s client timeout. Whether a tool's timestamp is the send time or the completion time matters for every window you cut; if the docs are unclear, check a slow request: its timestamp minus its duration should land on the schedule."),

        h2("3. Core idea: a rate is a count, a window and a definition"),
        h3("The window"),
        p("Throughput is the number of requests in a window divided by the window's length. For a test with a profile, the window is the **steady state** (lesson 2.1): the ramps ran at lower rates by design, so including them measures the profile, not the system. Divide by the window's length, not by the time between the first and last row."),
        h3("Which timestamp decides the window"),
        p("Count a request in the window when it was **sent** inside it. In an open-model test the send time is the arrival: it is what the profile controls. Counting by completion time shifts slow requests into later windows: when the system slows down, completions fall behind arrivals, so a completion-time throughput looks smooth while a queue grows, and the requests that time out at the end of the window move into the ramp-down. Use completion times only for the question \"how fast did the system finish work\", and say so."),
        h3("Offered and served throughput"),
        bullets([
            "**Offered throughput** = all requests sent in the window / window seconds. It checks that the generator ran the profile (it should match the target rate).",
            "**Served throughput (goodput)** = successful requests / window seconds. This is the capacity number: on exam day, accepted submissions per second.",
        ]),
        p("Report both. When they diverge, the difference is made of rejected, failed and timed-out requests, and the next step is to say which."),
        h3("Four classes of \"not OK\""),
        bullets([
            "**5xx: the server failed.** 500, 502, 503, 504. Counted as errors.",
            "**No response (timeouts, connection errors): the server failed, invisibly.** Many tools log status 0. Counted as errors, and also counted separately: a growing number of timeouts is the clearest sign of a queue that never drains. Never drop these rows.",
            "**429: the system protected itself.** The rate limiter or load shedder refused work. Not a server failure, and not capacity either: count it separately as throttled. A 429 share that grows with the rate tells you where the limiter sits; whether that is acceptable is a product decision.",
            "**Other 4xx: the test is probably wrong.** 401 from expired tokens, 404 from deleted test data, 422 from a payload the API no longer accepts. Count them as client_errors and fix the test: these requests are rejected in microseconds and make both throughput and latency look better than they are.",
        ]),
        callout("info", "Tool defaults mix these classes",
            "k6's http_req_failed, by default, counts a request as failed when no response arrived or its status is outside 200-399, so 429 and 401 count as failures there; you can change the rule with a response callback (check current docs). That default is a sensible alarm, not a report: compute the four classes yourself before you write a conclusion."),
        h3("Per endpoint, then in total"),
        p("A total is a weighted average. The leaderboard served 120 cheap requests per second with no errors during the same test; mixed into a total, it dilutes the submit endpoint's 0.58% to about 0.4%. Compute every number per endpoint first; the total is for the generator check, not for the conclusion."),
        p("When **not** to report a single window: if the error rate or latency trends within the hold (rising minute by minute), the window total averages a trend away. Report the per-minute series next to it, as in the worked example below."),

        challenge("chal_quiz_qpr_221"),

        h2("4. Worked example: per-minute rates for one endpoint"),
        p("The window total answers \"did it pass\"; a per-minute series answers \"was it stable\". This script reads the JSON-lines log, keeps one endpoint, buckets requests by the minute they were **sent** in, and prints offered and served rates with the server error share:"),
        code("python", `
import json
from collections import defaultdict

def per_minute(path, endpoint, start_ms, end_ms):
    buckets = defaultdict(lambda: {"sent": 0, "ok": 0, "server_errors": 0, "throttled": 0})
    with open(path) as log:
        for line in log:
            row = json.loads(line)
            if row["endpoint"] != endpoint or not start_ms <= row["sent_ms"] < end_ms:
                continue
            b = buckets[(row["sent_ms"] - start_ms) // 60_000]
            b["sent"] += 1
            status = row["status"]
            if 200 <= status <= 399:
                b["ok"] += 1
            elif status == 429:
                b["throttled"] += 1
            elif status == 0 or status >= 500:
                b["server_errors"] += 1
    for minute in sorted(buckets):
        b = buckets[minute]
        print(f"min {minute:2d}  offered {b['sent'] / 60:6.1f}/s  served {b['ok'] / 60:6.1f}/s  "
              f"5xx+timeouts {b['server_errors'] / b['sent']:6.2%}  429 {b['throttled'] / b['sent']:6.2%}")

per_minute("run-2026-10-20.jsonl", "POST /api/submissions", 300_000, 1_200_000)`, "per_minute.py"),
        code("text", `
min  0  offered  342.3/s  served  328.9/s  5xx+timeouts  0.02%  429  3.86%
min  1  offered  342.5/s  served  328.6/s  5xx+timeouts  0.03%  429  4.02%
...
min 12  offered  342.4/s  served  315.2/s  5xx+timeouts  1.21%  429  5.73%
min 13  offered  342.4/s  served  311.0/s  5xx+timeouts  1.64%  429  6.11%
min 14  offered  342.5/s  served  309.8/s  5xx+timeouts  1.80%  429  6.32%`, "output (shortened)"),
        p("Offered stays on 342/s: the generator ran the profile. Served throughput falls and server errors rise through the hold: the system was not stable at this rate, which the 900-second total of 0.58% does not show. That trend is the input for the bottleneck lessons in module 3."),

        h2("5. How to verify the numbers"),
        numbered([
            "**Reconcile counts across systems.** Requests sent by the generator in the window, requests logged by the API gateway for the same window, and rows created in the submissions table must agree within the requests that failed before reaching each layer. A gap you cannot explain means a broken log or a dropped class.",
            "**Offered matches the profile.** Offered throughput in the hold should equal the target rate; if it is lower, the generator dropped iterations (lesson 2.1) and every other number is suspect.",
            "**Every row has a class.** The class counts must add up to the request count; a remainder means statuses you did not plan for.",
            "**Spot-check the timestamp.** For the slowest requests, sent time plus duration should equal the completion time in the tool's other output; that confirms which timestamp your window uses.",
            "**Fix the test before you report.** Any client error share above a handful of requests is a test defect: renew the tokens, reseed the data, rerun.",
        ]),
        p("The challenge implements the window summary: per endpoint and in total, offered and served throughput, error rate, timeouts, throttled and client errors, for the requests sent inside the steady-state window."),

        challenge("chal_coding_qpr_222"),

        h2("6. Common mistakes"),
        bullets([
            "**Dropping rows without a response.** Spot it: the row count of the analysis is lower than the generator's request count, and the error rate has no timeouts in it.",
            "**Counting 429 as served, or as a server error.** Spot it: served throughput above what the database recorded, or an alarm for \"errors\" that are the rate limiter doing its job.",
            "**Dividing by the whole run, or by first-to-last timestamp.** Spot it: offered throughput below the target rate of the hold, by roughly the share of time spent in the ramps.",
            "**Counting by completion time.** Spot it: the window's slowest requests or timeouts appear in the ramp-down, and the throughput series is smoother than the arrival schedule.",
            "**One total for all endpoints.** Spot it: a cheap read endpoint in the same test; compute the submit endpoint alone and compare.",
        ]),

        h2("7. Summary"),
        numbered([
            "Throughput is a count in the steady-state window divided by its length; count a request where it was sent, and report offered and served throughput side by side.",
            "5xx and timeouts are server failures, 429 is protection, other 4xx are usually a broken test: count each class separately, never drop rows without a response.",
            "Compute per endpoint first, look at the per-minute trend before trusting a window total, and reconcile counts with the API and the database.",
        ]),

        h2("Sources"),
        bullets([
            "Grafana k6 documentation: built-in metrics (http_reqs, http_req_failed, dropped_iterations), results output, setResponseCallback - https://grafana.com/docs/k6/latest/",
            "RFC 9110, HTTP Semantics: status code classes; RFC 6585: 429 Too Many Requests",
            "wrk2 README: measuring at a constant throughput - https://github.com/giltene/wrk2",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Export the raw per-request results of your last load test. Find out from the tool's docs and from one slow request whether its timestamp is the send or the completion time. Then compute, for the hold only and per endpoint: offered and served throughput, and the counts of 5xx, timeouts, 429 and other 4xx. Compare them with what the tool's summary and your last report said."),
    ],
});
