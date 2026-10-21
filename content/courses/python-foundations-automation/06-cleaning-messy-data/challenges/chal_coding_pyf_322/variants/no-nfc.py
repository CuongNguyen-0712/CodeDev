# Known wrong: skips NFC normalization, so the decomposed "Hà Nội" from the mobile app is a separate city.
import copy
import json
import sys
import unicodedata


def clean_text(value: str) -> str:
    return " ".join(value.split())


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


if __name__ == "__main__":
    case = json.load(sys.stdin)
    before = copy.deepcopy(case)
    result = clean_customers(case["rows"], case["aliases"])
    if case != before:
        print(json.dumps({"error": "the input rows were modified"}))
    else:
        print(json.dumps(result))
