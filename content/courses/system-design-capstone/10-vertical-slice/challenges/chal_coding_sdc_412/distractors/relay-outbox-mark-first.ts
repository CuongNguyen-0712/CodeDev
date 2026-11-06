// @piece relay-outbox: Publish the unpublished outbox rows in order
for (const row of ctx.store.unpublished()) {
    ctx.store.markPublished(row.seq);
    ctx.bus.publish(row.event);
}
