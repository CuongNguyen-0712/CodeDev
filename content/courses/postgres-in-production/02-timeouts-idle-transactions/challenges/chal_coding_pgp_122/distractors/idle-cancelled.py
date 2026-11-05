# @piece idle-in-transaction: End sessions idle in a transaction too long
if state in ("idle in transaction", "idle in transaction (aborted)"):
    idle_for = now - row["state_change"]
    if idle_for > limits["idle_in_transaction_s"]:
        cancel.append([row["pid"], f"idle in transaction for {idle_for}s"])
        roles.add(row["usename"])
