"""Clean the customer export and count customers per city."""
import copy
import json
import sys
import unicodedata


def clean_text(value: str) -> str:
    # NFC first: the mobile app sends decomposed letters (a + combining grave accent)
    return " ".join(unicodedata.normalize("NFC", value).split())


def clean_customers(rows: list[dict], aliases: dict[str, str]) -> dict:
    seen: set[str] = set()
    counts: dict[str, int] = {}
    rejected = []
    duplicates = 0
    for number, row in enumerate(rows, start=1):
        email = (row.get("email") or "").strip().casefold()
        city = clean_text(row.get("city") or "")
        if not email:
            rejected.append({"row": number, "reason": "missing email"})
            continue
        if not city:
            rejected.append({"row": number, "reason": "missing city"})
            continue
        if email in seen:
            duplicates += 1
            continue
        seen.add(email)
        display = aliases.get(city.casefold(), city.title())
        counts[display] = counts.get(display, 0) + 1
    by_city = sorted(counts.items(), key=lambda item: (-item[1], item[0]))
    return {
        "by_city": [[name, count] for name, count in by_city],
        "duplicates": duplicates,
        "rejected": rejected,
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
