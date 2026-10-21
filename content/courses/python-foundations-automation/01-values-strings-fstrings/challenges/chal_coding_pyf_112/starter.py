"""
Turn order lines pasted into the Lotus Mart team chat into an aligned receipt.

Every line of `text` is one order line: product name | quantity | unit price (VND).

Requirements:
  - Blank lines (empty or only spaces) are ignored.
  - Any other line is valid only when ALL of these hold:
      * it has exactly 3 fields separated by "|";
      * the name, with the spaces around it removed, is not empty;
      * the quantity, with spaces removed, is only the digits 0-9 and is at least 1
        ("2.5", "two", "+2", "-1" and "0" are invalid);
      * the price, with spaces removed, may end with "đ" (with or without a space before it)
        and may use "," or "." as thousands separators ("210,000", "210.000", "210.000 đ");
        without them it must be only the digits 0-9 (0 is allowed: free gifts).
  - Every valid line becomes one receipt line:
        name      left-aligned in 16 characters (cut to 16 if longer)
        " "       one space
        quantity  right-aligned in 3
        " x "
        price     right-aligned in 9, with "," as thousands separator
        " "       one space
        amount    (quantity x price) right-aligned in 11, with "," as thousands separator
  - The total line is "TOTAL" left-aligned in 33 characters, then the sum of all amounts
    right-aligned in 11 with "," separators, so it ends under the amount column.
  - "skipped" lists the line numbers (1 = first line of text, blank lines count) of the
    invalid lines.

Example: build_receipt("  Green tea 500ml |  2 | 35,000 \n\nTote bag | 35000")
  -> {"lines": ["Green tea 500ml    2 x    35,000      70,000"],
      "total": "TOTAL                                 70,000",
      "skipped": [3]}
"""
import json
import sys


def build_receipt(text: str) -> dict:
    # Naive version: trusts every line and glues the text together.
    lines = []
    total = 0
    for raw in text.splitlines():
        name, qty, price = raw.split("|")
        lines.append(name + " " + qty + " x " + price)
        total = total + int(qty) * int(price)
    return {"lines": lines, "total": "TOTAL " + str(total), "skipped": []}


# ---------------------------------------------------------------- test runner (do not change)
# Reads one test case (JSON) from stdin and prints the result as JSON.
if __name__ == "__main__":
    case = json.load(sys.stdin)
    print(json.dumps(build_receipt(**case)))
