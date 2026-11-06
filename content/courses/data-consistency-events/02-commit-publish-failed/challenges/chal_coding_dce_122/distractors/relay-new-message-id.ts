// @piece relay: Relay what is waiting to the broker
const pending = db.tx((t) => [...t.outbox.values()].filter((r) => r.status === "pending"));
for (const row of pending) {
    // The message id is the outbox id: a re-publish after a crash is a duplicate the consumer drops.
    broker.publish(TOPIC, { id: ids.next("msg"), key: row.aggregateId, type: row.eventType, payload: row.payload });
    db.tx((t) => {
        const r = t.outbox.get(row.id);
        if (r) {
            r.status = "sent";
            r.sentAt = clock.now();
        }
    });
}
if (pending.length) log(`relayed ${pending.length} event(s)`);
