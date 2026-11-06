# @piece ledger-write: Write the successful charge to the ledger
await deps.ledger.record(order["id"], charge)
