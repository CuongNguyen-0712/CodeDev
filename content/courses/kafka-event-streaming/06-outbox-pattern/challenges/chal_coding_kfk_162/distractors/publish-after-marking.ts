// @piece publish-batch: Publish the rows to orders.v1, keyed by order
db.query("UPDATE outbox SET sent_at = now() WHERE id = ANY($1)", [rows.map((row) => row.id)]);
producer.send("orders.v1", rows.map((row) => ({
    key: row.aggregateId,
    value: row.payload,
    headers: { "event-id": row.eventId, "event-type": row.type },
})));
