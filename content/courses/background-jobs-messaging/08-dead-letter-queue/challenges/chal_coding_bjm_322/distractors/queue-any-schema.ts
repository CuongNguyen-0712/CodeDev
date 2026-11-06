// @piece queue-redrives: Queue each chosen letter, if it may go back
const events: string[] = [];
for (const id of selected) {
    const dead = state.dlq.find((d) => d.id === id);
    if (!dead) events.push(`${id}: not in the DLQ`);
    else if (state.redrivePending.includes(id)) events.push(`${id}: already queued for redrive`);
    else {
        state.redrivePending.push(id);
        events.push(`${id}: queued for redrive`);
    }
}
