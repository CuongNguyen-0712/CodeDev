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


def parse_line(line):
    """Return the entry as a dict, or None if the line is not valid logfmt."""
    # TODO: timestamp (converted to UTC), key=value pairs with quoted values, normalized level.
    return None


def summarize(lines, min_level):
    # What the on-call did during the outage: grep ERROR.
    matches = [line for line in lines if "ERROR" in line]
    return {"total": len(lines), "unparsed": 0, "by_level": {}, "matches": matches}


# ---------------------------------------------------------------- test runner (do not change)
# Reads one test case (JSON: {"min_level": "WARN", "lines": [...]}) from stdin and prints the summary as JSON.
if __name__ == "__main__":
    case = json.load(sys.stdin)
    print(json.dumps(summarize(case["lines"], case["min_level"]), ensure_ascii=False))
