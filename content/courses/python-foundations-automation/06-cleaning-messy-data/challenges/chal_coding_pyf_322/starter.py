"""
Clean the customer export from the shop admin and count customers per city.

Each row is a dict with "email", "name" and "city" (strings; "email" or "city" may be
missing, None or blank). `aliases` maps a city KEY to its display name, for spellings that
normalization alone cannot fix ("ha noi" -> "Hà Nội", "tp.hcm" -> "TP.HCM").

Requirements:
  - Email key: strip the spaces around it and casefold() it.
  - City: normalize to NFC and collapse every run of whitespace (including non-breaking
    spaces) to one space, with no spaces at the ends. Its key is that text casefolded.
    Display name: aliases[key] if the key is in `aliases`, otherwise the cleaned text .title().
  - A row without an email (missing, None or blank) is rejected with reason "missing email";
    otherwise a row without a city is rejected with reason "missing city". Row numbers start
    at 1. Rejected rows are not customers and never count as a first occurrence.
  - Dedupe by email key: keep the FIRST valid row for each email; count the others in
    "duplicates".
  - "by_city": [display name, number of customers], sorted by count (highest first), then by
    display name (plain sorted() string order).
  - Do not modify `rows`: build new values (the runner checks).

Example:
  rows = [{"email": "Lan@Lotus.vn", "name": "Lan", "city": "Hà Nội"},
          {"email": " lan@lotus.vn", "name": "Lan", "city": "Huế"},
          {"email": "", "name": "Minh", "city": "Huế"},
          {"email": "an@lotus.vn", "name": "An", "city": "ha  noi"}]
  aliases = {"ha noi": "Hà Nội"}
  -> {"by_city": [["Hà Nội", 2]], "duplicates": 1,
      "rejected": [{"row": 3, "reason": "missing email"}]}
"""
import copy
import json
import sys
import unicodedata


def clean_customers(rows: list[dict], aliases: dict[str, str]) -> dict:
    # Naive first version: counts every row, city as written. Replace it.
    counts: dict[str, int] = {}
    for row in rows:
        city = row.get("city") or ""
        counts[city] = counts.get(city, 0) + 1
    return {
        "by_city": [[city, count] for city, count in counts.items()],
        "duplicates": 0,
        "rejected": [],
    }


# ---------------------------------------------------------------- test runner (do not change)
# Reads one test case (JSON) from stdin and prints the result as JSON.
# ensure_ascii (the default) keeps the output ASCII, so it prints on any console encoding.
if __name__ == "__main__":
    case = json.load(sys.stdin)
    before = copy.deepcopy(case)
    result = clean_customers(case["rows"], case["aliases"])
    if case != before:
        print(json.dumps({"error": "the input rows were modified"}))
    else:
        print(json.dumps(result))
