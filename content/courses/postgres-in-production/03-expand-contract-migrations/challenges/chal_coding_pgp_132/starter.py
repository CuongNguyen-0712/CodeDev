"""
Rice Rocket moves orders.customer_phone (local format, '0903123456') to orders.phone_e164
('+84903123456') without downtime. Old and new pods run side by side during every rollout, so the
change ships as expand and contract over three releases:

  Release 1  migration RELEASE_1 (the new column + a trigger that fills it for old writers), then
             BACKFILL runs in batches while app v1 keeps taking orders.
  Release 2  migration RELEASE_2, then app v2 rolls out next to v1:
             v2 writes both columns and reads phone_e164.
  Release 3  app v3 rolls out next to v2 (v3 writes and reads only phone_e164); once no pod runs
             v1 or v2 any more, CONTRACT removes what only the old code needed.

Requirements:
  - At no point may an insert or a read of v1, v2 or v3 fail, or read a wrong phone number.
  - Existing rows are backfilled in batches of at most :batch rows (one small transaction each),
    never in one statement over the whole table.
  - At the end the table is (id, restaurant, phone_e164), every row has its phone_e164.

The challenge runs on SQLite (same SQL here except the trigger syntax; the lesson shows the
PostgreSQL version).
"""
import json
import sqlite3
import sys

# [ ] Release 1: the new column, old code keeps working

SYNC_TRIGGER = """
CREATE TRIGGER orders_phone_sync AFTER INSERT ON orders
WHEN NEW.phone_e164 IS NULL AND NEW.customer_phone IS NOT NULL
BEGIN
    UPDATE orders SET phone_e164 = '+84' || substr(NEW.customer_phone, 2) WHERE id = NEW.id;
END
"""

RELEASE_1 = [EXPAND, SYNC_TRIGGER]

# [ ] Fill the new column for existing rows, one batch

# [ ] Release 2: what runs before v2 rolls out

# [ ] After release 3: what only the old code needed


# ---------------------------------------------------------------- test runner (do not change)
# Input: {"existing": <rows already in orders>, "batch": <rows per backfill batch>, "ticks": <traffic
# rounds per rollout>}. Every traffic round, each running app version inserts one order and reads
# three (the first, a middle one and the newest). Prints what went wrong and the final table.
def local_phone(i):
    return "09%08d" % (i * 7919 % 100000000)


def e164(local):
    return "+84" + local[1:]


class Simulation:
    def __init__(self, existing):
        self.db = sqlite3.connect(":memory:", isolation_level=None)
        self.db.execute("CREATE TABLE orders (id INTEGER PRIMARY KEY, restaurant TEXT NOT NULL, customer_phone TEXT)")
        self.db.executemany("INSERT INTO orders VALUES (?, ?, ?)",
                            [(i, "Com Tam Ba Ghien", local_phone(i)) for i in range(1, existing + 1)])
        self.next_id = existing + 1
        self.errors = []
        self.wrong_reads = 0

    def fail(self, where, error):
        message = f"{where}: {error}"
        if message not in self.errors:
            self.errors.append(message)

    def migrate(self, phase, statements):
        for sql in statements:
            try:
                self.db.execute(sql)
            except sqlite3.Error as error:
                self.fail(f"{phase} migration", error)

    def insert(self, version, i):
        phone = local_phone(i)
        if version == "v1":
            self.db.execute("INSERT INTO orders (id, restaurant, customer_phone) VALUES (?, ?, ?)", (i, "Pho 24", phone))
        elif version == "v2":
            self.db.execute("INSERT INTO orders (id, restaurant, customer_phone, phone_e164) VALUES (?, ?, ?, ?)",
                            (i, "Pho 24", phone, e164(phone)))
        else:
            self.db.execute("INSERT INTO orders (id, restaurant, phone_e164) VALUES (?, ?, ?)", (i, "Pho 24", e164(phone)))

    def read(self, version, i):
        column = "customer_phone" if version == "v1" else "phone_e164"
        row = self.db.execute(f"SELECT {column} FROM orders WHERE id = ?", (i,)).fetchone()
        want = local_phone(i) if version == "v1" else e164(local_phone(i))
        if row is not None and row[0] != want:
            self.wrong_reads += 1

    def traffic(self, phase, versions):
        for version in versions:
            i = self.next_id
            self.next_id += 1
            try:
                self.insert(version, i)
            except sqlite3.Error as error:
                self.fail(f"{phase} {version} insert", error)
            for target in sorted({1, max(1, i // 2), i}):
                try:
                    self.read(version, target)
                except sqlite3.Error as error:
                    self.fail(f"{phase} {version} read", error)

    def columns(self):
        return [row[1] for row in self.db.execute("PRAGMA table_info(orders)")]


if __name__ == "__main__":
    case = json.load(sys.stdin)
    sim = Simulation(case["existing"])
    sizes = []
    try:
        sim.migrate("release 1", RELEASE_1)
        for _ in range(1000):
            try:
                changed = sim.db.execute(BACKFILL, {"batch": case["batch"]}).rowcount
            except sqlite3.Error as error:
                sim.fail("backfill", error)
                break
            if changed <= 0:
                break
            sizes.append(changed)
            sim.traffic("backfill", ["v1"])
        sim.migrate("release 2", RELEASE_2)
        for _ in range(case["ticks"]):
            sim.traffic("release 2 rollout", ["v1", "v2"])
        for _ in range(case["ticks"]):
            sim.traffic("release 3 rollout", ["v2", "v3"])
        sim.migrate("contract", CONTRACT)
        for _ in range(case["ticks"]):
            sim.traffic("after contract", ["v3"])
        columns = sim.columns()
        missing = sim.db.execute("SELECT count(*) FROM orders WHERE phone_e164 IS NULL").fetchone()[0] \
            if "phone_e164" in columns else None
        print(json.dumps({
            "errors": sim.errors[:3],
            "wrong_reads": sim.wrong_reads,
            "batches": len(sizes),
            "largest_batch": max(sizes, default=0),
            "columns": columns,
            "missing_e164": missing,
        }))
    except NameError as error:
        print(json.dumps({"error": f"NameError: {error}"}))
