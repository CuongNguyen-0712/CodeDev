// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Code blocks use String.raw so Python escapes such as "\n" and "\ufeff" reach the page unchanged.
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-pyf-3-1",
    title: "pathlib, CSV & JSON",
    slug: { _type: "slug", current: "python-pathlib-csv-json-windows-encoding" },
    description:
        "A nightly export script written on a Mac moves to the Windows office PC and breaks four ways: a path with backslashes, a missing reports folder, a CSV that Excel shows as \"HÃ  Ná»™i\" with blank rows, and a JSON summary full of \\u00e0. Learn pathlib, explicit encodings, the BOM, the csv module and json the way production scripts use them.",
    estimatedTime: 22,

    scenario: {
        role: "Junior ops/data assistant, Lotus Mart (small online shop in Vietnam)",
        problem:
            "Every night the office Windows PC runs nightly_export.py: it reads the shop admin's order export, writes a clean CSV for the warehouse (opened in Excel) and a JSON summary that the team chat bot posts. The script was written and tested on a contractor's Mac. On Windows it crashed on its own source path, then crashed only when the scheduler ran it, and when it finally ran, the warehouse saw an empty order_id column, \"HÃ  Ná»™i\" instead of Hà Nội and a blank line between orders, while the bot posted {\"H\\u00e0 N\\u1ed9i\": 1}.",
    },

    content: [
        h2("1. The incident: a script that worked on a Mac"),
        p("The shop admin exports the day's orders as **CSV** (comma-separated values: one line per row, fields separated by commas). A contractor wrote a script that turns the export into `orders_clean.csv` for the warehouse and `summary.json` for the chat bot. On the Windows office PC, somebody only changed the source path:"),
        code("python", String.raw`
import csv
import json

SRC = "C:\exports\new\orders.csv"          # changed on the Windows PC
OUT = "reports/orders_clean.csv"
SUMMARY = "reports/summary.json"

with open(SRC, encoding="utf-8") as f:
    rows = list(csv.DictReader(f))

with open(OUT, "w", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=["order_id", "city", "total_vnd"], extrasaction="ignore")
    writer.writeheader()
    writer.writerows(rows)

orders_by_city = {}
for row in rows:
    orders_by_city[row["city"]] = orders_by_city.get(row["city"], 0) + 1

with open(SUMMARY, "w") as f:
    json.dump({"orders": len(rows), "orders_by_city": orders_by_city}, f)`, "nightly_export.py"),
        p("Over one week it failed four ways, each one appearing after the previous one was patched:"),
        numbered([
            "`OSError: [Errno 22] Invalid argument: 'C:\\\\exports\\new\\\\orders.csv'`, after a `SyntaxWarning` nobody read.",
            "Run by hand from the script's folder it worked; run by the scheduler it crashed with `FileNotFoundError: [Errno 2] No such file or directory: 'reports/orders_clean.csv'`.",
            "In Excel, `orders_clean.csv` had an **empty order_id column**, cities like **HÃ  Ná»™i**, and a **blank row between every order**.",
            "The bot posted `{\"orders\": 2, \"orders_by_city\": {\"H\\u00e0 N\\u1ed9i\": 1, \"\\u0110\\u00e0 N\\u1eb5ng\": 1}}`.",
        ]),
        p("None of these is a logic bug. Each is a **default**: how a string treats backslashes, where a relative path starts, which encoding and line endings a text file gets, and how JSON writes non-English letters."),

        h2("2. Reproduce it"),
        p("Save this as `repro.py` in an empty folder and run `python repro.py` on Windows with Python 3.14:"),
        code("python", String.raw`
import csv
import json
from pathlib import Path

here = Path(__file__).parent

src = "C:\exports\new\orders.csv"
# SyntaxWarning: "\e" is an invalid escape sequence. Such sequences will not work in the future. ...
print(repr(src))                     # 'C:\\exports\new\\orders.csv'

# an admin export saved "for Excel": UTF-8 with a BOM, Windows line endings
export = here / "orders_export.csv"
export.write_bytes("order_id,city,total_vnd\r\nA-1001,Hà Nội,250000\r\n".encode("utf-8-sig"))
with open(export, encoding="utf-8") as f:
    print(list(next(csv.DictReader(f))))   # ['\ufefforder_id', 'city', 'total_vnd']

out = here / "orders_clean.csv"
with open(out, "w", encoding="utf-8") as f:
    writer = csv.writer(f)
    writer.writerow(["order_id", "city"])
    writer.writerow(["A-1001", "Hà Nội"])
print(out.read_bytes())              # b'order_id,city\r\r\nA-1001,H\xc3\xa0 N\xe1\xbb\x99i\r\r\n'
print(repr("Hà Nội".encode("utf-8").decode("cp1252")))   # 'HÃ\xa0 Ná»™i'

print(json.dumps({"Hà Nội": 250000}))   # {"H\u00e0 N\u1ed9i": 250000}`, "repro.py"),
        p("The path contains a real line break where `\\n` was typed; the first column is `\\ufefforder_id`, not `order_id`; rows end in `\\r\\r\\n`; JSON wrote `\\u00e0`. The `cp1252` line shows what a program that assumes the Windows code page makes of the UTF-8 bytes of \"Hà Nội\": the text the warehouse saw."),
        image("windows-file-defaults", {
            alt: "Two columns. Left, red, 'What the script did': \"C:\\exports\\new\\orders.csv\", where \\n is a line break, fails with OSError Errno 22; open(src, encoding=\"utf-8\") keeps the BOM, so the first header is '\\ufefforder_id' and lookups fail; open(out, \"w\", encoding=\"utf-8\") writes rows ending in \\r\\r\\n with no BOM, so Excel shows blank rows and HÃ  Ná»™i; json.dump(summary, f) with the default ensure_ascii=True makes the bot post \"H\\u00e0 N\\u1ed9i\". Right, green, 'Say it explicitly', one arrow per problem: Path(r\"C:\\exports\\new\") / \"orders.csv\"; open(src, encoding=\"utf-8-sig\", newline=\"\") gives the header 'order_id'; open(out, \"w\", encoding=\"utf-8-sig\", newline=\"\") writes one \\r\\n per row and a BOM so Excel reads UTF-8; json.dumps(summary, ensure_ascii=False) plus write_text with encoding=\"utf-8\" gives \"Hà Nội\". Bottom note: open() without encoding= uses the locale encoding, cp1252 on this PC; python -X warn_default_encoding finds those calls.",
            caption: "Each failure is a default. The fix states the path, the encoding, the newline handling and the JSON options explicitly.",
        }),

        h2("3. Paths: from strings to pathlib"),
        h3("Backslashes in string literals are escapes"),
        p("In a normal string a backslash starts an **escape sequence**: `\\n` is a line break, `\\r` a carriage return, `\\u00e0` the letter `à`. Windows rejects a file name containing a line break - the `Errno 22`. Unknown sequences such as `\\e` are kept for now, with a `SyntaxWarning`."),
        code("python", String.raw`
print(len("C:\new\report.csv"))     # 15, not 17: "\n" and "\r" are one character each
print(repr(r"C:\new\report.csv"))   # 'C:\\new\\report.csv' - a raw string keeps every backslash`),
        p("Use a **raw string** `r\"...\"`, forward slashes (Windows accepts `C:/new/report.csv`), or better, stop gluing paths together as strings."),
        h3("pathlib.Path"),
        p("A `pathlib.Path` is a path as an object. Join parts with `/`; it uses the separator of the computer it runs on:"),
        code("python", String.raw`
from pathlib import Path

print(Path("exports") / "2026-10" / "orders.csv")   # exports\2026-10\orders.csv on Windows

p = Path("C:/new/report.csv")
print(p.name, p.stem, p.suffix, p.parent)   # report.csv report .csv C:\new
print(p.exists())                           # False`),
        bullets([
            "`folder.mkdir(parents=True, exist_ok=True)` creates the folder and missing parents and does nothing if it exists. Without `parents=True` a missing parent raises `FileNotFoundError`; without `exist_ok=True` an existing folder raises `FileExistsError`.",
            "`sorted(folder.glob(\"*.csv\"))` lists matching files; `rglob(\"*.json\")` also searches subfolders. Sort the result: the order is not guaranteed.",
            "`path.read_text(encoding=\"utf-8\")` / `path.write_text(text, encoding=\"utf-8\")` handle a whole small file; `path.open(...)` takes the same arguments as `open()`.",
            "`path.read_bytes()` shows the exact bytes on disk: the best debugging tool for this whole lesson.",
        ]),
        h3("Relative paths start from the current working directory"),
        p("`\"reports/orders_clean.csv\"` is relative to the **current working directory** (`Path.cwd()`): the folder the program was started from, not the folder of the script. A scheduler, shortcut or colleague that starts Python elsewhere makes the same line point somewhere else. `__file__` is the path of the running Python file, so build the script's own paths from `Path(__file__).parent`."),
        h3("New in 3.14: copy and move with Path"),
        p("Python 3.14 added `Path.copy()`, `copy_into()`, `move()` and `move_into()` for files and whole folders, so archiving no longer needs `shutil`:"),
        code("python", String.raw`
backup = Path(__file__).parent / "backup"
backup.mkdir(exist_ok=True)               # copy() does not create missing folders
clean.copy_into(backup)                   # backup/orders_clean.csv
clean.move(backup / "orders_latest.csv")  # returns the new Path`),

        h2("4. Text files are bytes plus an encoding"),
        p("A file stores **bytes**. An **encoding** turns characters into bytes and back. UTF-8 can store every character (\"à\" is two bytes, `c3 a0`). Old Windows code pages such as **cp1252** use one byte per character and have no \"ộ\" at all."),
        h3("open() without encoding= uses the locale encoding"),
        p("Without `encoding=`, `open()`, `read_text()` and `write_text()` use the computer's **locale encoding**: cp1252 on the Windows PC used for this lesson (other language settings give other code pages), UTF-8 in the Linux grading sandbox."),
        code("python", String.raw`
import locale
from pathlib import Path

print(locale.getpreferredencoding())   # cp1252  (this Windows PC)

Path("note.txt").write_text("Hà Nội")
# UnicodeEncodeError: 'charmap' codec can't encode character '\u1ed9' in position 4: character maps to <undefined>

Path("note.txt").write_text("Hà Nội", encoding="utf-8")
print(repr(Path("note.txt").read_text()))                    # 'HÃ\xa0 Ná»™i'  - no error, just garbage
print(repr(Path("note.txt").read_text(encoding="utf-8")))    # 'Hà Nội'`),
        p("Silent garbage (**mojibake**) is the worst case. Other letters crash instead: the UTF-8 bytes of \"Đ\" contain `0x90`, which cp1252 does not define, so decoding \"Đà Nẵng\" that way raises `UnicodeDecodeError: 'charmap' codec can't decode byte 0x90 in position 1: character maps to <undefined>`. Crash or corruption depends on today's cities."),
        callout("tip", "Let Python find every missing encoding",
            "python -X warn_default_encoding script.py prints EncodingWarning: 'encoding' argument not specified for each call without encoding=. UTF-8 mode (python -X utf8, or PYTHONUTF8=1) makes the default UTF-8 on Windows too; on this PC it switches locale.getpreferredencoding() and the open() default to utf-8. It is a safety net, not a replacement for encoding=\"utf-8\"."),
        h3("The BOM and utf-8-sig"),
        p("Some programs start a UTF-8 file with three bytes, `ef bb bf`: the **byte order mark** (BOM). As text it is one invisible character, `\"\\ufeff\"`. Excel looks for it to recognise a CSV as UTF-8; our CSV had none, so Excel decoded it with the Windows code page and showed \"HÃ  Ná»™i\"."),
        p("The codec **`utf-8-sig`** removes a BOM when reading (and works without one) and adds it when writing. Plain `utf-8` keeps it as text: the first column became `\\ufefforder_id`, and `DictWriter` wrote an empty order_id column because the rows had no `order_id` key."),
        code("python", String.raw`
data = "order_id,city\nA-1001,Huế\n".encode("utf-8-sig")
print(data[:3])                               # b'\xef\xbb\xbf'
print(repr(data.decode("utf-8")[:9]))         # '\ufefforder_id'
print(repr(data.decode("utf-8-sig")[:8]))     # 'order_id'

text = "\ufefforder_id,city\nA-1001,Huế\n"    # a str you already have (API, upload, test)
print(repr(text.strip()[:9]))                 # '\ufefforder_id' - strip() does NOT remove it
print(repr(text.removeprefix("\ufeff")[:8]))  # 'order_id'`),

        h2("5. CSV with the csv module"),
        h3("Why split(\",\") is not a CSV parser"),
        p("A field containing a comma, quote or line break is wrapped in double quotes, and inner quotes are doubled. Splitting on commas ignores that:"),
        code("python", String.raw`
import csv

line = 'A-3001,"Công ty Sen Vàng, chi nhánh 2",Đà Nẵng,1250000'
print(line.split(","))        # ['A-3001', '"Công ty Sen Vàng', ' chi nhánh 2"', 'Đà Nẵng', '1250000']
print(next(csv.reader([line])))   # ['A-3001', 'Công ty Sen Vàng, chi nhánh 2', 'Đà Nẵng', '1250000']`),
        h3("csv.DictReader: one dict per row, every value a str"),
        p("`csv.DictReader` reads the header line and returns each row as a dict. It takes any file-like object: an open file, or `io.StringIO(text)` when the CSV is already a string. Completely blank lines are skipped."),
        code("python", String.raw`
import csv
import io

text = "order_id,customer,city,total_vnd\nA-1001,Lan,Hà Nội,250000\nA-1002,Minh,Đà Nẵng\n"
for row in csv.DictReader(io.StringIO(text)):
    print(row)
# {'order_id': 'A-1001', 'customer': 'Lan', 'city': 'Hà Nội', 'total_vnd': '250000'}
# {'order_id': 'A-1002', 'customer': 'Minh', 'city': 'Đà Nẵng', 'total_vnd': None}   <- short row

row = next(csv.DictReader(io.StringIO(text)))
print(row["total_vnd"] * 2)          # 250000250000 - a str, so * repeats it
row["total_vnd"] + 1                 # TypeError: can only concatenate str (not "int") to str`),
        p("CSV has no types: **every value is a str**, and a value missing from a short row is `None`. VND has no decimals, so convert with `int()`, which refuses anything that is not a whole number:"),
        code("python", String.raw`
int(" 250000 ")   # 250000 - surrounding spaces are fine
int("12.5")       # ValueError: invalid literal for int() with base 10: '12.5'
int("")           # ValueError: invalid literal for int() with base 10: ''
int(None)         # TypeError: int() argument must be a string, a bytes-like object or a real number, not 'NoneType'`),
        p("To keep going past a bad value, wrap the conversion in `try:` / `except (TypeError, ValueError):` and record the row; lesson 4.1 covers exceptions in depth."),
        h3("Writing: DictWriter and newline=\"\""),
        p("The csv writers quote fields when needed and end each row with `\\r\\n` themselves. In normal text mode Windows turns that `\\n` into `\\r\\n` again, so rows end in `\\r\\r\\n`: Excel shows a blank row after each order, and `csv.reader` reads an empty row `[]` between real ones. Open every CSV file with **`newline=\"\"`**, for reading and writing."),
        code("python", String.raw`
with open("orders_clean.csv", "w", encoding="utf-8-sig", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=["order_id", "customer", "total_vnd"])
    writer.writeheader()
    writer.writerow({"order_id": "A-3001", "customer": "Công ty Sen Vàng, chi nhánh 2", "total_vnd": 1250000})
# BOM + order_id,customer,total_vnd\r\nA-3001,"Công ty Sen Vàng, chi nhánh 2",1250000\r\n`),
        p("A row key missing from `fieldnames` raises `ValueError: dict contains fields not in fieldnames: 'extra'` (pass `extrasaction=\"ignore\"` to drop extras). A field in `fieldnames` missing from the row is written as `\"\"` - silently, as with order_id."),

        h2("6. JSON with the json module"),
        p("`json.dumps` / `json.loads` convert between Python values and a JSON string; `json.dump` / `json.load` write to or read from an open file."),
        code("python", String.raw`
import json

summary = {"orders": 2, "orders_by_city": {"Hà Nội": 1, "Đà Nẵng": 1}}
print(json.dumps(summary))
# {"orders": 2, "orders_by_city": {"H\u00e0 N\u1ed9i": 1, "\u0110\u00e0 N\u1eb5ng": 1}}
print(json.dumps(summary, ensure_ascii=False))
# {"orders": 2, "orders_by_city": {"Hà Nội": 1, "Đà Nẵng": 1}}
print(json.dumps({"b": 1, "a": 2}, sort_keys=True))   # {"a": 2, "b": 1}

print(json.loads('[1, 2.0, "3", true, null]'))        # [1, 2.0, '3', True, None]
print(json.loads(json.dumps({1: "a"})))               # {'1': 'a'} - keys always become strings`),
        p("The default `ensure_ascii=True` writes non-ASCII letters as `\\uXXXX`. Parsers read it back correctly, but a bot pasting the raw text, or a person reading the file, sees `\\u00e0`. Use `ensure_ascii=False`, `indent=2` for files people read, and `sort_keys=True` for files you diff."),
        callout("warning", "ensure_ascii=False needs encoding=\"utf-8\"",
            "The one-word patch json.dump(summary, f, ensure_ascii=False) into a file opened with open(SUMMARY, \"w\") crashes on this Windows PC with UnicodeEncodeError: 'charmap' codec can't encode character '\\u1ed9'. The ASCII-only default had been hiding the missing encoding. Fix both."),
        h3("What JSON cannot store"),
        p("JSON has objects, arrays, strings, numbers, true/false and null. A `Decimal`, `datetime`, `date` or `set` raises `TypeError`, and Python 3.14 adds notes saying where the value was:"),
        code("python", String.raw`
from decimal import Decimal

json.dumps({"cities": [{"city": "Huế", "revenue": Decimal("1250000")}]})
# TypeError: Object of type Decimal is not JSON serializable
# when serializing dict item 'revenue'
# when serializing list item 0
# when serializing dict item 'cities'
# (same message for datetime and set: "Object of type datetime is not JSON serializable")`),
        p("Convert first: `int()` or `str()` for a `Decimal`, `.isoformat()` for a `datetime` (`\"2026-10-21T02:00:00\"`), `sorted()` for a set. `default=str` converts anything unknown, but hides mistakes (a set becomes `\"{1}\"`). Reading is strict: `json.loads(\"{'a': 1}\")` raises `JSONDecodeError: Expecting property name enclosed in double quotes: line 1 column 2 (char 1)`. In 3.14, `python -m json summary.json` pretty-prints a file."),

        h2("7. Build it: summarise the admin's export"),
        p("The warehouse also wants a revenue summary straight from the raw export, which arrives as one string. It may start with a BOM, names may contain quoted commas, lines may end in `\\r\\n`, and some totals are missing or not whole numbers. Write `summarize_export(csv_text)` with the csv module; the runner prints your dict with `ensure_ascii=False`."),
        challenge("chal_coding_pyf_311", "There is no file to open with utf-8-sig, so remove the BOM from the string itself before the csv module reads the header (strip() will not). Let csv.DictReader over io.StringIO handle quotes and blank lines. Convert the total with int() inside try/except: a short row gives None, which int() rejects with a different exception than \"12.5\"."),

        h2("8. The fix"),
        p("Every default becomes an explicit setting, and the work moves into a function that takes its paths as arguments, so it can be tested with temporary files:"),
        code("python", String.raw`
import csv
import json
from pathlib import Path

HERE = Path(__file__).parent                      # the script's folder, not the current folder
SRC = Path(r"C:\exports\new\orders.csv")          # raw string: backslashes stay backslashes


def export_orders(src: Path, reports: Path) -> dict:
    reports.mkdir(parents=True, exist_ok=True)

    with src.open(encoding="utf-8-sig", newline="") as f:          # BOM or not, header is order_id
        rows = list(csv.DictReader(f))

    with (reports / "orders_clean.csv").open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["order_id", "city", "total_vnd"], extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)

    orders_by_city = {}
    for row in rows:
        orders_by_city[row["city"]] = orders_by_city.get(row["city"], 0) + 1
    summary = {"orders": len(rows), "orders_by_city": orders_by_city}
    (reports / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    return summary


if __name__ == "__main__":
    print(export_orders(SRC, HERE / "reports"))`, "nightly_export.py"),
        numbered([
            "**Paths**: a raw string in `Path` keeps `\\new` intact; the reports folder hangs off `Path(__file__).parent` and is created on the first run, so the scheduler's working directory no longer matters.",
            "**Reading** with `utf-8-sig` drops the BOM, so `order_id` is found and filled. `newline=\"\"` keeps line breaks inside quoted fields as they were.",
            "**Writing** with `utf-8-sig` gives Excel its BOM; `newline=\"\"` gives one `\\r\\n` per row.",
            "**The summary** uses `ensure_ascii=False` and is written with `encoding=\"utf-8\"`, so Vietnamese can be written at all on a cp1252 machine.",
        ]),
        p("A test that checks the bytes catches all four bugs, in a temporary folder:"),
        code("python", String.raw`
import tempfile
from pathlib import Path

from nightly_export import export_orders


def test_export_survives_windows_and_excel():
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        src = tmp / "orders.csv"
        src.write_bytes("order_id,customer,city,total_vnd\r\nA-1001,Lan,Hà Nội,250000\r\n".encode("utf-8-sig"))
        export_orders(src, tmp / "reports")

        clean = (tmp / "reports" / "orders_clean.csv").read_bytes()
        assert clean.startswith(b"\xef\xbb\xbforder_id,city,total_vnd\r\nA-1001,")   # BOM, header, id
        assert b"\r\r\n" not in clean                                                # no blank rows
        assert '"Hà Nội": 1' in (tmp / "reports" / "summary.json").read_text(encoding="utf-8")


if __name__ == "__main__":
    test_export_survives_windows_and_excel()
    print("ok")`, "test_nightly_export.py"),

        h2("9. Pitfalls"),
        bullets([
            "**Backslashes in normal strings.** `\"C:\\new\\report.csv\"` contains a line break. Use `Path`, `r\"...\"` or forward slashes; note that a raw string cannot end in one backslash (`r\"C:\\exports\\\"` is a `SyntaxError`).",
            "**Relative paths in scheduled scripts** follow the working directory, not the script. Use `Path(__file__).parent`.",
            "**`open()` without `encoding=`** works on your machine and corrupts or crashes on the next. Always pass it; `-X warn_default_encoding` finds the ones you missed.",
            "**`strip()` does not remove a BOM.** Read files with `utf-8-sig`, or use `text.removeprefix(\"\\ufeff\")` on strings.",
            "**CSV without `newline=\"\"`** gives `\\r\\r\\n` rows on Windows.",
            "**Hand-split CSV and string numbers.** Quoted commas break `split(\",\")`, and `\"250000\" * 2` is `\"250000250000\"`.",
            "**`json` defaults.** `ensure_ascii=True` escapes Vietnamese; `Decimal`, `datetime` and `set` raise `TypeError`; int keys come back as strings.",
        ]),

        h2("10. Checklist"),
        bullets([
            "Paths are `Path` objects joined with `/`; script files come from `Path(__file__).parent`; output folders use `mkdir(parents=True, exist_ok=True)`.",
            "Every `open()`, `read_text()` and `write_text()` has `encoding=`; CSV to or from Excel uses `utf-8-sig`.",
            "Every file opened for the csv module has `newline=\"\"`.",
            "CSV goes through `DictReader` / `DictWriter`; numbers are converted with `int()`, and bad rows are reported, not silently dropped.",
            "JSON for people or bots uses `ensure_ascii=False`; `Decimal`, `datetime` and `set` are converted first.",
            "Encoding and line-ending bugs are debugged with `path.read_bytes()`, not the decoded text.",
        ]),
    ],
});
