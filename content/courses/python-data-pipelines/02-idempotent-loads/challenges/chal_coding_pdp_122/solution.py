"""
Every night the payouts job computes, per restaurant and business day, how much Rice Rocket owes
the restaurant, and loads it into the warehouse table restaurant_payouts. Airflow retries the task
when it times out, sometimes after the first attempt already wrote its rows, and finance replays an
older file when a computation is corrected later. Finance sets paid_at on a row when the bank
transfer leaves; the job never owns that column.

Last month the table held two rows for the same restaurant and day after a retry, and the payout
report paid one restaurant twice. Fix the loader so that:
  - SCHEMA allows at most one row per restaurant and business_date.
  - load(wh, rows) can run any number of times with the same rows and leaves the same table.
  - A row with a newer computed_at replaces amount_vnd, orders and computed_at; a replay of an
    older computation changes nothing.
  - paid_at is never changed by the load.
  - A load that fails halfway leaves the table exactly as it was.
"""
import json
import sqlite3
import sys

# @piece natural-key: The table, keyed by what makes a payout unique
SCHEMA = """
CREATE TABLE restaurant_payouts (
    restaurant_id INTEGER NOT NULL,
    business_date TEXT    NOT NULL,
    amount_vnd    INTEGER NOT NULL,
    orders        INTEGER NOT NULL,
    computed_at   TEXT    NOT NULL,
    paid_at       TEXT,
    PRIMARY KEY (restaurant_id, business_date)
)
"""
# @end

# @piece upsert: Insert a payout, or update the existing one
UPSERT = """
INSERT INTO restaurant_payouts (restaurant_id, business_date, amount_vnd, orders, computed_at)
VALUES (:restaurant_id, :business_date, :amount_vnd, :orders, :computed_at)
ON CONFLICT (restaurant_id, business_date) DO UPDATE SET
    amount_vnd  = excluded.amount_vnd,
    orders      = excluded.orders,
    computed_at = excluded.computed_at
WHERE excluded.computed_at > restaurant_payouts.computed_at
"""
# @end


def load(wh, rows):
    rows = list(rows)
    # @piece all-or-nothing: Write the rows as one unit
    with wh:
        wh.executemany(UPSERT, rows)
    # @end


# ---------------------------------------------------------------- test runner (do not change)
# Input: {"steps": [{"load": [payout rows], "fail_on": [restaurant_id, business_date] (optional)}
# | {"pay": [restaurant_id, business_date, paid_at]}]}. A payout row is {restaurant_id, business_date,
# amount_vnd, orders, computed_at}. "pay" is finance marking a payout as paid. Prints the table and
# which steps failed.
if __name__ == "__main__":
    case = json.load(sys.stdin)
    wh = sqlite3.connect(":memory:")
    wh.execute(SCHEMA)
    wh.commit()
    failed = []
    for i, step in enumerate(case["steps"]):
        if "pay" in step:
            rid, day, paid_at = step["pay"]
            wh.execute("UPDATE restaurant_payouts SET paid_at = ? WHERE restaurant_id = ? AND business_date = ?",
                       (paid_at, rid, day))
            wh.commit()
            continue
        bad = step.get("fail_on")
        if bad:
            wh.execute(f"CREATE TRIGGER fail BEFORE INSERT ON restaurant_payouts "
                       f"WHEN NEW.restaurant_id = {int(bad[0])} AND NEW.business_date = '{bad[1]}' "
                       "BEGIN SELECT RAISE(ABORT, 'connection reset'); END")
            wh.commit()
        try:
            load(wh, step["load"])
        except sqlite3.Error:
            if wh.in_transaction:
                wh.rollback()
            failed.append(i + 1)
        if bad:
            wh.execute("DROP TRIGGER fail")
            wh.commit()
    rows = wh.execute("SELECT restaurant_id, business_date, amount_vnd, orders, computed_at, paid_at "
                      "FROM restaurant_payouts ORDER BY restaurant_id, business_date, computed_at").fetchall()
    print(json.dumps({"rows": [list(r) for r in rows], "failed_steps": failed}))
