// @piece redrive-batch: Move a limited batch of redrives back
const batch = state.redrivePending.splice(0);
for (const id of batch) {
    const index = state.dlq.findIndex((d) => d.id === id);
    if (index < 0) continue;
    if (state.main.some((m) => m.id === id)) {
        events.push(`${id}: already in the main queue, left in the DLQ`);
        continue;
    }
    const [dead] = state.dlq.splice(index, 1);
    state.main.push({ id: dead.id, schema: dead.schema, body: dead.body, attempts: 0, firstFailedAt: null, lastFailedAt: null, lastError: null });
    events.push(`redriven ${id}`);
}
