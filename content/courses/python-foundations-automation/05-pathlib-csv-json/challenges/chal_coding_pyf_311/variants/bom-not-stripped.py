# Known wrong: feeds the text to DictReader with the BOM still in it, so the first header is "﻿order_id" and row["order_id"] raises KeyError as soon as a row is skipped.
import csv
import io
import json
import sys


def summarize_export(csv_text: str) -> dict:
    reader = csv.DictReader(io.StringIO(csv_text.strip()))
    rows = 0
    skipped = []
    by_city = {}
    for row in reader:
        rows += 1
        try:
            total = int(row["total_vnd"])
        except (TypeError, ValueError):
            skipped.append(row["order_id"])
            continue
        by_city[row["city"]] = by_city.get(row["city"], 0) + total
    return {"rows": rows, "skipped": skipped, "total_vnd": sum(by_city.values()), "by_city": by_city}


if __name__ == "__main__":
    case = json.load(sys.stdin)
    print(json.dumps(summarize_export(case["csv_text"]), ensure_ascii=False))
