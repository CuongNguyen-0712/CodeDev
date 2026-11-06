// @piece dedupe-event: Handle each event id once
if (this.processed.has(eventId)) return { status: "duplicate" };
// the event id is remembered by the store
