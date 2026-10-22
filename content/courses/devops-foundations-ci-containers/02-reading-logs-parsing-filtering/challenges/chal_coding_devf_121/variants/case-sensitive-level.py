r"""
Filter Rice Rocket's logfmt logs for the on-call: the entries that matter, in real time order.

Every log entry is one line in logfmt:
    2026-10-22T08:14:03Z level=error service=checkout msg="payment timeout" request_id=ab12

Requirements:
  - The first token (up to the first space) is the timestamp: ISO 8601 with whole seconds and
    a time zone ("Z" or an offset like "+07:00"). A timestamp that does not parse with
    datetime.fromisoformat, or has no time zone, makes the line unparsed.
  - After it come key=value pairs separated by spaces. A key is letters, digits, "_", "." or "-"
    (starting with a letter or "_"). A value is either unquoted (no spaces, no '"', may be empty)
    or double-quoted: it may contain spaces, and \" inside it is a quote, \\ a backslash.
    Anything else on the line (a word without "=", an unclosed quote) makes the line unparsed.
  - "level" is case-insensitive ("error", "Error", "ERROR"); "WARNING" means "WARN". The levels
    in order are DEBUG < INFO < WARN < ERROR < FATAL. A missing or unknown level makes the line
    unparsed.
  - A line that starts with a space or a tab is a continuation of the entry above it (a stack
    trace): it adds 1 to that entry's "extra_lines". If the line above was unparsed (or there is
    no line above), the continuation line is unparsed too. Empty lines are ignored.
  - Return:
      {"total": number of parsed entries,
       "unparsed": number of unparsed lines (continuation lines included),
       "by_level": {"INFO": 3, "ERROR": 1, ...} for every level that appears (all entries),
       "matches": [{"time": ..., "level": ..., "service": ..., "msg": ..., "extra_lines": n}, ...]}
    "matches" holds the entries whose level is min_level or higher, sorted by real time
    (oldest first; entries at the same instant keep their input order). "time" is the timestamp
    converted to UTC, written as "2026-10-22T08:14:03Z"; "level" is the normalized level;
    a missing service or msg is None.

Example: summarize(["2026-10-22T15:14:03+07:00 level=error service=checkout msg=\"payment timeout\"",
                    "  File \"pay.py\", line 8, in charge"], "WARN")
  -> {"total": 1, "unparsed": 0, "by_level": {"ERROR": 1},
      "matches": [{"time": "2026-10-22T08:14:03Z", "level": "ERROR", "service": "checkout",
                   "msg": "payment timeout", "extra_lines": 1}]}
"""
import json
import re
import sys
from datetime import datetime, timezone

LEVELS = ["DEBUG", "INFO", "WARN", "ERROR", "FATAL"]
PAIR = re.compile(r' +([A-Za-z_][\w.-]*)=("(?:[^"\\]|\\.)*"|[^\s"]*)(?= |$)')


def parse_line(line):
    """Return the entry as a dict, or None if the line is not valid logfmt."""
    stamp, _, rest = line.partition(" ")
    try:
        when = datetime.fromisoformat(stamp)
    except ValueError:
        return None
    if when.tzinfo is None:
        return None
    fields = {}
    rest = " " + rest if rest else ""
    pos = 0
    while pos < len(rest.rstrip()):
        match = PAIR.match(rest, pos)
        if match is None:
            return None
        key, value = match.groups()
        if value.startswith('"'):
            value = re.sub(r"\\(.)", r"\1", value[1:-1])
        fields[key] = value
        pos = match.end()
    level = fields.get("level", "")
    level = "WARN" if level == "WARNING" else level
    if level not in LEVELS:
        return None
    return {
        "time": when.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "level": level,
        "service": fields.get("service"),
        "msg": fields.get("msg"),
        "extra_lines": 0,
    }


def summarize(lines, min_level):
    entries = []
    unparsed = 0
    current = None
    for line in lines:
        if line == "":
            continue
        if line[0] in " \t":
            if current is None:
                unparsed += 1
            else:
                current["extra_lines"] += 1
            continue
        current = parse_line(line)
        if current is None:
            unparsed += 1
        else:
            entries.append(current)
    by_level = {level: n for level in LEVELS if (n := sum(e["level"] == level for e in entries))}
    threshold = LEVELS.index(min_level)
    matches = [e for e in entries if LEVELS.index(e["level"]) >= threshold]
    matches.sort(key=lambda e: e["time"])  # same format, all UTC: text order is time order; sort is stable
    return {"total": len(entries), "unparsed": unparsed, "by_level": by_level, "matches": matches}


# ---------------------------------------------------------------- test runner (do not change)
# Reads one test case (JSON: {"min_level": "WARN", "lines": [...]}) from stdin and prints the summary as JSON.
if __name__ == "__main__":
    case = json.load(sys.stdin)
    print(json.dumps(summarize(case["lines"], case["min_level"]), ensure_ascii=False))
