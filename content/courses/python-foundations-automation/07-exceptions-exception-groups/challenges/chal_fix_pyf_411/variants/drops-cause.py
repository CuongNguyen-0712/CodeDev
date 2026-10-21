# Known wrong: catches Exception and builds a new PriceError without `from err`, so __cause__ is None and the KeyError/ValueError is lost.
"""
Nightly price update for Lotus Mart: apply the rows of the supplier's price sheet to the catalog.

Every row is a dict of text from the sheet: {"sku": "TEA-01", "price": "45000"} (prices in VND).
Rows are numbered from 1, in sheet order.

Requirements:
  - Check EVERY row. A good row sets catalog[sku] = price (sku without surrounding spaces,
    price as an int). Bad rows never touch the catalog and are never counted as updated.
  - A bad row becomes one PriceError (the class below, do not change it) with these messages:
      * a "sku" or "price" field is missing -> "row 4: missing field 'price'"
        and its __cause__ is the original KeyError;
      * the price is not a whole number    -> "row 2: price is not a whole number: '45,000'"
        (the original text, quoted with !r) and its __cause__ is the original ValueError;
      * the price is 0 or negative          -> "row 5: price must be positive, got -100"
        (nothing went wrong in Python here, so this one has no __cause__).
    Spaces around a number are fine: int(" 52000 ") is 52000.
  - If no row is bad, return the number of updated rows.
  - Otherwise, after applying the good rows, raise ONE ExceptionGroup with the message
    "<bad> of <total> rows invalid" that holds every PriceError in row order.

Example: rows = [{"sku": "TEA-01", "price": "45000"}, {"sku": "COF-02", "price": "45,000"}]
  -> catalog["TEA-01"] becomes 45000, then
     ExceptionGroup("1 of 2 rows invalid", [PriceError for row 2, caused by the ValueError])
"""
import json
import sys


class PriceError(Exception):
    """One bad row of the price sheet. The original error (if any) is its __cause__."""

    def __init__(self, row, message):
        super().__init__(f"row {row}: {message}")
        self.row = row


def import_prices(rows, catalog):
    errors = []
    updated = 0
    for number, row in enumerate(rows, start=1):
        try:
            sku = row["sku"].strip()
            text = row["price"]
            price = int(text)
            if price <= 0:
                raise PriceError(number, f"price must be positive, got {price}")
        except PriceError as err:
            errors.append(err)
        except Exception as err:
            if isinstance(err, KeyError):
                errors.append(PriceError(number, f"missing field {err}"))
            else:
                errors.append(PriceError(number, f"price is not a whole number: {text!r}"))
        else:
            catalog[sku] = price
            updated += 1
    if errors:
        raise ExceptionGroup(f"{len(errors)} of {len(rows)} rows invalid", errors)
    return updated


# ---------------------------------------------------------------- test runner (do not change)
# Reads one test case (JSON: {"catalog": {...}, "rows": [...]}) from stdin, runs the import the
# way the nightly job does, and prints what the job would report as JSON.
if __name__ == "__main__":
    case = json.load(sys.stdin)
    catalog = case["catalog"]
    report = {"updated": None, "group": None, "errors": [], "catalog": catalog}
    try:
        report["updated"] = import_prices(case["rows"], catalog)
    except* PriceError as group:
        report["group"] = group.message
        for error in group.exceptions:
            cause = error.__cause__
            report["errors"].append({
                "row": error.row,
                "message": str(error),
                "cause": type(cause).__name__ if cause is not None else None,
            })
    print(json.dumps(report, ensure_ascii=False))
