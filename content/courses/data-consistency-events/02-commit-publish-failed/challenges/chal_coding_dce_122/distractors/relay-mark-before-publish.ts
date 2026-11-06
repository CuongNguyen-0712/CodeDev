// @piece relay: Relay what is waiting to the broker
const pending = db.tx((t) => {
    const rows = [...t.outbox.values()].filter((r) => r.status === "pending");
    for (const r of rows) {
        r.status = "sent";
        r.sentAt = clock.now();
    }
    return rows;
});
for (const row of pending) {
    // The message id is the outbox id: a re-publish after a crash is a duplicate the consumer drops.
    broker.publish(TOPIC, { id: row.id, key: row.aggregateId, type: row.eventType, payload: row.payload });
}
if (pending.length) log(`relayed ${pending.length} event(s)`);
