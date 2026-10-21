"""
Lotus Mart restock summary for the evening email to the warehouse lead.

Each stock row is [sku, warehouse, qty]. One SKU can be stocked in several warehouses
(HN, DN, HCM), so it can appear in several rows.

Requirements - return a dict with three keys:
  - "skus": every SKU once, in the order it first appears in rows.
  - "totals": {sku: total qty across all warehouses}. Rows with qty 0 still count, so an SKU
    that is empty everywhere has a total of 0.
  - "restock": the SKUs whose total is below threshold (strictly less), lowest total first;
    equal totals are ordered by SKU (A before Z).
  - Do not change rows: no sort(), remove(), append() or editing a row. The test runner checks.

Example: restock_summary([["TEA-01", "HN", 4], ["RICE-5KG", "HN", 20], ["TEA-01", "HCM", 3],
                          ["SOY-500", "DN", 0]], threshold=10)
  -> {"skus": ["TEA-01", "RICE-5KG", "SOY-500"],
      "totals": {"TEA-01": 7, "RICE-5KG": 20, "SOY-500": 0},
      "restock": ["SOY-500", "TEA-01"]}
"""
import copy
import json
import sys


def restock_summary(rows: list[list], threshold: int) -> dict:
    # TODO: replace this placeholder with your summary.
    return {"skus": [], "totals": {}, "restock": []}


# ---------------------------------------------------------------- test runner (do not change)
# Reads one test case (JSON) from stdin, keeps a deep copy of the rows, calls your function
# and prints the result as JSON plus "inputUnchanged" (false if the rows were changed).
if __name__ == "__main__":
    case = json.load(sys.stdin)
    rows = case["rows"]
    before = copy.deepcopy(rows)
    result = restock_summary(rows, case["threshold"])
    print(json.dumps({**result, "inputUnchanged": rows == before}))
