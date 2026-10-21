# Known wrong: removes empty rows from the caller's list while looping over it, which changes the input and skips rows.
import copy
import json
import sys


def restock_summary(rows: list[list], threshold: int) -> dict:
    empty = []
    for row in rows:
        if row[2] == 0:
            empty.append(row[0])
            rows.remove(row)
    totals = {sku: 0 for sku in empty}
    for sku, warehouse, qty in rows:
        totals[sku] = totals.get(sku, 0) + qty
    low = [sku for sku, total in totals.items() if total < threshold]
    return {"skus": list(totals), "totals": totals, "restock": sorted(low, key=lambda sku: (totals[sku], sku))}


if __name__ == "__main__":
    case = json.load(sys.stdin)
    rows = case["rows"]
    before = copy.deepcopy(rows)
    result = restock_summary(rows, case["threshold"])
    print(json.dumps({**result, "inputUnchanged": rows == before}))
