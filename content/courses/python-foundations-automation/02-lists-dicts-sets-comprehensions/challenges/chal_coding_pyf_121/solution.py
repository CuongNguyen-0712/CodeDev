"""Lotus Mart restock summary for the evening email to the warehouse lead."""
import copy
import json
import sys


def restock_summary(rows: list[list], threshold: int) -> dict:
    totals = {}  # a dict keeps insertion order, so its keys are the SKUs in first-seen order
    for sku, warehouse, qty in rows:
        totals[sku] = totals.get(sku, 0) + qty
    low = [sku for sku, total in totals.items() if total < threshold]
    return {
        "skus": list(totals),
        "totals": totals,
        "restock": sorted(low, key=lambda sku: (totals[sku], sku)),
    }


# ---------------------------------------------------------------- test runner (do not change)
# Reads one test case (JSON) from stdin, keeps a deep copy of the rows, calls your function
# and prints the result as JSON plus "inputUnchanged" (false if the rows were changed).
if __name__ == "__main__":
    case = json.load(sys.stdin)
    rows = case["rows"]
    before = copy.deepcopy(rows)
    result = restock_summary(rows, case["threshold"])
    print(json.dumps({**result, "inputUnchanged": rows == before}))
