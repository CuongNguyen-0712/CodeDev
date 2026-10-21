# Known wrong: splits each line on "," instead of using the csv module, so a quoted customer name with a comma shifts every column (and a blank line crashes it).
import json
import sys


def summarize_export(csv_text: str) -> dict:
    lines = csv_text.removeprefix("﻿").splitlines()
    rows = 0
    skipped = []
    by_city = {}
    for line in lines[1:]:
        parts = line.split(",")
        rows += 1
        try:
            total = int(parts[3])
        except ValueError:
            skipped.append(parts[0])
            continue
        by_city[parts[2]] = by_city.get(parts[2], 0) + total
    return {"rows": rows, "skipped": skipped, "total_vnd": sum(by_city.values()), "by_city": by_city}


if __name__ == "__main__":
    case = json.load(sys.stdin)
    print(json.dumps(summarize_export(case["csv_text"]), ensure_ascii=False))
