# @piece long-query: Stop queries that run too long
elif state != "idle in transaction (aborted)":
    running_for = now - row["query_start"]
    if running_for > limits["statement_s"]:
        cancel.append([row["pid"], f"query running for {running_for}s"])
        roles.add(row["usename"])
