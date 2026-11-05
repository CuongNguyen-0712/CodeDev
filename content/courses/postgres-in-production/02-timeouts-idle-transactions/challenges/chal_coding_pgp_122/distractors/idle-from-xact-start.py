# @piece idle-in-transaction: End sessions idle in a transaction too long
if state in ("idle in transaction", "idle in transaction (aborted)"):
    idle_for = now - row["xact_start"]
    if idle_for > limits["idle_in_transaction_s"]:
        terminate.append([row["pid"], f"idle in transaction for {idle_for}s"])
        roles.add(row["usename"])
