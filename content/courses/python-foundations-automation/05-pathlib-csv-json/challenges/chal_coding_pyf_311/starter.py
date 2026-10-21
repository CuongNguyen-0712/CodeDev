"""
Summarise the shop admin's order export for the nightly report.

The export arrives as one string, `csv_text`, with the header
order_id,customer,city,total_vnd

Requirements:
  - The text may start with a byte order mark (BOM, the character "﻿") because the admin
    saves "Excel-compatible" CSV. The header must still be read as order_id, not "﻿order_id".
  - Fields that contain a comma are quoted: "Công ty Sen Vàng, chi nhánh 2" is ONE customer.
  - Lines end with \n or \r\n. Blank lines are not rows.
  - Every value comes in as a string. Convert total_vnd with int(). A row whose total is missing
    (a short row) or that int() rejects ("", "12.5", "n/a") is skipped: its order_id goes into
    "skipped" (in file order) and it is not added to any total.
  - Return a dict:
      rows       number of data rows read (skipped rows included, blank lines not)
      skipped    order_ids of the skipped rows, in file order
      total_vnd  sum of the totals that were counted (an int)
      by_city    {city: sum of counted totals}

Example: summarize_export("order_id,customer,city,total_vnd\nA-1,Lan,Huế,50000\nA-2,Minh,Huế,n/a\n")
         -> {"rows": 2, "skipped": ["A-2"], "total_vnd": 50000, "by_city": {"Huế": 50000}}
"""
import csv
import io
import json
import sys


def summarize_export(csv_text: str) -> dict:
    # TODO: read csv_text with the csv module (csv.DictReader over io.StringIO) and build the summary.
    return {"rows": 0, "skipped": [], "total_vnd": 0, "by_city": {}}


# ---------------------------------------------------------------- test runner (do not change)
# Reads one test case (JSON) from stdin and prints the summary as JSON.
if __name__ == "__main__":
    case = json.load(sys.stdin)
    print(json.dumps(summarize_export(case["csv_text"]), ensure_ascii=False))
