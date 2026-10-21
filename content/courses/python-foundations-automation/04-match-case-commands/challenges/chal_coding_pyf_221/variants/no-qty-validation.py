# Known wrong: checks that qty is made of digits but not that it is above 0, and binds the event's sku and qty without checking their types, so 0 units and a text qty are accepted.
import json
import sys

QTY_ERROR = {"action": "error", "message": "qty must be a positive integer"}


def parse_qty(text: str) -> int | None:
    """Return the quantity if `text` is a positive whole number written with digits, else None."""
    if not (text.isascii() and text.isdigit()):
        return None
    return int(text)


def parse_command(message: str | dict) -> dict:
    match message:
        case str():
            words = message.split()
        case {"type": "restock", "sku": sku, "qty": qty}:
            return {"action": "restock", "sku": sku, "qty": qty}
        case {"type": "restock"}:
            return {"action": "error", "message": "bad restock event"}
        case _:
            return {"action": "unknown", "command": None}

    match words:
        case []:
            return {"action": "ignore"}
        case ["/help" | "/?", *_]:
            return {"action": "help"}
        case ["/stock", sku]:
            return {"action": "stock", "sku": sku}
        case ["/restock", sku, qty_text]:
            qty = parse_qty(qty_text)
            if qty is None:
                return QTY_ERROR
            return {"action": "restock", "sku": sku, "qty": qty}
        case ["/refund", order_id, *reason]:
            return {"action": "refund", "order_id": order_id, "reason": " ".join(reason)}
        case ["/stock", *_]:
            return {"action": "error", "message": "usage: /stock SKU"}
        case ["/restock", *_]:
            return {"action": "error", "message": "usage: /restock SKU QTY"}
        case ["/refund"]:
            return {"action": "error", "message": "usage: /refund ORDER_ID [REASON]"}
        case [command, *_]:
            return {"action": "unknown", "command": command}


# ---------------------------------------------------------------- test runner (do not change)
# Reads one test case (a JSON list of messages) from stdin and prints the list of results as JSON.
if __name__ == "__main__":
    messages = json.load(sys.stdin)
    print(json.dumps([parse_command(m) for m in messages], ensure_ascii=False))
