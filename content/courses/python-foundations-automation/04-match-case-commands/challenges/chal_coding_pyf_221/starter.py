"""
Lotus Mart chat bot: turn one incoming message into an action dict.

A message is either chat text typed in the team chat, or a webhook event (a dict) sent
by the warehouse system. Use match/case.

Chat text - split it into words with str.split():
  - no words at all (empty or only spaces)  -> {"action": "ignore"}
  - "/help" or "/?" (extra words ignored)   -> {"action": "help"}
  - "/stock SKU"                            -> {"action": "stock", "sku": SKU}
  - "/restock SKU QTY"                      -> {"action": "restock", "sku": SKU, "qty": QTY as int}
      QTY must be a positive whole number written with the digits 0-9 ("12", "007");
      otherwise -> {"action": "error", "message": "qty must be a positive integer"}
  - "/refund ORDER_ID [REASON...]"          -> {"action": "refund", "order_id": ORDER_ID,
                                                "reason": the remaining words joined by one space, or ""}
  - a known command with the wrong number of words -> a usage error:
      {"action": "error", "message": "usage: /stock SKU"}
      {"action": "error", "message": "usage: /restock SKU QTY"}
      {"action": "error", "message": "usage: /refund ORDER_ID [REASON]"}
  - any other first word -> {"action": "unknown", "command": that word}
  Command words are matched exactly ("/STOCK" is unknown).

Webhook event (dict) - extra keys are allowed:
  - {"type": "restock", "sku": <str>, "qty": <int greater than 0>}
        -> {"action": "restock", "sku": ..., "qty": ...}
  - any other event with "type": "restock" -> {"action": "error", "message": "bad restock event"}
  - any other dict -> {"action": "unknown", "command": None}

Example: parse_command("/refund LM-1043 wrong size sent")
         -> {"action": "refund", "order_id": "LM-1043", "reason": "wrong size sent"}
"""
import json
import sys


def parse_command(message: str | dict) -> dict:
    # Naive version (on purpose): an if/elif chain that trusts every message.
    words = message.split()
    if words[0] == "/stock":
        return {"action": "stock", "sku": words[1]}
    elif words[0] == "/refund":
        return {"action": "refund", "order_id": words[1], "reason": ""}
    elif words[0] == "/help":
        return {"action": "help"}
    else:
        return {"action": "unknown", "command": words[0]}


# ---------------------------------------------------------------- test runner (do not change)
# Reads one test case (a JSON list of messages) from stdin and prints the list of results as JSON.
if __name__ == "__main__":
    messages = json.load(sys.stdin)
    print(json.dumps([parse_command(m) for m in messages], ensure_ascii=False))
