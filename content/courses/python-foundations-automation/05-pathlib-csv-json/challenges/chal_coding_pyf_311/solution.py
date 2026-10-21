"""Summarise the shop admin's order export for the nightly report."""
import csv
import io
import json
import sys


def summarize_export(csv_text: str) -> dict:
    # The BOM is a real character at the start of the text; strip() does not remove it.
    reader = csv.DictReader(io.StringIO(csv_text.removeprefix("﻿")))
    rows = 0
    skipped = []
    by_city = {}
    for row in reader:
        rows += 1
        try:
            total = int(row["total_vnd"])
        except (TypeError, ValueError):  # TypeError: short row (None); ValueError: "", "12.5", "n/a"
            skipped.append(row["order_id"])
            continue
        by_city[row["city"]] = by_city.get(row["city"], 0) + total
    return {"rows": rows, "skipped": skipped, "total_vnd": sum(by_city.values()), "by_city": by_city}


# ---------------------------------------------------------------- test runner (do not change)
# Reads one test case (JSON) from stdin and prints the summary as JSON.
if __name__ == "__main__":
    case = json.load(sys.stdin)
    print(json.dumps(summarize_export(case["csv_text"]), ensure_ascii=False))
