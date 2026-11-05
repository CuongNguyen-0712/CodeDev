// @piece publish-batch: Publish the rows to orders.v1, keyed by order
producer.send("orders.v1", rows.map((row) => ({
    key: null,
    value: row.payload,
    headers: { "event-id": row.eventId, "event-type": row.type },
})));
