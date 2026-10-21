# Known wrong: assigns instead of adding, so the last warehouse's qty replaces the SKU's total.
import copy
import json
import sys


def restock_summary(rows: list[list], threshold: int) -> dict:
    totals = {sku: qty for sku, warehouse, qty in rows}
    low = [sku for sku, total in totals.items() if total < threshold]
    return {"skus": list(totals), "totals": totals, "restock": sorted(low, key=lambda sku: (totals[sku], sku))}


if __name__ == "__main__":
    case = json.load(sys.stdin)
    rows = case["rows"]
    before = copy.deepcopy(rows)
    result = restock_summary(rows, case["threshold"])
    print(json.dumps({**result, "inputUnchanged": rows == before}))
