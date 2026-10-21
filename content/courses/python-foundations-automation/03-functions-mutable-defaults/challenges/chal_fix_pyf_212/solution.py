"""
Lotus Mart order import: build one warehouse order per row of the shop export.

import_orders.py calls build_order() once per row, many times in ONE run.

Requirements:
  - build_order(order_id, sku, qty, tags=..., *, gift=False, express=False) returns a new
    dict {"id", "sku", "qty", "tags"}.
  - The order's "tags" list starts with the tags passed in by the caller (campaign tags such
    as "tet-sale"), in the same order, followed by:
      "gift" if gift is True, then "express" if express is True, then "bulk" if qty >= 10.
  - When the caller passes no tags, the order starts with no tags.
  - Every order gets its own tags list: building one order never changes an order that was
    built earlier, and never changes the list the caller passed in (the import script
    passes the SAME campaign list for every campaign row).

Example (one run):
  build_order("LM-1001", "TEA-500", 2, gift=True)  -> {"id": "LM-1001", "sku": "TEA-500", "qty": 2, "tags": ["gift"]}
  build_order("LM-1002", "MUG-01", 1)              -> {"id": "LM-1002", "sku": "MUG-01", "qty": 1, "tags": []}
"""
import json
import sys


def build_order(order_id, sku, qty, tags=None, *, gift=False, express=False):
    """Return the warehouse order for one row of the shop export.

    The caller's tags list is copied, never changed.
    """
    order_tags = [] if tags is None else list(tags)
    if gift:
        order_tags.append("gift")
    if express:
        order_tags.append("express")
    if qty >= 10:
        order_tags.append("bulk")
    return {"id": order_id, "sku": sku, "qty": qty, "tags": order_tags}


# ---------------------------------------------------------------- test runner (do not change)
# Reads one test case (JSON) from stdin: the campaign tags and the rows of ONE import run.
# Calls build_order() once per row in the same process, like import_orders.py does, and
# prints every order plus the campaign list after the whole run.
if __name__ == "__main__":
    case = json.load(sys.stdin)
    campaign_tags = case["campaign_tags"]  # one list object, shared by every campaign row
    orders = []
    for row in case["rows"]:
        options = {"gift": row.get("gift", False), "express": row.get("express", False)}
        if row.get("campaign"):
            order = build_order(row["id"], row["sku"], row["qty"], campaign_tags, **options)
        else:
            order = build_order(row["id"], row["sku"], row["qty"], **options)
        orders.append(order)
    print(json.dumps({"orders": orders, "campaign_tags": campaign_tags}))
