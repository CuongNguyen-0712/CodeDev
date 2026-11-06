// @piece purge: Purge dead letters older than the limit
const limit = olderThanDays * MINUTES_PER_DAY;
const events: string[] = [];
state.dlq = state.dlq.filter((d) => {
    if (state.now - d.lastFailedAt < limit) return true;
    events.push(`purged ${d.id}`);
    state.redrivePending = state.redrivePending.filter((id) => id !== d.id);
    return false;
});
return events;
