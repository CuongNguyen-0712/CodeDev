"""
Partner restaurants send their menus as CSV exports from their POS vendor. The loader puts them into
the warehouse staging table stg_menu_items, keyed by (restaurant_id, item_code). Overnight the vendor
renamed `price` to `unit_price`, moved it to another position and added `discount_vnd`; the old
loader read columns by position and loaded prices into the wrong column without a single error.

Requirements for load_file(wh, header, rows):
  - Match file columns to table columns by name (case and surrounding spaces ignored), accepting the
    aliases in CONTRACT; never by position.
  - A file without a required column is refused: return {"status": "rejected", "reason": ...} and
    change nothing.
  - A column the table does not know yet is added to the table (nullable TEXT) and reported in
    "new_columns"; its values are loaded.
  - Each row is converted by the contract's types; an empty required value or a value that does not
    convert makes the row bad ("line <n>: <column> ...", the header is line 1).
  - More than 5% bad rows refuses the whole file; otherwise the good rows are upserted in one
    transaction and the bad ones listed in "rejected_rows".
"""
import json
import sqlite3
import sys

CONTRACT = {
    "restaurant_id": {"type": "int", "required": True, "aliases": []},
    "item_code": {"type": "str", "required": True, "aliases": ["sku"]},
    "item_name": {"type": "str", "required": True, "aliases": ["name"]},
    "price_vnd": {"type": "int", "required": True, "aliases": ["price", "unit_price"]},
    "available": {"type": "bool", "required": False, "aliases": []},
}


def convert(kind, value):
    text = str(value).strip()
    if text == "":
        return None
    if kind == "int":
        return int(text)
    if kind == "bool":
        if text.lower() in ("true", "1", "yes"):
            return 1
        if text.lower() in ("false", "0", "no"):
            return 0
        raise ValueError(text)
    return text


def resolve(header):
    mapping = {}
    # [ ] Match each file column to a table column
    return mapping


def load_file(wh, header, rows):
    mapping = resolve(header)
    present = set(mapping.values())
    # [ ] Refuse a file without a required column

    good, bad = [], []
    for line, row in enumerate(rows, start=2):
        error = None
        record = {}
        # [ ] Convert one row by the contract, or record why not
        if error:
            bad.append(error)
        else:
            good.append(record)

    # [ ] Refuse the file when too many rows are bad

    added = []
    with wh:
        # [ ] Add the columns the table does not know yet
        table_columns = {r[1] for r in wh.execute("PRAGMA table_info(stg_menu_items)")}
        for record in good:
            cols = [c for c in record if c in table_columns]
            updates = ", ".join(f'"{c}" = excluded."{c}"' for c in cols if c not in ("restaurant_id", "item_code"))
            wh.execute(
                f'INSERT INTO stg_menu_items ({", ".join(chr(34) + c + chr(34) for c in cols)}) '
                f'VALUES ({", ".join("?" for _ in cols)}) '
                f"ON CONFLICT (restaurant_id, item_code) DO UPDATE SET {updates}",
                [record[c] for c in cols],
            )
    return {"status": "loaded", "loaded": len(good), "rejected_rows": bad, "new_columns": added}


# ---------------------------------------------------------------- test runner (do not change)
# Input: {"files": [{"header": [...], "rows": [[...], ...]}]}, loaded in order. Prints the result of
# each file, the table's columns and its rows (ordered by restaurant_id, item_code).
if __name__ == "__main__":
    case = json.load(sys.stdin)
    wh = sqlite3.connect(":memory:")
    wh.execute("""CREATE TABLE stg_menu_items (
        restaurant_id INTEGER NOT NULL,
        item_code     TEXT    NOT NULL,
        item_name     TEXT    NOT NULL,
        price_vnd     INTEGER NOT NULL,
        available     INTEGER,
        PRIMARY KEY (restaurant_id, item_code))""")
    wh.commit()
    results = []
    for f in case["files"]:
        try:
            results.append(load_file(wh, f["header"], f["rows"]))
        except sqlite3.Error as error:
            if wh.in_transaction:
                wh.rollback()
            results.append({"status": "error", "reason": str(error)})
    columns = [r[1] for r in wh.execute("PRAGMA table_info(stg_menu_items)")]
    rows = wh.execute("SELECT * FROM stg_menu_items ORDER BY restaurant_id, item_code").fetchall()
    print(json.dumps({"results": results, "columns": columns, "rows": [list(r) for r in rows]}))
