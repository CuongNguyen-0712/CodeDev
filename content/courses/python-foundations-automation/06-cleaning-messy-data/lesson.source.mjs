// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Code blocks that contain backslashes use String.raw, so "\u0300" stays the 6 characters the learner should type.
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-pyf-3-2",
    title: "Cleaning messy data: normalize, dedupe, group",
    slug: { _type: "slug", current: "python-cleaning-messy-data-normalize-dedupe-group" },
    description:
        "The monthly \"customers by city\" report lists Hà Nội three times and counts one customer twice, so marketing sends her two vouchers. Learn why exported text is messy (spaces, case, composed and decomposed Unicode), how to build canonical keys with NFC, split/join and casefold, and how to dedupe, group and sort the clean rows without touching the raw data.",
    estimatedTime: 22,

    scenario: {
        role: "Junior ops/data person at Lotus Mart, a small online shop in Vietnam",
        problem:
            "Every month you export the customer list from the shop admin and send marketing a \"customers by city\" report; they mail one voucher per customer. This month the report shows \"Hà Nội\" on three separate lines, and Lan Nguyễn received two vouchers. Her email is in the export twice: once as typed at checkout, once with a capital L and a leading space from the mobile app. Your script already removes duplicate emails. It just compares the text exactly as exported.",
    },

    content: [
        h2("1. The incident: three Hà Nội and two vouchers"),
        p("The report script is short. It skips an email it has already seen and counts customers per city with a `Counter` (a dict that counts things, from lesson 1.2):"),
        code("python", `
from collections import Counter

def customers_by_city(rows):
    emails = set()
    cities = Counter()
    for row in rows:
        if row["email"] in emails:      # duplicate customer: skip
            continue
        emails.add(row["email"])
        cities[row["city"]] += 1
    return cities.most_common()`, "report.py"),
        p("Marketing pasted the result into a slide:"),
        code("text", `
Hà Nội     2
ha noi     1
Hà Nội     1
Đà Nẵng    1`),
        p("Two lines read exactly \"Hà Nội\", yet Python counted them as different cities. The duplicate check ran too - it never fired, because `\"lan.nguyen@gmail.com\"` and `\" Lan.Nguyen@Gmail.com\"` are different strings. The code compares **raw text**, and exported text is never as clean as it looks."),

        h2("2. Reproduce it"),
        p("Five rows are enough. The third city uses `\\u` escapes to show what the mobile app really sends; Python turns them into characters. Save as `repro.py` and run `python repro.py`:"),
        code("python", String.raw`
from collections import Counter

rows = [
    {"email": "lan.nguyen@gmail.com",  "city": "Hà Nội"},
    {"email": "minh.tran@lotus.vn",    "city": "ha noi "},
    {"email": "an.pham@yahoo.com",     "city": "Ha\u0300 No\u0323\u0302i"},   # from the mobile app
    {"email": " Lan.Nguyen@Gmail.com", "city": "Hà Nội"},
    {"email": "hoa.le@lotus.vn",       "city": "Đà Nẵng"},
]

emails = set()
cities = Counter()
for row in rows:
    if row["email"] in emails:
        continue
    emails.add(row["email"])
    cities[row["city"]] += 1

print(cities.most_common())
# [('Hà Nội', 2), ('ha noi ', 1), ('Hà Nội', 1), ('Đà Nẵng', 1)]
print(len(emails))      # 5  <- five "different" customers, Lan counted twice

a = rows[0]["city"]
b = rows[2]["city"]
print(a, b, a == b)     # Hà Nội Hà Nội False
print(len(a), len(b))   # 6 9
print(ascii(a), ascii(b))
# 'H\xe0 N\u1ed9i' 'Ha\u0300 No\u0323\u0302i'`, "repro.py"),
        p("The two \"Hà Nội\" strings look the same, are not equal, and do not even have the same length. `ascii()` prints every non-ASCII character as an escape, which makes the difference visible. Lesson one of messy data: **you cannot debug it by looking at it** - print `repr()` or `ascii()` instead."),

        h2("3. Why exported data is messy"),
        p("Data typed by people, copied between apps and exported by systems collects small differences. Each one is harmless for a human reader and fatal for `==`, `in`, `set` and dict keys."),
        h3("Spaces you can and cannot see"),
        bullets([
            "**Leading and trailing spaces**: `\"ha noi \"`, `\" Lan.Nguyen@Gmail.com\"`. Forms rarely trim them.",
            "**Runs of spaces and tabs** inside a value: `\"ha  noi\"`.",
            "**Non-breaking spaces** (`\\u00a0`): text pasted from web pages and spreadsheets often contains them. They look exactly like a space, but `\"Hà\\u00a0Nội\" == \"Hà Nội\"` is `False`.",
        ]),
        p("`str.strip()` removes whitespace at the **ends** only. `str.split()` with no argument splits on every run of whitespace - spaces, tabs, new lines and the non-breaking space - and drops empty pieces, so `\" \".join(s.split())` trims the ends **and** collapses everything inside to single normal spaces:"),
        code("python", String.raw`
s = "  Hà\u00a0Nội   \t"
print(repr(s.strip()))            # 'Hà\xa0Nội'   (the middle one is still there)
print(s.split())                  # ['Hà', 'Nội']
print(repr(" ".join(s.split())))  # 'Hà Nội'`),
        h3("Upper and lower case"),
        p("`\"Lan.Nguyen@Gmail.com\"` and `\"lan.nguyen@gmail.com\"` reach the same inbox but are different strings. To compare text without case, use `str.casefold()`: a stronger `lower()` made for caseless matching."),
        code("python", `
print("Straße".lower())                             # straße
print("Straße".casefold())                          # strasse
print("STRASSE".lower() == "Straße".lower())        # False
print("STRASSE".casefold() == "Straße".casefold())  # True`),
        p("For Vietnamese both give the same result (`\"ĐÀ NẴNG\".casefold()` is `\"đà nẵng\"`), so `casefold()` costs nothing and is right for more languages."),
        callout("info", "Is an email address case-insensitive?",
            "The email standard (RFC 5321) allows the part before the @ to be case-sensitive; the domain never is. Lotus Mart, like most shops, treats the whole address as case-insensitive. That is a business decision: write it down next to the code that makes it."),
        h3("Two ways to write \"Hà Nội\""),
        p("A string is a sequence of **code points**: numbered Unicode characters. Many accented letters can be stored in two ways:"),
        bullets([
            "**Composed** (normal form **NFC**): one code point per letter. `à` is U+00E0 LATIN SMALL LETTER A WITH GRAVE.",
            "**Decomposed** (normal form **NFD**): a base letter followed by **combining marks**. `à` is `a` + U+0300 COMBINING GRAVE ACCENT, and Vietnamese `ộ` is `o` + U+0323 (dot below) + U+0302 (circumflex) - three code points.",
        ]),
        p("Both render the same, which is why the incident is invisible. Different keyboards, apps and operating systems produce different forms, so one export can contain both. The `unicodedata` module converts between them:"),
        code("python", String.raw`
import unicodedata

nfd = "Ha\u0300 No\u0323\u0302i"
nfc = unicodedata.normalize("NFC", nfd)
print(nfc == "Hà Nội", len(nfd), len(nfc))      # True 9 6
print(unicodedata.is_normalized("NFC", nfd))     # False`),
        p("Normalize to **NFC** before you compare, count, group or store text. It is the usual choice for stored text, and the shorter of the two forms."),
        h3("Numbers and dates written by people"),
        p("Vietnamese writes a thousands separator as a dot - `\"1.250.000\"` - while English-language tools write `\"1,250,000\"`. Neither is valid for `int()`:"),
        code("python", `
int("1.250.000")
# ValueError: invalid literal for int() with base 10: '1.250.000'`),
        p("Dates are worse, because the wrong guess does not fail. `\"05/03/2026\"` is 5 March in Vietnam and 3 May in the US, and both parse:"),
        code("python", `
from datetime import datetime

print(datetime.strptime("05/03/2026", "%d/%m/%Y").date())   # 2026-03-05
print(datetime.strptime("05/03/2026", "%m/%d/%Y").date())   # 2026-05-03`),
        p("Know the format of every column, write it in the code, and ask for ISO 8601 (`2026-03-05`) exports when you can."),

        h2("4. One normalize step: canonical keys and display values"),
        p("The cure is one cleaning function that every value goes through, so \"the same\" always gives the same string. It feeds two different things:"),
        bullets([
            "The **canonical key** is what you compare, dedupe and group by. It only has to be consistent, not pretty: `\"hà nội\"`, `\"lan.nguyen@gmail.com\"`.",
            "The **display value** is what people read in the report: `\"Hà Nội\"`, `\"TP.HCM\"`.",
        ]),
        code("python", `
import unicodedata

def clean_text(value: str) -> str:
    """NFC, no spaces at the ends, one normal space between words."""
    return " ".join(unicodedata.normalize("NFC", value).split())

def text_key(value: str) -> str:
    return clean_text(value).casefold()

print(text_key("Hà Nội"), text_key("  HÀ   NỘI "))   # hà nội hà nội`),
        p("Normalization fixes form, not spelling. `\"ha noi\"` has no accents at all, and no Unicode function can guess that it means Hà Nội. For a known, short list of spellings use an explicit **alias table** from key to display value, and fall back to the cleaned text:"),
        code("python", `
CITY_ALIASES = {
    "ha noi": "Hà Nội",
    "hn": "Hà Nội",
    "tp.hcm": "TP.HCM",
    "sài gòn": "TP.HCM",
}

def city_display(raw: str) -> str:
    text = clean_text(raw)
    return CITY_ALIASES.get(text.casefold(), text.title())

print(city_display("ha  noi"), city_display(" HN"), city_display("cần thơ"))
# Hà Nội Hà Nội Cần Thơ`),
        p("The alias keys are written in key form (NFC, single spaces, casefolded), because they are compared with keys. `str.title()` upper-cases the first letter of every word; it is a fine fallback for city names, but read the pitfalls before you trust it."),
        image("one-city-many-spellings", {
            alt: "Three panels. Left: four raw values for one city - composed \"Hà Nội\" (length 6), \"ha noi \" with a trailing space, decomposed \"Hà Nội\" from the mobile app (length 9) and \"Hà Nội\" with a non-breaking space; counted raw they make 4 groups. Middle: the cleaning steps - normalize to NFC, \" \".join(s.split()), casefold for the key, then an alias table because accents cannot be guessed. Right: one group, key \"hà nội\", display \"Hà Nội\"; emails are stripped and casefolded and the first row wins, so 4 rows become 3 customers. Bottom: rows that cannot be cleaned go to a rejected list with a row number and a reason.",
            caption: "Clean every value the same way, compare and group by the key, and show the display value.",
        }),
        callout("warning", "Do not strip accents to make a key",
            "A popular trick removes accents with NFD and drops the combining marks. It loses meaning (many different Vietnamese words become the same letters), and it is not even complete: the letter Đ has no decomposition, so \"Đà Nẵng\" becomes \"Đa Nang\", not \"Da Nang\". Keep the accents in the key and map the unaccented spellings you actually see with an alias table."),

        h2("5. Clean into new rows, and keep what you reject"),
        p("Two habits make a cleaning script safe to rerun and easy to audit:"),
        numbered([
            "**Never modify the raw rows.** Build a new clean dict for each row. After `row[\"email\"] = row[\"email\"].strip()` you can no longer show what the export contained, and other code using those rows sees values it did not ask for.",
            "**Never drop a row silently.** A row you cannot use goes into a `rejected` list with its row number and a reason, and the report prints how many rows were rejected, so a broken export is noticed on day one.",
        ]),
        p("Here is a defensive parser for VND amounts. It accepts dot groups, comma groups or plain digits, and refuses everything else, because a value such as `\"12.50\"` is not a VND amount at Lotus Mart (the dong has no decimals) and guessing would invent money:"),
        code("python", String.raw`
import re

VND_PATTERN = re.compile(r"\d{1,3}(\.\d{3})+|\d{1,3}(,\d{3})+|\d+")

def parse_vnd(text: str) -> int:
    """'1.250.000 ₫', '1,250,000' or '1250000' -> 1250000. Anything else: ValueError."""
    s = text.strip().removesuffix("₫").removesuffix("VND").strip()
    if not VND_PATTERN.fullmatch(s):
        raise ValueError(f"not a VND amount: {text!r}")
    return int(s.replace(".", "").replace(",", ""))

print(parse_vnd("1.250.000 ₫"), parse_vnd("1,250,000"), parse_vnd("350000 VND"))
# 1250000 1250000 350000
parse_vnd("12.50")
# ValueError: not a VND amount: '12.50'`, "clean.py"),
        p("`re.fullmatch` succeeds only if the **whole** string matches the pattern; the three alternatives are separated by `|`. The cleaning loop then turns each raw row into either a clean row or a rejection. `try` / `except ValueError` catches the parser's error for one row and lets the loop continue - lesson 4.1 covers exceptions in depth:"),
        code("python", `
raw_rows = [
    {"email": "lan@lotus.vn", "total": "1.250.000"},
    {"email": "minh@lotus.vn", "total": "12.50"},
    {"email": "", "total": "300.000"},
]

clean_rows = []
rejected = []
for number, row in enumerate(raw_rows, start=1):     # row numbers from 1, like a spreadsheet
    email = row["email"].strip().casefold()
    if not email:
        rejected.append({"row": number, "reason": "missing email"})
        continue
    try:
        total = parse_vnd(row["total"])
    except ValueError as error:
        rejected.append({"row": number, "reason": str(error)})
        continue
    clean_rows.append({"email": email, "total_vnd": total})   # a NEW dict

print(clean_rows)  # [{'email': 'lan@lotus.vn', 'total_vnd': 1250000}]
print(rejected)    # [{'row': 2, 'reason': "not a VND amount: '12.50'"}, {'row': 3, 'reason': 'missing email'}]
print(raw_rows[0]) # {'email': 'lan@lotus.vn', 'total': '1.250.000'}  <- unchanged`, "clean.py"),

        h2("6. Dedupe: keep the first or keep the latest"),
        p("Once every row has a canonical key, removing duplicates is a set or a dict lookup. First decide **which** row should survive, because the choice changes the report:"),
        bullets([
            "**Keep the first**: the first time a customer appears wins (for example the first signup). Remember the keys you have seen and skip a key that is already there.",
            "**Keep the latest**: the newest information wins (for example the current address). Store each row under its key and replace it when a newer one arrives.",
        ]),
        code("python", `
# keep the FIRST row for each email
seen = set()
first_rows = []
for row in clean_rows:
    if row["email"] in seen:
        continue                    # a later duplicate: skip it
    seen.add(row["email"])
    first_rows.append(row)`),
        p("Keeping the latest row needs a dict from key to row and an explicit \"is this one newer?\" check; the fix in section 8 does that with an `updated_at` timestamp. Check that you can predict what normalization and a dict-based dedupe really do:"),
        challenge("chal_quiz_pyf_321"),

        h2("7. Group, count and sort"),
        p("**Grouping** collects the rows that share a key; **aggregating** turns each group into a number (a count, a sum). Three tools, from the most manual to the most specific:"),
        code("python", `
from collections import Counter, defaultdict

orders = [
    {"email": "lan@lotus.vn",  "city": "Hà Nội",  "total_vnd": 1_250_000},
    {"email": "minh@lotus.vn", "city": "Huế",     "total_vnd": 300_000},
    {"email": "an@lotus.vn",   "city": "Hà Nội",  "total_vnd": 450_000},
    {"email": "hoa@lotus.vn",  "city": "Đà Nẵng", "total_vnd": 1_550_000},
]

# 1. a plain dict and get(): sums per city
revenue = {}
for o in orders:
    revenue[o["city"]] = revenue.get(o["city"], 0) + o["total_vnd"]
print(revenue)    # {'Hà Nội': 1700000, 'Huế': 300000, 'Đà Nẵng': 1550000}

# 2. defaultdict: a missing key is created with list(), int(), ... on first use
emails_by_city = defaultdict(list)
for o in orders:
    emails_by_city[o["city"]].append(o["email"])
print(emails_by_city["Hà Nội"])     # ['lan@lotus.vn', 'an@lotus.vn']

# 3. Counter: counting has its own class
customers = Counter(o["city"] for o in orders)
print(customers)                  # Counter({'Hà Nội': 2, 'Huế': 1, 'Đà Nẵng': 1})
print(customers["Cần Thơ"])       # 0 - a missing key counts as zero
print(customers.most_common(2))   # [('Hà Nội', 2), ('Huế', 1)]`),
        p("With a plain dict, `revenue[city] += x` on a new city raises `KeyError`; `get(city, 0)` supplies a start value. `Counter.most_common()` keeps equal counts in the order they were first seen, which depends on the export order - not a stable report order."),
        h3("Sorting with a tuple key"),
        p("A report needs a deterministic order: most customers first, and a fixed rule for ties. `sorted(..., key=...)` compares the key of each item. Tuples compare item by item, so a tuple key sorts by its first item and uses the next ones only to break ties. To make a number **descending** inside an ascending key, negate it:"),
        code("python", `
totals = {"Huế": 2, "Đà Nẵng": 2, "Cần Thơ": 5, "Hà Nội": 2}

print(sorted(totals.items(), key=lambda kv: (-kv[1], kv[0])))
# [('Cần Thơ', 5), ('Huế', 2), ('Hà Nội', 2), ('Đà Nẵng', 2)]

print(sorted(totals.items(), key=lambda kv: (kv[1], kv[0]), reverse=True))
# [('Cần Thơ', 5), ('Đà Nẵng', 2), ('Hà Nội', 2), ('Huế', 2)]   <- names reversed too`),
        p("`reverse=True` reverses the **whole** comparison, so the tie-breaker flips as well. Negation only works for numbers: `-kv[0]` on a string raises `TypeError: bad operand type for unary -: 'str'`. Notice also that `\"Huế\"` sorts before `\"Hà Nội\"`: strings compare by code point, and `u` (U+0075) is smaller than `à` (U+00E0). That is not Vietnamese alphabetical order, but it is deterministic, which is what a test needs."),
        p("Now put it all together: normalize, reject, dedupe, count and sort the customer export."),
        challenge("chal_coding_pyf_322", "Build two keys per row: the email with strip() and casefold(), and the city with NFC, \" \".join(s.split()) and casefold(). Check for a missing email before a missing city, and only add an email to your 'seen' set after the row passed both checks. Count the display names in a dict, then sort the items with a tuple key that negates the count."),

        h2("8. The fix"),
        p("Marketing wants each customer counted once, in the city of their **latest** order. The fixed report cleans every row into a new dict, keeps the newest row per email, records rejections and sorts deterministically:"),
        code("python", `
import unicodedata
from collections import Counter

CITY_ALIASES = {"ha noi": "Hà Nội", "hn": "Hà Nội", "tp.hcm": "TP.HCM", "tp hcm": "TP.HCM", "sài gòn": "TP.HCM"}

def clean_text(value: str) -> str:
    return " ".join(unicodedata.normalize("NFC", value).split())

def city_display(raw: str) -> str:
    text = clean_text(raw)
    if not text:
        return "(no city)"
    return CITY_ALIASES.get(text.casefold(), text.title())

def latest_customers(rows: list[dict]) -> tuple[list[dict], list[dict]]:
    """One clean row per customer (the newest updated_at) and the rows we could not use."""
    latest: dict[str, dict] = {}
    rejected = []
    for number, row in enumerate(rows, start=1):
        email = (row.get("email") or "").strip().casefold()
        if not email:
            rejected.append({"row": number, "reason": "missing email"})
            continue
        clean = {"email": email, "city": city_display(row.get("city") or ""), "updated_at": row["updated_at"]}
        old = latest.get(email)
        if old is None or clean["updated_at"] > old["updated_at"]:
            latest[email] = clean
    return list(latest.values()), rejected

def customers_by_city(rows: list[dict]) -> tuple[list[tuple[str, int]], list[dict]]:
    customers, rejected = latest_customers(rows)
    counts = Counter(c["city"] for c in customers)
    return sorted(counts.items(), key=lambda kv: (-kv[1], kv[0])), rejected`, "report.py"),
        numbered([
            "**`clean_text`** is the one place where text is normalized: NFC, trimmed, single spaces. Every key and display value goes through it.",
            "**Emails** are compared as `strip().casefold()` keys, so `\" Lan.Nguyen@Gmail.com\"` is the same customer as `\"lan.nguyen@gmail.com\"` and gets one voucher.",
            "**Cities** are grouped by their display value, which comes from the alias table or the cleaned text. A missing city becomes an explicit `\"(no city)\"` group instead of an empty line.",
            "**The latest row wins** only if its `updated_at` is newer. Comparing these as strings is safe because they are ISO 8601 in one format and one time zone, so text order is time order; otherwise parse them first (lesson 4.2).",
            "**Rows without an email** are rejected with their row number (`row.get(\"email\") or \"\"` also covers a missing key or `None`); the report prints `len(rejected)` next to the totals.",
            "**The raw rows are never modified**, and the result is sorted by count and then name, so two runs on the same export give the same report.",
        ]),
        p("A small test pins the incident down. It also checks that the raw rows are unchanged after the call:"),
        code("python", String.raw`
import copy

from report import customers_by_city

def test_one_customer_per_email_and_one_ha_noi():
    rows = [
        {"email": "lan.nguyen@gmail.com", "city": "Đà Nẵng", "updated_at": "2026-09-01T08:00:00"},
        {"email": " Lan.Nguyen@Gmail.com", "city": "ha noi ", "updated_at": "2026-10-02T09:30:00"},
        {"email": "an.pham@yahoo.com", "city": "Ha\u0300 No\u0323\u0302i", "updated_at": "2026-10-01T10:00:00"},
        {"email": "", "city": "Huế", "updated_at": "2026-10-01T11:00:00"},
    ]
    before = copy.deepcopy(rows)
    report, rejected = customers_by_city(rows)
    assert report == [("Hà Nội", 2)]       # Lan moved to Hà Nội; the NFD city is the same city
    assert rejected == [{"row": 4, "reason": "missing email"}]
    assert rows == before                  # the raw export is unchanged

test_one_customer_per_email_and_one_ha_noi()`, "test_report.py"),

        h2("9. Pitfalls"),
        bullets([
            "**`strip()` only touches the ends.** A non-breaking space or a double space in the middle survives; use `\" \".join(s.split())`.",
            "**Not every invisible character is whitespace.** The zero-width space U+200B is not: `\"\\u200b\".isspace()` is `False`, so `split()` keeps it. If an export contains such characters, remove them explicitly and add a test.",
            "**`title()` on decomposed text is wrong.** `\"Ha\\u0300 No\\u0323\\u0302i\".title()` gives `\"Hà NộI\"`, because the combining marks are not letters and `i` looks like the start of a word. Normalize to NFC first. `title()` also turns `\"tp.hcm\"` into `\"Tp.Hcm\"` - put such names in the alias table.",
            "**A `defaultdict` creates keys when you read them.** `emails_by_city[\"Cần Thơ\"]` adds an empty list for Cần Thơ, and the city then appears in your report with zero customers. Use `in` or `.get()` when you only want to look.",
            "**`sorted()` order is code point order, not Vietnamese alphabetical order.** \"Đà Nẵng\" sorts after every name that starts with A-Z. It is fine for a deterministic report; for a phone book you need a locale-aware sort.",
        ]),

        h2("10. Checklist"),
        bullets([
            "Inspect suspicious values with `repr()` or `ascii()`, never by eye.",
            "One cleaning function per kind of value: `unicodedata.normalize(\"NFC\", s)`, then `\" \".join(s.split())`; keys add `casefold()`.",
            "Compare, dedupe and group by canonical keys; print display values; map spellings that normalization cannot fix with an explicit alias table.",
            "Parse numbers and dates with a known format and refuse anything else; never use `float` for money.",
            "Every row ends up either in the clean rows or in `rejected` with a row number and a reason; the report shows the rejected count.",
            "Decide whether the first or the latest row wins, and write that condition explicitly.",
            "Sort reports with a tuple key such as `(-count, name)` so ties have a fixed order, and leave the raw rows untouched.",
        ]),
    ],
});
