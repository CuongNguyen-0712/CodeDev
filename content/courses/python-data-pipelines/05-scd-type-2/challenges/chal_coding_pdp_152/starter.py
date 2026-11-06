"""
Rice Rocket's commission (its share of every order) differs per restaurant and changes over time.
In October finance recomputed September and got the wrong total: dim_restaurant had been
overwritten with the October rates. The dimension now keeps history (slowly changing dimension,
type 2), filled each night from a snapshot of all restaurants dated with the day it describes.

Requirements:
  apply_snapshot(wh, snapshot_date, rows), rows = [{restaurant_id, name, district, commission_pct}]
  - district and commission_pct are tracked: when one changes, the current version is closed
    (valid_to = snapshot_date, is_current = 0) and a new version starts (valid_from = snapshot_date,
    valid_to = '9999-12-31', is_current = 1, a new restaurant_sk).
  - name is not tracked (type 1): a new name is written to every version of the restaurant, without
    a new version.
  - A restaurant seen for the first time gets its first version from snapshot_date.
  - Applying the same snapshot again changes nothing. Everything runs in one transaction.
  restaurant_sk_at(wh, restaurant_id, day): the version valid on that day
  (valid_from <= day < valid_to), or None.
"""
import json
import sqlite3
import sys
from datetime import date

INSERT_VERSION = """
INSERT INTO dim_restaurant (restaurant_id, name, district, commission_pct, valid_from, valid_to, is_current)
VALUES (:restaurant_id, :name, :district, :commission_pct, :valid_from, '9999-12-31', 1)
"""


def apply_snapshot(wh, snapshot_date, rows):
    with wh:
        for row in rows:
            current = wh.execute(
                "SELECT restaurant_sk, name, district, commission_pct FROM dim_restaurant "
                "WHERE restaurant_id = ? AND is_current = 1", (row["restaurant_id"],)).fetchone()
            # [ ] A restaurant seen for the first time
            sk, name, district, pct = current
            # [ ] A new name, without a new version
            # [ ] Has a tracked attribute changed?
            if not changed:
                continue
            # [ ] End the version that was valid until now
            wh.execute(INSERT_VERSION, {**row, "valid_from": snapshot_date})


def restaurant_sk_at(wh, restaurant_id, day):
    row = None
    # [ ] The version that was valid on a given day
    return row[0] if row else None


# ---------------------------------------------------------------- test runner (do not change)
# Input: {"snapshots": [{"date": "YYYY-MM-DD", "rows": [...]}], "orders": [{"order_id", "restaurant_id",
# "day", "total_vnd"}]}. Applies the snapshots in order, then prices each order's commission with the
# version valid on its day. Prints the dimension, each order's commission and the total per month.
if __name__ == "__main__":
    case = json.load(sys.stdin)
    wh = sqlite3.connect(":memory:")
    wh.execute("""CREATE TABLE dim_restaurant (
        restaurant_sk  INTEGER PRIMARY KEY AUTOINCREMENT,
        restaurant_id  INTEGER NOT NULL,
        name           TEXT NOT NULL,
        district       TEXT NOT NULL,
        commission_pct REAL NOT NULL,
        valid_from     TEXT NOT NULL,
        valid_to       TEXT NOT NULL,
        is_current     INTEGER NOT NULL)""")
    wh.commit()
    for snap in case["snapshots"]:
        apply_snapshot(wh, snap["date"], snap["rows"])
    dim = wh.execute("SELECT restaurant_sk, restaurant_id, name, district, commission_pct, valid_from, valid_to, is_current "
                     "FROM dim_restaurant ORDER BY restaurant_id, valid_from, restaurant_sk").fetchall()
    orders, months = [], {}
    for o in case.get("orders", []):
        sk = restaurant_sk_at(wh, o["restaurant_id"], o["day"])
        pct = wh.execute("SELECT commission_pct FROM dim_restaurant WHERE restaurant_sk = ?", (sk,)).fetchone() if sk else None
        commission = round(o["total_vnd"] * pct[0] / 100) if pct else None
        orders.append([o["order_id"], sk, commission])
        if commission is not None:
            months[o["day"][:7]] = months.get(o["day"][:7], 0) + commission
    print(json.dumps({"dim": [list(r) for r in dim], "orders": orders, "commission_by_month": months}))
