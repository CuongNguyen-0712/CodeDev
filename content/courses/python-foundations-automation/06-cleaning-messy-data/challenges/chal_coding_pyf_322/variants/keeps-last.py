# Known wrong: overwrites the city for a repeated email, so a duplicate keeps its LAST row instead of the first.
import copy
import json
import sys
import unicodedata


def clean_text(value: str) -> str:
    return " ".join(unicodedata.normalize("NFC", value).split())


def clean_customers(rows: list[dict], aliases: dict[str, str]) -> dict:
    city_by_email: dict[str, str] = {}
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
        if email in city_by_email:
            duplicates += 1
        city_by_email[email] = aliases.get(city.casefold(), city.title())
    counts: dict[str, int] = {}
    for display in city_by_email.values():
        counts[display] = counts.get(display, 0) + 1
    by_city = sorted(counts.items(), key=lambda item: (-item[1], item[0]))
    return {
        "by_city": [[name, count] for name, count in by_city],
        "duplicates": duplicates,
        "rejected": rejected,
    }


if __name__ == "__main__":
    case = json.load(sys.stdin)
    before = copy.deepcopy(case)
    result = clean_customers(case["rows"], case["aliases"])
    if case != before:
        print(json.dumps({"error": "the input rows were modified"}))
    else:
        print(json.dumps(result))
