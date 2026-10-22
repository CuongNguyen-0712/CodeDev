// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-devf-1-2",
    title: "Reading logs: parsing & filtering",
    slug: { _type: "slug", current: "devops-reading-logs-parsing-filtering" },
    description:
        "During a checkout outage, grep ERROR on Rice Rocket's logs found nothing: the services wrote level=error in lowercase, the real cause was a multi-line traceback that grep showed out of context, and one service logged in local time while the others used UTC. Learn where logs go (stdout, stderr, docker logs, journalctl), how to search them with grep, tail and less, why structured logs (logfmt, JSON lines) with levels, request ids and UTC timestamps make an outage readable, and how to log that way from Python.",
    estimatedTime: 21,

    scenario: {
        role: "Junior DevOps engineer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "At 15:14 on a Thursday, checkout started failing for about a third of the orders. The on-call ran docker logs checkout | grep ERROR and got nothing, so they looked elsewhere. Twenty minutes later someone ran grep -i error and found a payment timeout, but its stack trace was missing from the output. Then the dispatch logs seemed to show a Redis failure seven hours after the outage, because dispatch logs in local time (+07:00) and checkout logs in UTC. The outage lasted 48 minutes; the cause was visible in the logs from the first minute.",
    },

    content: [
        h2("1. The incident"),
        p("Rice Rocket's services write one log line per event in **logfmt** - `key=value` pairs after a timestamp. When checkout started failing, the on-call did what most of us do first:"),
        code("bash", `
$ docker logs checkout | grep ERROR
$ echo $?
1`),
        p("No output, and grep's exit code 1 means \"no match\". The logs were not empty - grep was just asking the wrong question. Three separate problems hid the cause:"),
        bullets([
            "**Case.** The services log `level=error`, in lowercase. `grep` is case-sensitive, so `ERROR` matched nothing.",
            "**Lines out of context.** The real error was a payment timeout with a Python traceback below it - six lines, only the first of which has a level. `grep -i error` printed the first line and the `TimeoutError` line, but not the frames in between that said *which* call timed out.",
            "**Two clocks.** Checkout runs in a container and logs in UTC (`08:14:03Z`). Dispatch runs on an older VM and logs local time (`15:14:01+07:00`). Read side by side, dispatch's Redis errors seemed to happen seven hours later, so nobody connected them.",
        ]),

        h2("2. Reproduce it"),
        p("Save these lines as `checkout.log`. They are a shortened copy of that afternoon's logs:"),
        code("text", `
2026-10-22T08:13:58Z level=info service=api msg="GET /orders/8812 200" request_id=r-7a1
2026-10-22T08:14:01Z level=warn service=checkout msg="payment provider slow" latency_ms=2950 request_id=r-7a2
2026-10-22T08:14:03Z level=error service=checkout msg="payment timeout" request_id=r-7a2
  Traceback (most recent call last):
    File "/app/checkout/pay.py", line 41, in charge
      resp = client.post(url, json=body, timeout=3)
  TimeoutError: timed out
2026-10-22T08:14:04Z level=info service=api msg="GET /health 200"`, "checkout.log"),
        code("bash", `
$ grep ERROR checkout.log            # nothing: the level is lowercase
$ grep -i error checkout.log
2026-10-22T08:14:03Z level=error service=checkout msg="payment timeout" request_id=r-7a2
  TimeoutError: timed out`),
        p("Two lines, and the middle of the traceback - the file, the line number and the call that timed out - is gone. grep works **line by line**: it has no idea that the indented lines belong to the entry above them."),

        h2("3. Where logs go"),
        p("Before you can search logs you have to find them. On a modern server there are three usual places:"),
        bullets([
            "**stdout and stderr of a container.** The twelve-factor rule for containers is: write logs to standard output, and let the platform collect them. Docker stores what the container writes; `docker logs` reads it back. Kubernetes does the same with `kubectl logs`.",
            "**The systemd journal.** A service started by systemd on a Linux VM (like Rice Rocket's dispatch) writes to the journal, read with `journalctl`.",
            "**Plain files** under `/var/log` or the application's own folder - read with `tail`, `less` and `grep`.",
        ]),
        code("bash", `
# containers: the last 200 lines, then keep following
docker logs --tail 200 -f checkout
# only the last 30 minutes, with Docker's own UTC timestamp on every line
docker logs --since 30m --timestamps checkout
# the same for every service of a Compose project
docker compose logs -f --tail 50 checkout dispatch

# a systemd service: since 15:00 today, errors and worse (syslog priority), times in UTC
journalctl -u dispatch.service --since "15:00" -p err --utc
journalctl -u dispatch.service -f

# a log file that is rotated at night: -F keeps following the new file
tail -F /var/log/nginx/error.log`),
        h3("stdout and stderr are two streams"),
        p("Every process has two output streams: **stdout** (file descriptor 1) for normal output and **stderr** (2) for errors and diagnostics. Docker keeps them apart, and `docker logs` writes the container's stderr to *its own* stderr. That matters as soon as you add a pipe, because `|` only connects stdout:"),
        code("bash", `
docker logs checkout | grep -i error          # searches stdout only
docker logs checkout 2>&1 | grep -i error     # 2>&1: send stderr into stdout first`),
        p("Python's `logging` writes to **stderr** by default, so the first command can miss every log line of a Python service. When a search finds suspiciously little, check the stream before you check the pattern."),

        h2("4. Searching with grep, tail and less"),
        p("`grep` is still the fastest tool on a single server. Learn these options and you can answer most questions in one line:"),
        bullets([
            "**`-i`** ignore case: `grep -i 'level=error'` matches `error`, `ERROR` and `Error`.",
            "**`-c`** count matching lines instead of printing them: how many timeouts in the last hour?",
            "**`-A 5` / `-B 2` / `-C 3`** print 5 lines **after**, 2 **before**, or 3 on both sides of each match. This is how you keep a traceback with its log line.",
            "**`-v`** invert: print the lines that do *not* match. `grep -v 'GET /health'` removes the health-check noise.",
            "**`-E`** extended regular expressions: `grep -E 'level=(error|fatal)'`.",
            "**`-F`** fixed string: no regex at all, so a request id like `r-7a2` or a dot in an IP address means exactly itself.",
        ]),
        code("bash", `
$ grep -i -A 4 'level=error' checkout.log
2026-10-22T08:14:03Z level=error service=checkout msg="payment timeout" request_id=r-7a2
  Traceback (most recent call last):
    File "/app/checkout/pay.py", line 41, in charge
      resp = client.post(url, json=body, timeout=3)
  TimeoutError: timed out

$ grep -c 'msg="payment timeout"' checkout.log
1
$ grep -F 'request_id=r-7a2' checkout.log      # everything that happened to one request
2026-10-22T08:14:01Z level=warn service=checkout msg="payment provider slow" latency_ms=2950 request_id=r-7a2
2026-10-22T08:14:03Z level=error service=checkout msg="payment timeout" request_id=r-7a2`),
        p("The last search is why services log a **request id**: one id, generated when the request enters the system and passed to every service it touches, turns a pile of unrelated lines into the story of one order."),
        p("For reading rather than searching, use `less`: it opens files of any size instantly. Inside it, `/timeout` searches forward, `n` jumps to the next match, `G` goes to the end, and `F` follows new lines like `tail -f` (Ctrl+C stops following). `less -S` stops long lines from wrapping."),
        callout("tip", "Pipe less carefully",
            "docker logs checkout 2>&1 | less works, but less only sees what was written so far. For a live view, use docker logs -f, or press F inside less to follow."),

        h2("5. Structured logs: logfmt and JSON lines"),
        p("A log line written for humans - `Payment for order 55120 timed out after 3s!` - is easy to read and hard to search: every message has its own shape. A **structured** log line has the same fields every time, so tools can filter on them. Two formats are common:"),
        code("text", `
# logfmt: a timestamp, then key=value pairs; values with spaces are double-quoted
2026-10-22T08:14:03Z level=error service=checkout msg="payment timeout" request_id=r-7a2 order=55120

# JSON lines: one JSON object per line
{"time": "2026-10-22T08:14:03Z", "level": "error", "service": "checkout", "msg": "payment timeout", "request_id": "r-7a2", "order": 55120}`),
        image("logfmt-anatomy", {
            alt: "Anatomy of a logfmt log entry. The line 2026-10-22T08:14:03Z level=error service=checkout msg=\"payment timeout\" request_id=r-7a2 is split into labelled parts: the timestamp in UTC with a Z, level, service, a double-quoted msg that may contain spaces, and request_id which links lines of the same request. Below it, four indented lines of a Python traceback are marked as continuation lines that belong to the entry above. A red box shows grep ERROR matching nothing and grep -i error showing only two of the five lines; a green box shows a parser that reads the fields, compares levels in the order DEBUG, INFO, WARN, ERROR, FATAL, keeps the four continuation lines with their entry and converts every time to UTC.",
            caption: "A log entry is fields plus, sometimes, indented continuation lines. A parser keeps them together; grep sees only separate lines.",
        }),
        h3("Levels have an order"),
        p("Every entry has a **level** that says how serious it is. The usual order, from least to most serious:"),
        numbered([
            "**DEBUG** - details for developers, usually switched off in production.",
            "**INFO** - normal events: a request served, a job finished.",
            "**WARN** (or WARNING) - something unusual that the program handled: a slow provider, a retry.",
            "**ERROR** - an operation failed: this order could not be paid.",
            "**FATAL** (Python calls it CRITICAL) - the program cannot continue and will exit.",
        ]),
        p("\"Show me WARN and worse\" is a comparison in **this** order, not in alphabetical order - alphabetically, `WARN` comes after `ERROR` and `FATAL` before `INFO`. Map each level to its position (Python's `logging` uses numbers: DEBUG 10, INFO 20, WARNING 30, ERROR 40, CRITICAL 50) and compare the numbers."),
        h3("Searching JSON lines"),
        p("JSON lines are easy to filter with `jq` (install it first; it is not part of most base images):"),
        code("bash", `
docker logs checkout 2>&1 | jq -c 'select(.level == "error" and .service == "checkout")'
docker logs checkout 2>&1 | jq -r 'select(.request_id == "r-7a2") | .msg'`),
        p("At scale, a log platform (Loki, Elasticsearch, CloudWatch Logs) does the same with its own query language - but the fields are only searchable if the service wrote them as fields in the first place."),

        h2("6. One clock: UTC and ISO 8601"),
        p("A timeline is only a timeline if every line uses the same clock. Two rules avoid the \"seven hours later\" confusion:"),
        bullets([
            "**Log in UTC**, everywhere: servers, containers, applications. Convert to local time only when you display it to a person.",
            "**Write timestamps in ISO 8601 with the zone**: `2026-10-22T08:14:03Z` (`Z` means UTC) or `2026-10-22T15:14:03+07:00`. A timestamp without a zone, like `2026-10-22 15:14:03`, cannot be compared with anything safely.",
        ]),
        p("Python's `datetime` reads these timestamps directly and converts them:"),
        code("python", `
from datetime import datetime, timezone

checkout = datetime.fromisoformat("2026-10-22T08:14:03Z")
dispatch = datetime.fromisoformat("2026-10-22T15:14:01+07:00")

print(dispatch.astimezone(timezone.utc).isoformat())   # 2026-10-22T08:14:01+00:00
print(dispatch < checkout)                             # True: dispatch failed 2 s BEFORE checkout
print(datetime.fromisoformat("2026-10-22 15:14:01").tzinfo)   # None: no zone, cannot be compared safely`),
        p("Converted to UTC, the dispatch Redis error happened two seconds **before** the checkout timeout - the real cause of the outage. Comparing an aware datetime (with a zone) and a naive one (without) raises `TypeError: can't compare offset-naive and offset-aware datetimes`, which is Python telling you the same thing."),

        h2("7. Logging from Python the readable way"),
        p("Rice Rocket's fix was to give every Python service the same small formatter: UTC timestamps, lowercase levels in logfmt, quoted messages, and tracebacks **indented** under their entry so tools can tell they belong together:"),
        code("python", String.raw`
import logging
import sys
import time


class LogfmtFormatter(logging.Formatter):
    converter = time.gmtime                      # format record times in UTC

    def __init__(self, service):
        super().__init__()
        self.service = service

    def format(self, record):
        msg = record.getMessage().replace("\\", "\\\\").replace('"', '\\"')
        line = (f'{self.formatTime(record, "%Y-%m-%dT%H:%M:%SZ")} '
                f'level={record.levelname.lower()} service={self.service} msg="{msg}"')
        if record.exc_info:                      # log.exception(...) adds the traceback
            trace = self.formatException(record.exc_info)
            line += "\n" + "\n".join("  " + part for part in trace.splitlines())
        return line


handler = logging.StreamHandler(sys.stdout)      # stdout: collected by docker logs
handler.setFormatter(LogfmtFormatter("checkout"))
log = logging.getLogger("checkout")
log.addHandler(handler)
log.setLevel(logging.INFO)

try:
    raise TimeoutError("timed out")
except TimeoutError:
    log.exception("payment timeout")             # level=error, with the traceback indented`, "logsetup.py"),
        bullets([
            "**`converter = time.gmtime`** makes `formatTime` use UTC instead of the server's local zone.",
            "**`log.exception(...)`** inside an `except` block logs at ERROR level and attaches the traceback; never log only `str(err)` - the type and the location are lost.",
            "**Escape quotes and backslashes** in the message, or a message containing `\"` breaks every parser downstream.",
            "**Never log secrets.** A full `DATABASE_URL`, a payment token or a password in a log line is a leak: logs are copied to many places and kept for months.",
        ]),
        callout("info", "Even better: a single line per event",
            "Indented continuation lines keep a traceback readable for people and line-based tools. Many teams go one step further and log JSON lines with the traceback inside one field (for example \"exc\"), so every event is exactly one line. Both are fine; mixing styles inside one service is not."),

        h2("8. Your turn"),
        p("Write the tool the on-call needed that afternoon: read logfmt lines, keep each traceback with its entry, normalize the levels, filter by a minimum level, and put every match back in real time order in UTC - whatever clock the service used."),
        challenge("chal_coding_devf_121", "Split the line once at the first space: the left part goes to datetime.fromisoformat. For the pairs, one regular expression with two alternatives for the value (a double-quoted string with \\\" escapes, or a run of characters without spaces and quotes) does most of the work. Keep the levels in a list and compare their positions; remember the last parsed entry so an indented line can add to its extra_lines."),

        h2("9. Pitfalls"),
        bullets([
            "**Case-sensitive searches**: `grep ERROR` misses `level=error`. Use `-i`, or better, search the field.",
            "**Searching only stdout**: `docker logs svc | grep` ignores stderr, where Python's `logging` writes by default. Add `2>&1`.",
            "**Losing context**: a matched line without its traceback tells you *that* something failed, not *where*. Use `-A`/`-B`, or a parser that keeps continuation lines.",
            "**Comparing levels as text**: alphabetically `WARN` > `ERROR`. Compare positions in DEBUG < INFO < WARN < ERROR < FATAL.",
            "**Splitting logfmt on spaces**: `msg=\"payment timeout\"` contains a space. Respect the quotes.",
            "**Mixed clocks**: local time in one service and UTC in another make a timeline lie. Log UTC with an explicit zone.",
            "**Secrets in logs**: they stay there long after the incident.",
        ]),

        h2("10. Checklist"),
        bullets([
            "You know where each service's logs are: `docker logs`, `journalctl -u`, or a file you can `tail -F`.",
            "Your first searches use `-i`, `-A`/`-B`, `-c`, `-v` and `-F` where they fit, and `2>&1` before a pipe.",
            "Services write structured logs (logfmt or JSON lines) with time, level, service, msg and a request id.",
            "Every timestamp is ISO 8601 in UTC with its zone.",
            "Tracebacks stay attached to their entry (indented, or inside one JSON field).",
            "Level filters compare levels by severity, never as strings.",
            "No secrets in any log line.",
        ]),
    ],
});
