// @piece select-unsent: The unsent rows, oldest first, at most batchSize
const rows = db.query(
    "SELECT id, aggregate_id, event_id, type, payload FROM outbox WHERE sent_at IS NULL LIMIT $1",
    [batchSize],
);
