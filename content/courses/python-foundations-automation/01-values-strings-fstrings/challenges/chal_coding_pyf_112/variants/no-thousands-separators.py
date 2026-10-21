# Known wrong: never removes the "," / "." thousands separators or the "đ", so "35,000" is not digits and real orders are skipped.
import json
import sys


def build_receipt(text: str) -> dict:
    lines = []
    skipped = []
    total = 0
    for number, raw in enumerate(text.splitlines(), start=1):
        if not raw.strip():
            continue  # blank lines are not orders
        fields = raw.split("|")
        if len(fields) != 3:
            skipped.append(number)
            continue
        name = fields[0].strip()
        qty_text = fields[1].strip()
        price_text = fields[2].strip()
        # isdecimal(), not int(): int() also accepts "+2", "-1" and "1_000"
        if not name or not qty_text.isdecimal() or not price_text.isdecimal():
            skipped.append(number)
            continue
        qty = int(qty_text)
        price = int(price_text)
        if qty < 1:
            skipped.append(number)
            continue
        amount = qty * price
        total += amount
        lines.append(f"{name:<16.16} {qty:>3} x {price:>9,} {amount:>11,}")
    return {"lines": lines, "total": f"{'TOTAL':<33}{total:>11,}", "skipped": skipped}


# ---------------------------------------------------------------- test runner (do not change)
# Reads one test case (JSON) from stdin and prints the result as JSON.
if __name__ == "__main__":
    case = json.load(sys.stdin)
    print(json.dumps(build_receipt(**case)))
