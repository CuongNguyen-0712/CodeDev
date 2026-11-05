// @piece commit-on-revoke: Save the progress of the partitions being taken away
for (const p of partitions) {
    const next = position.get(p);
    if (next !== undefined) broker.commit(GROUP, TOPIC, p, next);
}
