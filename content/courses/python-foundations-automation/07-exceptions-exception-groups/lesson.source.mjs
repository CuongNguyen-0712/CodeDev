// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-pyf-4-1",
    title: "Exceptions & exception groups (except*)",
    slug: { _type: "slug", current: "python-exceptions-exception-groups-except-star" },
    description:
        "Lotus Mart's nightly price update reported \"Updated 0 prices - OK\" because a bare except: pass swallowed a NameError on every row, and once it did fail, ops fixed the sheet one bad row per run for an hour. Learn to read a traceback, catch only the exceptions you expect, keep the original error with raise ... from, write your own exception classes, and report every bad row at once with ExceptionGroup and except* - plus the two exception changes in Python 3.14.",
    estimatedTime: 22,

    scenario: {
        role: "Junior ops/data person at Lotus Mart, a small online shop in Vietnam",
        problem:
            "Every night at 01:00 a script reads the supplier's price sheet and updates the shop catalog. Last Tuesday someone renamed a helper function, the call site kept the old name, and the script still printed \"Updated 0 prices - OK\": a bare except: pass around each row swallowed the NameError 500 times. The shop sold at old prices all morning. After the typo was fixed, a sheet with five bad rows stopped the job at the first one; ops fixed that row, re-ran, hit the next one, and repeated that for an hour.",
    },

    content: [
        h2("1. The incident"),
        p("The price update is a short loop. Someone wrapped each row in `try`/`except` so that \"one bad row cannot break the whole job\":"),
        code("python", `
def parse_vnd(text):          # renamed from parse_price last week
    return int(text)


updated = 0
for row in rows:              # rows come from the supplier's price sheet
    try:
        catalog[row["sku"]] = parse_price(row["price"])   # still the old name
        updated += 1
    except:
        pass                  # skip rows we cannot read

print(f"Updated {updated} prices - OK")`, "update_prices.py"),
        p("Three things went wrong, and only the first one is the typo:"),
        bullets([
            "**The bug was swallowed.** `parse_price` no longer exists, so every row raised `NameError`. A bare `except:` catches *everything*, `pass` throws it away, and the loop moves on. 500 rows, 500 swallowed errors, 0 prices updated.",
            "**The job said it succeeded.** The script ended normally, printed \"OK\" and exited with code 0. The scheduler only pages someone when a job fails, so nobody looked until customers asked why the prices were old.",
            "**The fixed job reported one problem per run.** After the typo was fixed, a row with the price `45,000` raised an error and stopped the run. Ops fixed that row and re-ran - and hit row 87, then row 311, then two more. Five bad rows cost five runs and an hour.",
        ]),

        h2("2. Reproduce it"),
        p("Save this as `repro.py` and run `python repro.py` (Python 3.14):"),
        code("python", `
def parse_vnd(text):
    return int(text)


rows = [
    {"sku": "TEA-01", "price": "45000"},
    {"sku": "COF-02", "price": "52000"},
    {"sku": "MUG-07", "price": "89000"},
]
catalog = {}
updated = 0
for row in rows:
    try:
        catalog[row["sku"]] = parse_price(row["price"])
        updated += 1
    except:
        pass
print(f"Updated {updated} prices - OK")

# Output:
# Updated 0 prices - OK`, "repro.py"),
        p("Now delete the `try:`, `except:` and `pass` lines (and un-indent the two lines in between). Python finally gets to tell you what is wrong:"),
        code("text", `
Traceback (most recent call last):
  File "C:\\lotus\\repro.py", line 13, in <module>
    catalog[row["sku"]] = parse_price(row["price"])
                          ^^^^^^^^^^^
NameError: name 'parse_price' is not defined`),
        p("One run, one line, the exact cause. The `try`/`except` was supposed to make the job safer, and instead it hid a bug that a beginner could fix in ten seconds."),

        h2("3. Read a traceback from the bottom up"),
        p("An **exception** is Python's way of saying \"I cannot continue here\". When nobody handles it, Python prints a **traceback** and stops the program with exit code 1. A traceback lists the function calls that were running, **most recent call last** - so the most useful line is at the bottom:"),
        code("text", `
Traceback (most recent call last):
  File "C:\\lotus\\load.py", line 7, in <module>
    load([{"sku": "TEA-01", "price": "45000"}, {"sku": "COF-02", "price": "45,000"}])
    ~~~~^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "C:\\lotus\\load.py", line 5, in load
    return [parse_price(r["price"]) for r in rows]
            ~~~~~~~~~~~^^^^^^^^^^^^
  File "C:\\lotus\\load.py", line 2, in parse_price
    return int(text)
ValueError: invalid literal for int() with base 10: '45,000'`),
        numbered([
            "**Last line: what happened.** The exception type (`ValueError`) and its message. Here: `int()` cannot read `'45,000'` because of the comma.",
            "**The frame just above it: where it happened.** File, line number and the line of code - `return int(text)` in `parse_price`.",
            "**Going up: how you got there.** `parse_price` was called by `load` (line 5), which was called from the top of the script (line 7). The `~~~^^^` marks point at the part of the line that was running.",
        ]),
        p("Read it in that order - bottom line, then where, then how - and most errors explain themselves."),
        h3("The built-in exceptions you will meet first"),
        p("Every message below is copied from Python 3.14:"),
        bullets([
            "**`ValueError`**: right type, wrong value. `int(\"abc\")` gives `ValueError: invalid literal for int() with base 10: 'abc'`.",
            "**`KeyError`**: a dict has no such key. `{\"sku\": \"TEA-01\"}[\"price\"]` gives `KeyError: 'price'`.",
            "**`TypeError`**: the operation does not work for this type. `\"Total: \" + 5` gives `TypeError: can only concatenate str (not \"int\") to str`.",
            "**`FileNotFoundError`**: `open(\"missing.csv\")` gives `FileNotFoundError: [Errno 2] No such file or directory: 'missing.csv'`.",
            "**`ZeroDivisionError`**: `45000 // 0` gives `ZeroDivisionError: division by zero`.",
            "**`NameError`**: a name that does not exist - usually a typo or a rename, like in the incident.",
        ]),

        h2("4. try, except, else, finally"),
        p("A `try` statement has up to four parts. Python runs them in a fixed order:"),
        code("python", `
def read_price(text):
    try:
        price = int(text)               # 1. the code that might fail
    except ValueError as err:
        print("except:", err)           # 2. runs only if a ValueError happened
    else:
        print("else: parsed", price)    # 3. runs only if NO exception happened
    finally:
        print("finally: always")        # 4. runs in every case, last


read_price("45000")
# else: parsed 45000
# finally: always

read_price("45,000")
# except: invalid literal for int() with base 10: '45,000'
# finally: always`),
        bullets([
            "**`except SomeError as err`** handles one kind of exception and gives you the exception object in `err`. You can list several types in parentheses: `except (ValueError, KeyError) as err:`.",
            "**`else`** is for the code that should run only when the `try` part worked. Keep the `try` part small - only the line that can fail - and put the rest in `else`, so you do not accidentally catch errors from it.",
            "**`finally`** is for cleanup that must happen whatever happened: closing a file, a connection, releasing a lock. If the exception was not handled, it continues after `finally` runs.",
        ]),
        h3("Catch the narrowest exception you expect"),
        p("Ask: *which error do I expect here, and what will I do about it?* If a price can be badly typed, you expect `ValueError` from `int()` - catch exactly that. Everything you did not expect (a typo, a missing file, a bug) should crash loudly, because you have no good plan for it."),
        h3("Never except: and never except Exception: pass"),
        p("A bare `except:` catches **everything** - even the exceptions Python uses to stop a program. `KeyboardInterrupt` (you pressed Ctrl+C) and `SystemExit` (the program called `sys.exit()`) both inherit directly from `BaseException`, not from `Exception`:"),
        code("python", `
import sys

try:
    sys.exit(1)
except:
    print("bare except caught SystemExit")      # the program does NOT exit

try:
    raise KeyboardInterrupt                     # what Ctrl+C raises
except:
    print("bare except caught KeyboardInterrupt")

try:
    try:
        sys.exit(1)
    except Exception:
        print("never printed")
except SystemExit:
    print("except Exception let SystemExit through")

# Output:
# bare except caught SystemExit
# bare except caught KeyboardInterrupt
# except Exception let SystemExit through`),
        p("So `except Exception:` is less bad than a bare `except:` - Ctrl+C still works - but `except Exception: pass` still swallows `NameError`, `TypeError` and every other bug in your own code. That is exactly what happened in the incident."),
        callout("warning", "A swallowed error is not a handled error",
            "Handling an error means doing something useful: retrying, using a real fallback, or reporting it. pass does none of these. If you ever really must ignore an error, catch the one specific type you expect and write a comment that says why it is safe to ignore."),
        h3("with: cleanup without finally"),
        p("Most cleanup in Python is done by a `with` block. `with open(...) as f:` closes the file when the block ends - normally *or* because of an exception - so you do not need your own `finally`:"),
        code("python", `
try:
    with open("prices.csv", encoding="utf-8") as f:
        header = f.readline()
        raise ValueError("bad row")       # something fails while the file is open
except ValueError as err:
    print("caught:", err, "| file closed:", f.closed)

# Output:
# caught: bad row | file closed: True`),

        h2("5. Your own exceptions, with the original as cause"),
        p("Built-in exceptions say *what* failed in Python's words. Your script knows more: which row, which SKU, which file. A **custom exception class** carries that. It is a class that inherits from `Exception`, often with one or two extra fields:"),
        code("python", `
class StockError(Exception):
    """A bad line in the warehouse stock sheet."""

    def __init__(self, line, message):
        super().__init__(f"line {line}: {message}")   # the text you see in tracebacks
        self.line = line                              # extra data for the code that catches it`, "errors.py"),
        p("`super().__init__(...)` sets the message, so `str(err)` gives `\"line 3: ...\"`. The extra field (`err.line`) lets the code that catches the error use the line number without parsing text."),
        h3("raise ... from err keeps the original error"),
        p("When you catch a low-level error and raise your own, attach the original with `from`. Python stores it in the new exception's `__cause__` attribute and prints both:"),
        code("python", `
from errors import StockError


def parse_qty(line, text):
    try:
        return int(text)
    except ValueError as err:
        raise StockError(line, f"quantity is not a number: {text!r}") from err


parse_qty(3, "12 cái")`, "stock.py"),
        code("text", `
Traceback (most recent call last):
  File "C:\\lotus\\stock.py", line 6, in parse_qty
    return int(text)
ValueError: invalid literal for int() with base 10: '12 cái'

The above exception was the direct cause of the following exception:

Traceback (most recent call last):
  ...
errors.StockError: line 3: quantity is not a number: '12 cái'`),
        p("Read it bottom-up again: the last line is your message with the line number, and above it - after **\"The above exception was the direct cause of the following exception\"** - is the original `ValueError` with its own location. Nothing is lost. (Python writes `errors.StockError` because the class lives in the module `errors.py`.)"),
        bullets([
            "**Without `from`**, Python still remembers the first error (in `__context__`), but the traceback says \"During handling of the above exception, another exception occurred\" - which reads like *a second bug in your except block*. `from err` says \"this is on purpose, and this is why\".",
            "**`err.__cause__`** is the original exception object. Code can check it: `type(err.__cause__).__name__` is `\"ValueError\"`.",
            "**Do not copy only the message** (`raise StockError(line, str(err))`): the type and location of the original are gone.",
        ]),
        callout("info", "Validation errors you detect yourself",
            "Not every bad value makes Python raise. A quantity of -5 parses fine; you decide it is wrong. Then you raise your own exception directly, with no from - there is no original error to keep, so its __cause__ is None."),

        h2("6. Report every problem at once: ExceptionGroup and except*"),
        p("Stopping at the first bad row is right for a crash, but wrong for **validation**. If a sheet has five bad rows, the person fixing it wants all five in one report. Since Python 3.11, an **`ExceptionGroup`** holds several exceptions at once: `ExceptionGroup(message, [errors])`."),
        image("swallow-stop-collect", {
            alt: "Three panels for the same price sheet of 500 rows in which rows 12, 87 and 311 are bad. Panel 1, red, Swallow with except: pass: every error disappears, including a NameError from your own typo; the job prints Updated 0 prices - OK; bad rows and the typo stay unknown and exit code 0 means nobody is paged; result: silent failure, the shop sells at yesterday's prices. Panel 2, red, Stop at the first error: run 1 raises a PriceError on row 12, fix the sheet and re-run, run 2 fails on row 87, run 3 on row 311; result: 3 runs for 3 problems, an hour of fix, re-run, repeat. Panel 3, green, Collect and raise one group: every row is checked and each error is kept; one ExceptionGroup with the message 3 of 500 rows invalid holds PriceError row 12 with __cause__ ValueError, PriceError row 87 with __cause__ KeyError, and PriceError row 311 for price -100 with no cause; an arrow leads to except* PriceError as group; result: 1 run shows all 3 problems, good rows are applied and the exit code is 1.",
            caption: "Swallowing hides the problem, stopping shows one problem per run, collecting shows every problem in one run - and the job still fails loudly.",
        }),
        p("The pattern is: check each item in its own small `try`, **keep** the errors in a list instead of stopping, and raise them together at the end:"),
        code("python", `
# check_stock.py - uses StockError and parse_qty from above
sheet = ["12", "abc", "7", "", "3"]     # quantities, sheet lines 2-6
errors = []
for line, text in enumerate(sheet, start=2):
    try:
        qty = parse_qty(line, text)     # raises StockError ... from err
    except StockError as err:
        errors.append(err)              # remember it and keep going
    else:
        print(f"line {line}: {qty} in stock")
if errors:
    raise ExceptionGroup(f"{len(errors)} bad lines in stock sheet", errors)

# Output before the traceback:
# line 2: 12 in stock
# line 4: 7 in stock
# line 6: 3 in stock`, "check_stock.py"),
        p("If nobody handles the group, the traceback shows every member, each with its own cause:"),
        code("text", `
  + Exception Group Traceback (most recent call last):
  |   ...
  | ExceptionGroup: 2 bad lines in stock sheet (2 sub-exceptions)
  +-+---------------- 1 ----------------
    | Traceback (most recent call last):
    |   ...
    | ValueError: invalid literal for int() with base 10: 'abc'
    |
    | The above exception was the direct cause of the following exception:
    |   ...
    | errors.StockError: line 3: quantity is not a number: 'abc'
    +---------------- 2 ----------------
    |   ...
    | errors.StockError: line 5: quantity is not a number: ''
    +------------------------------------`),
        h3("Handling a group by type with except*"),
        p("`except*` (read \"except star\") handles the members of a group **by type**. Each `except*` clause receives a smaller group with only the matching exceptions; its `.exceptions` attribute is a tuple of them:"),
        code("python", `
errors = [ValueError("row 2: bad number"), KeyError("price"), ValueError("row 5: bad number")]
try:
    raise ExceptionGroup("3 rows failed", errors)
except* ValueError as group:
    print("ValueError:", len(group.exceptions), "-", group.message)
except* KeyError as group:
    print("KeyError:", group.exceptions)

# Output:
# ValueError: 2 - 3 rows failed
# KeyError: (KeyError('price'),)`),
        bullets([
            "**Several clauses can run** for one group - unlike plain `except`, where only the first match runs.",
            "**Members that no clause matches are re-raised** in a new group, so you cannot forget a type by accident.",
            "**A plain exception is wrapped**: if the `try` raises a single `ValueError`, `except* ValueError as group` receives `ExceptionGroup('', (ValueError(...),))` - a group with an empty message.",
            "**Rules**: one `try` uses either `except` or `except*`, never both (`SyntaxError: cannot have both 'except' and 'except*' on the same 'try'`). `return`, `break` and `continue` are not allowed inside an `except*` block. The list of exceptions must not be empty (`ValueError: second argument (exceptions) must be a non-empty sequence`).",
        ]),
        h3("subgroup and split"),
        p("Outside `except*`, you can filter a group yourself. `eg.subgroup(ValueError)` returns a new group with only the `ValueError` members (or `None` if there are none). `eg.split(ValueError)` returns two groups: the matching members and the rest (either can be `None`). Both keep the original message."),

        h2("7. What changed in Python 3.14"),
        p("Two small changes to exception syntax arrived in Python 3.14:"),
        bullets([
            "**PEP 758 - no parentheses needed**: `except ValueError, TypeError:` now works and catches both. This is only allowed **without** `as`: `except ValueError, TypeError as err:` is still `SyntaxError: multiple exception types must be parenthesized when using 'as'`. The same rule applies to `except*`. If your script also has to run on older Pythons, keep the parentheses.",
            "**PEP 765 - warning for return/break/continue in finally**: a `return` in `finally` silently replaces whatever was happening - including an exception, which simply disappears. Python 3.14 now prints a `SyntaxWarning` when it compiles such code.",
        ]),
        code("python", `
def read_count():
    try:
        raise OSError("disk full")
    finally:
        return 0                  # the OSError is lost

print(read_count())

# Output (Python 3.14):
# C:\\lotus\\count.py:5: SyntaxWarning: 'return' in a 'finally' block
#   return 0
# 0`, "count.py"),
        p("The program still runs and prints `0` - the warning is a hint, not an error. `break` and `continue` in `finally` get the same warning (`'break' in a 'finally' block`). Treat it as a bug report: move the `return` after the `try` statement."),

        h2("8. Your turn"),
        p("Here is the price update as a function, `import_prices(rows, catalog)`. It still has the bare `except: pass`, it stops at the first non-positive price, and it never attaches the original error. The runner at the bottom of the file behaves like the nightly job: it catches the result with `except* PriceError`, and prints the group message and every error with its row and cause type. It does not change - your function has to give it the right group."),
        challenge("chal_fix_pyf_411", "Move the checks for one row into a small helper that raises PriceError, using raise ... from err for the KeyError and the ValueError, and a plain raise for a price that is not positive. In the loop, catch only PriceError and append it to a list; update the catalog in the else branch. After the loop, raise one ExceptionGroup if the list is not empty."),

        h2("9. The fix at the edge of the job"),
        p("A fixed `import_prices` raises a group. The last piece is the **edge** of the program - `main()` - which decides what the outside world sees. It prints every bad row once and returns a failing exit code, so the scheduler pages someone instead of reporting success:"),
        code("python", `
import sys


def main():
    rows = read_price_sheet("prices.csv")
    exit_code = 0
    try:
        updated = import_prices(rows, catalog)
        print(f"Updated {updated} prices")
    except* PriceError as group:
        print(f"Price update FAILED: {group.message}", file=sys.stderr)
        for err in group.exceptions:
            print(f"  {err}  (cause: {err.__cause__!r})", file=sys.stderr)
        exit_code = 1              # return is not allowed inside except*
    return exit_code


if __name__ == "__main__":
    sys.exit(main())

# Output for a sheet with one bad row (exit code 1):
# Price update FAILED: 1 of 3 rows invalid
#   row 2: price is not a whole number: '45,000'  (cause: ValueError("invalid literal for int() with base 10: '45,000'"))`, "update_prices.py"),
        numbered([
            "**Only `PriceError` is handled.** A `NameError` from a typo is not a `PriceError`, so it is not caught: the job crashes with a traceback and exit code 1. The incident from section 1 can no longer report \"OK\".",
            "**Every bad row is printed in one run**, with its row number and the original error, so ops can fix the whole sheet at once.",
            "**The exit code tells the truth.** `sys.exit(main())` turns the returned number into the process exit code; 0 means success, anything else means failure.",
            "**The good rows were still applied** by `import_prices`, so one bad row no longer blocks 499 good prices.",
        ]),

        h2("10. Pitfalls"),
        bullets([
            "**Bare `except:`** catches `KeyboardInterrupt` and `SystemExit` too - Ctrl+C stops working and `sys.exit()` is ignored.",
            "**`except Exception: pass`** hides your own bugs (`NameError`, `TypeError`) and turns a crash into a silent wrong result.",
            "**A big `try` block** catches errors from lines you never meant to protect. Keep `try` to the line that can fail and use `else` for the rest.",
            "**Raising a new error without `from err`** loses the clear \"direct cause\" link; copying only `str(err)` loses the type and location too.",
            "**Stopping at the first validation error** when a person has to fix the input: collect the errors and raise one `ExceptionGroup`.",
            "**`return` inside `finally`** makes an exception vanish - Python 3.14 warns about it, but older versions do not.",
            "**Mixing `except` and `except*`** on one `try`, or using `return` inside `except*`: both are a `SyntaxError`.",
        ]),

        h2("11. Checklist"),
        bullets([
            "When something fails, read the last line of the traceback first, then the frame above it.",
            "Every `except` names the exception types you expect and does something useful with them - no bare `except:`, no `except Exception: pass`.",
            "`try` blocks are small; follow-up code lives in `else`, cleanup in `with` or `finally`.",
            "Your own exception classes inherit from `Exception`, call `super().__init__(message)` and carry the data a caller needs (row, SKU, line).",
            "When you turn a low-level error into your own, you write `raise MyError(...) from err`.",
            "Validation checks every item and reports all problems together in one `ExceptionGroup`, handled with `except*`.",
            "The edge of the script prints the errors once and exits with a non-zero code when the job failed.",
        ]),
    ],
});
