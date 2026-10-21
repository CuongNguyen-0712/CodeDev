# Known wrong: dedupes with set() and sorts it to get a stable order, so SKUs come out alphabetical instead of first-seen.
import copy
import json
import sys


def restock_summary(rows: list[list], threshold: int) -> dict:
    skus = sorted({sku for sku, warehouse, qty in rows})
    totals = {sku: sum(qty for s, w, qty in rows if s == sku) for sku in skus}
    low = [sku for sku in skus if totals[sku] < threshold]
    return {"skus": skus, "totals": totals, "restock": sorted(low, key=lambda sku: (totals[sku], sku))}


if __name__ == "__main__":
    case = json.load(sys.stdin)
    rows = case["rows"]
    before = copy.deepcopy(rows)
    result = restock_summary(rows, case["threshold"])
    print(json.dumps({**result, "inputUnchanged": rows == before}))
