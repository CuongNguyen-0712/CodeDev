// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-pyf-4-2",
    title: "dataclasses, type hints & a log-report CLI",
    slug: { _type: "slug", current: "python-dataclasses-type-hints-log-report-cli" },
    description:
        "At 2am during the 10.10 flash sale, the on-call log report crashed with KeyError: 'status' and printed nothing; the hotfix printed \"5xx errors: 0\" while checkout was failing. Learn to model records with @dataclass, what type hints do and do not check, how to parse log lines with timestamps, and finish the course with a small log-report command-line tool built with argparse.",
    estimatedTime: 24,

    scenario: {
        role: "Junior ops/data engineer at Lotus Mart, on call for the 10.10 flash sale",
        problem:
            "At 02:13 customers start reporting that checkout spins and fails. The on-call engineer runs the team's report.py on the app log. It reads the whole file and dies with KeyError: 'status' - a teammate had renamed the key to status_code in the parser last week. The 02:20 hotfix changes r[\"status\"] to r.get(\"stauts\", 0) so it \"cannot crash\", and the report now says 5xx errors: 0. The team spends 40 minutes blaming the payment gateway before someone reads the raw log.",
    },

    content: [
        h2("1. The incident: a report that printed nothing, then zero"),
        p("Lotus Mart's app writes one line per request to `app.log`: time, level, HTTP method, path, status code and duration. The on-call team has a small script, written months ago, that turns the log into a summary. Each line becomes a **dict** - a set of key/value pairs - and the report reads the keys it needs:"),
        code("text", `
2026-10-10T02:12:03+07:00 INFO POST /api/cart 200 140ms
2026-10-10T02:13:07+07:00 ERROR POST /api/checkout 504 1830ms
2026-10-10T02:13:09+07:00 ERROR POST /api/checkout 502 1200ms`, "app.log"),
        p("Last week a teammate renamed the `status` key to `status_code` in the parser, to match another export. Nothing failed: no test reads the report, and the script only runs when something is already on fire. On the night of the 10.10 flash sale it ran for the first time since the rename."),
        bullets([
            "**02:14** - `KeyError: 'status'`. The script had read the whole file first, so it printed no partial report: only a traceback.",
            "**02:20** - the \"hotfix\": `r.get(\"stauts\", 0)`. It cannot crash any more. It also has a typo, so every request reports status 0, and the summary says `5xx errors: 0` in the middle of an outage.",
        ]),
        p("Both versions fail for the same reason: a dict accepts **any** key, so nothing checks that the code that writes a record and the code that reads it agree on its shape."),

        h2("2. Reproduce it"),
        p("Save this as `repro.py` and run `python repro.py` (Python 3.14):"),
        code("python", `
lines = [
    "2026-10-10T02:12:03+07:00 INFO POST /api/cart 200 140ms",
    "2026-10-10T02:13:07+07:00 ERROR POST /api/checkout 504 1830ms",
    "2026-10-10T02:13:09+07:00 ERROR POST /api/checkout 502 1200ms",
]

def parse(line):
    time, level, method, path, status, duration = line.split()
    return {"time": time, "level": level, "path": path,
            "status_code": int(status), "ms": int(duration.removesuffix("ms"))}

records = [parse(line) for line in lines]

# v2, the 02:20 "hotfix": .get() never crashes...
errors = sum(1 for r in records if r.get("stauts", 0) >= 500)
print("5xx errors:", errors)          # 5xx errors: 0

# v1, the original report
errors = sum(1 for r in records if r["status"] >= 500)
# KeyError: 'status'`, "repro.py"),
        p("Two of the three requests are 5xx errors (status 500 or higher: the server failed). The `.get()` version says zero; the `[]` version crashes. Neither tells you the real problem: **the key you asked for does not exist, and the name you meant is right next to it**."),

        h2("3. Records as dicts: where the shape lives"),
        p("A **record** is one thing with named fields: an order, a customer, a log entry. Dicts are a quick way to hold one, and for JSON you just loaded (lesson 3.1) they are the natural first step. They become a problem once a record is passed between functions:"),
        bullets([
            "**The shape is written nowhere.** The keys exist only in the code that builds the dict. A reader has to find that code to know what `r` contains.",
            "**A wrong key fails late.** `r[\"status\"]` raises `KeyError` only on the line that reads it - in the report, at 2am - not where the record was built.",
            "**`.get()` with a default hides typos.** `.get()` is right when a key is **optional** (lesson 1.2). For a key that must exist, it turns a loud error into a silent wrong answer.",
            "**Renames are invisible.** No tool can tell you that `parse` writes `status_code` and `report` reads `status`, because both are just strings.",
        ]),
        p("The fix is to declare the shape once, as a class, and let Python and your editor check every use of it."),

        h2("4. @dataclass: a record type in six lines"),
        h3("What the decorator writes for you"),
        p("A **class** defines a new type of object. A **decorator** is a line starting with `@` above a function or class that changes it. `@dataclass` (from the standard `dataclasses` module) reads the fields you list - each written as `name: type` - and generates the boring methods: `__init__` (the constructor that stores the fields), `__repr__` (the readable text you see in `print`) and `__eq__` (what `==` does)."),
        code("python", `
from dataclasses import dataclass
from datetime import datetime

@dataclass
class LogEntry:
    time: datetime
    level: str
    method: str
    path: str
    status: int
    duration_ms: int

a = LogEntry(datetime.fromisoformat("2026-10-10T02:13:07+07:00"), "ERROR", "POST", "/api/checkout", 504, 1830)
b = LogEntry(datetime.fromisoformat("2026-10-10T02:13:07+07:00"), "ERROR", "POST", "/api/checkout", 504, 1830)
print(a.status, a.duration_ms)   # 504 1830
print(a == b, a is b)            # True False
print(a)
# LogEntry(time=datetime.datetime(2026, 10, 10, 2, 13, 7, tzinfo=datetime.timezone(datetime.timedelta(seconds=25200))), level='ERROR', method='POST', path='/api/checkout', status=504, duration_ms=1830)`),
        p("The generated `__eq__` compares the fields in order, so two entries with the same values are equal even though they are two objects (`is` checks identity, as in lesson 1.2). The `repr` lists every field by name, which makes debugging output readable for free."),
        h3("Wrong names fail at once, with a hint"),
        p("Fields are read as **attributes**: `entry.status`, not `entry[\"status\"]`. A misspelt attribute raises immediately, and the traceback suggests the name you probably meant:"),
        code("python", `
entry.stauts
# AttributeError: 'LogEntry' object has no attribute 'stauts'. Did you mean: 'status'?

LogEntry(time=t, level="INFO", method="GET", path="/", status_code=200, duration_ms=5)
# TypeError: LogEntry.__init__() got an unexpected keyword argument 'status_code'

LogEntry(t, "INFO", "GET", "/")
# TypeError: LogEntry.__init__() missing 2 required positional arguments: 'status' and 'duration_ms'`),
        p("Renaming a field now breaks every place that builds a record with the old name **the first time it runs**, with the bad name in the message. Your editor goes further: it knows the fields, so it autocompletes them and underlines the typo before you save."),
        h3("frozen=True and slots=True"),
        p("A plain dataclass lets you assign to any attribute - including one that does not exist, which silently creates it: `entry.stauts = 200` raises nothing and `entry.status` keeps its old value. Two options close that hole:"),
        code("python", `
@dataclass(frozen=True, slots=True)
class LogEntry:
    status: int
    duration_ms: int

e = LogEntry(504, 1830)
e.status = 200
# dataclasses.FrozenInstanceError: cannot assign to field 'status'

print(hash(e) == hash(LogEntry(504, 1830)), len({e, LogEntry(504, 1830)}))   # True 1

@dataclass(slots=True)          # slots alone: fields can change, new names cannot appear
class Sample:
    status: int

s = Sample(504)
s.stauts = 200
# AttributeError: 'Sample' object has no attribute 'stauts' and no __dict__ for setting new attributes. Did you mean: 'status'?`),
        bullets([
            "**`frozen=True`** makes instances read-only after `__init__`. A log entry is a fact about the past; nothing should edit it. Frozen dataclasses also get a `__hash__`, so equal entries can be set members or dict keys. To \"change\" one, build a new one with `dataclasses.replace(e, status=200)`.",
            "**`slots=True`** stores the fields in fixed slots instead of a per-object dict, so unknown attribute names are rejected and each instance uses less memory - useful when a log has millions of lines.",
        ]),
        h3("Defaults and default_factory"),
        p("Fields can have defaults, written like default parameter values. Fields with defaults must come after fields without them (`TypeError: non-default argument 'b' follows default argument 'a'`). A **mutable** default - a list, dict or set - would be shared by every instance, exactly the mutable default argument bug from lesson 2.1. Dataclasses refuse it when the class is defined:"),
        code("python", `
from dataclasses import dataclass, field

@dataclass
class Report:
    skipped: list[int] = []
# ValueError: mutable default <class 'list'> for field skipped is not allowed: use default_factory

@dataclass
class Report:
    skipped: list[int] = field(default_factory=list)   # list() is called for EACH new Report

a, b = Report(), Report()
a.skipped.append(8)
print(a, b)   # Report(skipped=[8]) Report(skipped=[])`),
        image("dict-vs-dataclass-record", {
            alt: "Diagram in three parts. Left, red panel 'Record as a dict': if r[\"status\"] >= 500 raises KeyError: 'status' after the whole file was read, so nothing is printed; if r.get(\"stauts\", 0) >= 500 raises nothing, gives 0 for every line, and the report says 5xx errors: 0 during the outage. Right, green panel 'Record as a dataclass' (frozen, slots): if entry.stauts >= 500 raises AttributeError with Did you mean: 'status'? at the first use, and mypy or pyright report it before the run; LogEntry(..., status=\"504\", ...) is still accepted because hints are not checked at runtime, so convert with int() where the text comes in. Bottom: the fixed script as a pipeline: app.log read with pathlib and encoding utf-8, parse_line returns a LogEntry or skips and counts the line, build_report counts with Counter and sorts the slowest requests, main() returns the exit code for raise SystemExit(main()): 0 ok, 1 skipped lines, 2 usage error.",
            caption: "A dict accepts any key, so typos and renames surface late or never. A dataclass declares the shape once; wrong names fail at the first use, and type checkers catch them earlier still.",
        }),

        h2("5. Type hints: documentation that tools can check"),
        h3("What they say"),
        p("`status: int`, `def parse_line(line: str) -> LogEntry:` and `level: str | None = None` are **type hints** (also called annotations): they say what type a field, parameter or return value should have. `list[int]` is a list of ints, `dict[str, int]` maps strings to ints, and `X | None` means \"an X, or None\". The dataclass decorator reads them to find the fields; people read them to know what a function takes and gives back."),
        h3("Python does not enforce them"),
        p("At runtime a hint is only a note. The generated `__init__` does not check or convert anything:"),
        code("python", `
bad = LogEntry(time="yesterday", level="info", method="GET", path="/", status="500", duration_ms="900")
print(bad)
# LogEntry(time='yesterday', level='info', method='GET', path='/', status='500', duration_ms='900')`),
        p("Every field holds a string, and Python stores them as they are. The mistake surfaces later, wherever some code finally uses the value - far from where it came in. Two habits prevent that: **convert at the boundary** (call `int()` and `datetime.fromisoformat()` in the one function that reads the text, so everything after it gets real types), and **run a type checker**."),
        h3("Type checkers: mypy and pyright"),
        p("A **type checker** is a separate tool that reads your code without running it and compares every use against the hints. mypy (`pip install mypy`, then `mypy logreport.py`) and pyright (the engine behind VS Code's Pylance extension) both report calls like `LogEntry(status=\"500\")`, misspelt attributes such as `entry.stauts`, and functions that can return `None` where the caller expects a value. In an editor you see the red underline as you type - long before 2am."),
        h3("New in Python 3.14: annotations are evaluated lazily"),
        p("Since Python 3.14 (PEP 649 and PEP 749), annotations are not evaluated when a function or class is defined; they are stored and evaluated only when something asks for them. The practical effect: a hint may name a class that is defined **later in the file**, without quotes:"),
        code("python", `
from dataclasses import dataclass, field

@dataclass
class Report:
    slowest: list[LogEntry] = field(default_factory=list)   # LogEntry is defined below

@dataclass
class LogEntry:
    status: int

print(Report())              # Report(slowest=[])`),
        p("Older code writes such forward references as strings (`list[\"LogEntry\"]`) or starts the file with `from __future__ import annotations`; in 3.14 neither is needed for this. A name that is never defined is still an error, but only when the annotations are read. The new `annotationlib` module can read them without failing:"),
        code("python", `
import annotationlib
from annotationlib import Format

def notify(message: ChatMessage) -> None:   # ChatMessage is not defined anywhere
    print(message)

print("defined")                                                   # defined
print(annotationlib.get_annotations(notify, format=Format.STRING))
# {'message': 'ChatMessage', 'return': 'None'}
notify.__annotations__
# NameError: name 'ChatMessage' is not defined`),
        p("`Format.VALUE` evaluates the hints (like `__annotations__`), `Format.FORWARDREF` replaces undefined names with markers, and `Format.STRING` returns them as text. Day to day you will not call `annotationlib` yourself; libraries such as `dataclasses` do."),
        challenge("chal_quiz_pyf_421", "Think about which methods @dataclass generates for you, what frozen=True adds, when a mutable default is rejected, and whether anything checks a type hint while the program runs."),

        h2("6. Parsing a log line into a LogEntry"),
        p("Everything from the course meets in one small function. Each step either produces a real type or raises `ValueError`, which the caller can catch (lesson 4.1):"),
        code("python", `
line = "2026-10-10T02:13:07+07:00 ERROR POST /api/checkout 504 1830ms"
line.split()          # any run of whitespace separates fields
# ['2026-10-10T02:13:07+07:00', 'ERROR', 'POST', '/api/checkout', '504', '1830ms']

time_text, level, method, path, status, duration = "2026-10-10T02:13:07+07:00 ERROR POST /api/checkout".split()
# ValueError: not enough values to unpack (expected 6, got 4)   <- check the count first

int("5xx")                          # ValueError: invalid literal for int() with base 10: '5xx'
"1830ms".removesuffix("ms")         # '1830'
"/api/orders?page=2".partition("?") # ('/api/orders', '?', 'page=2')
"/api/orders".partition("?")        # ('/api/orders', '', '')`),
        p("Check the number of fields before unpacking: `len(parts) != 6`, or a `match` statement with a six-name sequence pattern (lesson 2.2), which only matches when there are exactly six. `str.partition(sep)` always returns three parts - before, the separator, after - even when the separator is missing, so `target.partition(\"?\")[0]` is the path without its query string in both cases."),
        h3("Timestamps with a UTC offset"),
        p("`datetime.fromisoformat` reads ISO 8601 timestamps. The `+07:00` at the end is the **UTC offset** (Vietnam time is 7 hours ahead of UTC); a `Z` means UTC. A datetime with an offset is **aware**: it is one exact instant, and two aware datetimes compare correctly even with different offsets. Without an offset it is **naive**, and Python refuses to compare the two kinds:"),
        code("python", `
from datetime import datetime

hanoi = datetime.fromisoformat("2026-10-10T02:13:07+07:00")
utc = datetime.fromisoformat("2026-10-09T19:13:07Z")
print(hanoi == utc)                                         # True: the same instant
print("2026-10-10T02:13:07+07:00" < "2026-10-09T19:13:08Z") # False: strings compare letter by letter

naive = datetime.fromisoformat("2026-10-10 02:13:07")       # no offset: naive
hanoi < naive
# TypeError: can't compare offset-naive and offset-aware datetimes

datetime.fromisoformat("10/10/2026 02:13")
# ValueError: Invalid isoformat string: '10/10/2026 02:13'`),
        p("So keep times as `datetime` objects, never as strings, and reject (or explicitly convert) lines without an offset before they reach a sort."),

        h2("7. Aggregating into a report"),
        p("Once every line is a `LogEntry`, the report is plain collection work from lessons 1.2 and 3.2. `collections.Counter` counts things; `most_common()` returns `(item, count)` pairs, largest first. `sorted` with a tuple key gives a deterministic order: the minus sign sorts durations largest first, and the time breaks ties."),
        code("python", `
from collections import Counter

levels = Counter(e.level for e in entries)
print(levels.most_common())       # [('INFO', 3), ('ERROR', 3), ('WARNING', 1)]

errors_by_path = Counter(e.path for e in entries if e.status >= 500)
print(errors_by_path)             # Counter({'/api/checkout': 3})

slowest = sorted(entries, key=lambda e: (-e.duration_ms, e.time))[:3]
print([e.duration_ms for e in slowest])   # [1830, 1830, 1200]`),
        p("Because `duration_ms` is an `int`, `1200` sorts above `900`. If it were still the text from the log, `\"900\" > \"1200\"` would be `True` (strings compare character by character) and the \"slowest\" list would be wrong without any error."),
        p("Now build a different report yourself: the platform team wants the slowest **endpoints** on average, with their error counts, and the parser must survive any garbage line."),
        challenge("chal_coding_pyf_422", "Treat every field as untrusted text: check the shape of the line first, convert inside one try/except ValueError, and return None for anything that does not fit - including a timestamp without an offset. For the report, accumulate per-endpoint numbers in one pass, then sort with a tuple key so that ties have a fixed order."),

        h2("8. A command-line interface with argparse"),
        p("A **CLI** (command-line interface) lets anyone run the script with options instead of editing it: `python logreport.py app.log --level ERROR --top 3`. The standard `argparse` module parses `sys.argv` (the words after the script name), converts them, and writes `--help` for you."),
        code("python", `
parser = argparse.ArgumentParser(description="Summarise a Lotus Mart app log.")
parser.add_argument("path", type=Path, help="log file to read")
parser.add_argument("--level", choices=LEVELS, help="only count entries of this level")
parser.add_argument("--top", type=int, default=5, help="how many slow requests to show (default: 5)")
args = parser.parse_args(argv)     # args.path is a Path, args.top an int, args.level a str or None`),
        bullets([
            "**`path`** has no dashes, so it is a required **positional** argument. `type=Path` turns the text into a `pathlib.Path`.",
            "**`--level`** is optional (default `None`); `choices=` rejects anything else.",
            "**`--top`** uses `type=int`, so `args.top` is already a number - the same \"convert at the boundary\" rule as `parse_line`.",
        ]),
        code("bash", `
$ python logreport.py --help
usage: logreport.py [-h] [--level {DEBUG,INFO,WARNING,ERROR}] [--top TOP] path

Summarise a Lotus Mart app log.

positional arguments:
  path                  log file to read

options:
  -h, --help            show this help message and exit
  --level {DEBUG,INFO,WARNING,ERROR}
                        only count entries of this level
  --top TOP             how many slow requests to show (default: 5)

$ python logreport.py app.log --level error
usage: logreport.py [-h] [--level {DEBUG,INFO,WARNING,ERROR}] [--top TOP] path
logreport.py: error: argument --level: invalid choice: 'error' (choose from DEBUG, INFO, WARNING, ERROR)`),
        p("On a usage error argparse prints the message and exits with code 2. In Python 3.14 the help text is coloured when it goes to a terminal (`ArgumentParser(color=False)` turns that off), and `ArgumentParser(suggest_on_error=True)` adds a guess to bad choices: `invalid choice: 'EROR', maybe you meant 'ERROR'?`."),
        h3("main() returns an exit code"),
        p("Every program ends with an **exit code**: 0 means success, anything else means failure. Schedulers, CI jobs and shell scripts read it (`echo $?` in bash, `$LASTEXITCODE` in PowerShell). Put the program in a `main()` function that **returns** the code, and call it only when the file is run directly:"),
        code("python", `
def main(argv: list[str] | None = None) -> int:
    ...
    return 0

if __name__ == "__main__":
    raise SystemExit(main())`),
        bullets([
            "**`__name__`** is `\"__main__\"` when you run `python logreport.py`, and `\"logreport\"` when another file does `import logreport`. The `if` lets tests import `parse_line` without starting the CLI.",
            "**`raise SystemExit(main())`** exits with the returned number. `SystemExit(None)` means 0; `SystemExit(\"text\")` prints the text and exits with 1.",
            "**`argv=None`** makes `parse_args` read `sys.argv`; a test passes a list instead: `main([\"app.log\", \"--top\", \"1\"])`.",
        ]),
        callout("warning", "Always pass encoding=\"utf-8\" when you read the log",
            "Path.read_text() without an encoding uses the locale code page, which is cp1252 on many Windows machines. A UTF-8 line containing ?q=áo then reads back as ?q=Ã¡o, with no error. Pass encoding=\"utf-8\" every time (lesson 3.1)."),

        h2("9. The fix: logreport.py"),
        p("The whole script, using the course from top to bottom: f-strings and string methods (1.1), `Counter` and `sorted` keys (1.2, 3.2), small functions with keyword arguments (2.1), a `match` sequence pattern that both unpacks the six fields and rejects any other count (2.2), `pathlib` and an explicit encoding (3.1), `try` / `except ValueError` (4.1), and a frozen dataclass as the one shape every function agrees on."),
        code("python", `
"""Lotus Mart log report: python logreport.py app.log --level ERROR --top 3"""
import argparse
import sys
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

LEVELS = ("DEBUG", "INFO", "WARNING", "ERROR")


@dataclass(frozen=True, slots=True)
class LogEntry:
    time: datetime
    level: str
    method: str
    path: str
    status: int
    duration_ms: int


@dataclass(slots=True)
class Report:
    entries: int = 0
    skipped: list[int] = field(default_factory=list)       # line numbers we could not parse
    by_level: Counter[str] = field(default_factory=Counter)
    errors_by_path: Counter[str] = field(default_factory=Counter)
    slowest: list[LogEntry] = field(default_factory=list)


def parse_line(line: str) -> LogEntry:
    """Parse one log line; raise ValueError if it is not in the expected format."""
    match line.split():
        case [time_text, level, method, path, status_text, duration_text]:
            time = datetime.fromisoformat(time_text)
            if time.tzinfo is None:
                raise ValueError(f"timestamp without UTC offset: {time_text}")
            return LogEntry(
                time=time,
                level=level,
                method=method,
                path=path,
                status=int(status_text),
                duration_ms=int(duration_text.removesuffix("ms")),
            )
        case parts:
            raise ValueError(f"expected 6 fields, got {len(parts)}")


def build_report(lines: list[str], level: str | None, top: int) -> Report:
    report = Report()
    entries: list[LogEntry] = []
    for number, line in enumerate(lines, start=1):
        if not line.strip():
            continue
        try:
            entry = parse_line(line)
        except ValueError:
            report.skipped.append(number)
            continue
        if level is not None and entry.level != level:
            continue
        entries.append(entry)
        report.by_level[entry.level] += 1
        if entry.status >= 500:
            report.errors_by_path[entry.path] += 1
    report.entries = len(entries)
    report.slowest = sorted(entries, key=lambda e: (-e.duration_ms, e.time))[:top]
    return report


def print_report(report: Report) -> None:
    print(f"entries: {report.entries}, skipped lines: {len(report.skipped)} {report.skipped[:5]}")
    for level, count in report.by_level.most_common():
        print(f"  {level:<8}{count:>6}")
    print("5xx by path:")
    for path, count in report.errors_by_path.most_common():
        print(f"  {path:<20}{count:>6}")
    print("slowest:")
    for e in report.slowest:
        print(f"  {e.duration_ms:>6} ms  {e.status}  {e.method} {e.path}  {e.time:%H:%M:%S}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Summarise a Lotus Mart app log.")
    parser.add_argument("path", type=Path, help="log file to read")
    parser.add_argument("--level", choices=LEVELS, help="only count entries of this level")
    parser.add_argument("--top", type=int, default=5, help="how many slow requests to show (default: 5)")
    args = parser.parse_args(argv)

    try:
        text = args.path.read_text(encoding="utf-8")
    except OSError as err:
        print(f"error: cannot read {args.path}: {err.strerror}", file=sys.stderr)
        return 2

    report = build_report(text.splitlines(), args.level, args.top)
    print_report(report)
    return 1 if report.skipped else 0


if __name__ == "__main__":
    raise SystemExit(main())`, "logreport.py"),
        p("Run on the 10.10 log (seven requests, one stack-trace line and one line without an offset):"),
        code("bash", `
$ python logreport.py app.log --top 3
entries: 7, skipped lines: 2 [8, 9]
  INFO         3
  ERROR        3
  WARNING      1
5xx by path:
  /api/checkout            3
slowest:
    1830 ms  504  POST /api/checkout  02:13:07
    1830 ms  504  POST /api/checkout  02:13:15
    1200 ms  502  POST /api/checkout  02:13:09
$ echo $?
1`),
        numbered([
            "**One shape.** `LogEntry` is declared once. A renamed field breaks the first call that uses the old name, with the name in the error; a type checker flags it before the run.",
            "**Convert at the boundary.** `parse_line` is the only place that sees text. After it, `status` and `duration_ms` are ints and `time` is an aware datetime, so comparisons and sorts are correct.",
            "**Bad lines are counted, not fatal, and not hidden.** One garbage line no longer kills the report, and the skipped line numbers are printed so nobody trusts a report built from half the file.",
            "**Exit codes tell the scheduler.** 0 means a clean report, 1 means some lines were skipped, 2 means the command could not run (argparse usage errors and unreadable files).",
        ]),
        p("A few asserts make it a regression test you can run with `python check_logreport.py` (or under pytest):"),
        code("python", `
from datetime import datetime
from logreport import LogEntry, build_report, main, parse_line

entry = parse_line("2026-10-10T02:13:07+07:00 ERROR POST /api/checkout 504 1830ms")
assert entry == LogEntry(datetime.fromisoformat("2026-10-09T19:13:07Z"), "ERROR", "POST", "/api/checkout", 504, 1830)

report = build_report(["2026-10-10T02:13:07+07:00 ERROR POST /api/checkout 504 1830ms",
                       "2026-10-10T02:13:08+07:00 INFO GET /api/orders 200 64ms",
                       "payment-gateway: connection reset by peer"], level=None, top=1)
assert report.skipped == [3]
assert report.errors_by_path == {"/api/checkout": 1}
assert [e.duration_ms for e in report.slowest] == [1830]

assert main(["does-not-exist.log"]) == 2
print("all checks passed")`, "check_logreport.py"),
        p("The first assert also shows aware datetimes at work: the entry written in Hà Nội time equals one built from the same instant in UTC."),

        h2("10. Pitfalls"),
        bullets([
            "**`.get()` on a required key.** It turns a typo into `None` or a default that looks like real data. Use `.get()` only for keys that are allowed to be missing.",
            "**Believing hints are checks.** `LogEntry(status=\"500\")` runs fine. Convert in the parser and run mypy or pyright; hints alone change nothing at runtime.",
            "**Mutable defaults in a dataclass.** `= []` is rejected with `ValueError ... use default_factory`; write `field(default_factory=list)`.",
            "**Typo assignment on a plain dataclass.** `entry.stauts = 200` silently adds an attribute. `slots=True` or `frozen=True` turn it into an error.",
            "**Naive and aware datetimes in one list.** Sorting them raises `TypeError: can't compare offset-naive and offset-aware datetimes`. Reject or convert lines without an offset in the parser.",
            "**Numbers kept as text.** `\"900\" > \"1200\"` is `True`. Convert durations and status codes with `int()` before you sort or compare.",
            "**Ending with `sys.exit()` scattered everywhere, or no exit code at all.** Return an int from `main()` and exit once, with `raise SystemExit(main())`.",
        ]),

        h2("11. Checklist"),
        bullets([
            "A record passed between functions is a `@dataclass`, usually `frozen=True, slots=True`, not a dict.",
            "Mutable field defaults use `field(default_factory=...)`.",
            "Text from files and arguments is converted once, at the boundary (`int()`, `datetime.fromisoformat()`, argparse `type=`); hints describe the result and a type checker verifies them.",
            "Timestamps stay `datetime` objects with a UTC offset; strings are never sorted as times.",
            "Bad input lines are skipped **and counted**, never silently dropped and never allowed to crash the whole run.",
            "The script has `main(argv=None) -> int`, an argparse `--help`, explicit `encoding=\"utf-8\"`, and `if __name__ == \"__main__\": raise SystemExit(main())`.",
            "A small test imports the functions and calls `main([...])` with arguments, without touching the real command line.",
        ]),
        callout("tip", "Where to go from here",
            "You can now turn a messy chore into a script that other people can run: read files safely, clean and group data, fail loudly in the right places, and report with a clear exit code. Next steps that build on this course: pytest for proper test suites, the logging module instead of print for long-running jobs, and a type checker in your editor from day one."),
    ],
});
