/**
 * Outbox sync client for an offline-first app. Edits are queued locally with enqueue()
 * and pushed to the server by flush() (called on the "online" event, a timer, or a
 * "Sync now" button).
 *
 * Requirements:
 *   enqueue({ id, recordId, patch })
 *     - Coalescing: if the newest outbox entry for `recordId` has NEVER been sent (not in
 *       flight, never attempted), shallow-merge the new patch into it ({ ...old, ...new });
 *       that entry keeps its own id and its place in the outbox.
 *     - Otherwise append a new entry. An entry that was sent once - even if it failed - is
 *       never changed again: the server may already have applied it under that id.
 *
 *   flush() -> Promise<{ sent: string[], failed: { id: string, error: string }[], pending: string[] }>
 *     - Calls send({ id, recordId, patch }) for outbox entries, in outbox order.
 *     - Per record, strictly one at a time and in order: never two calls in flight for the
 *       same recordId. Different records run concurrently, at most `maxInFlight` at once.
 *     - send resolves      -> remove the entry, add its id to `sent`.
 *       error.retryable === false -> remove it, add { id, error: error.message } to `failed`.
 *       any other error (retryable: true, or no flag at all, e.g. a TypeError when offline)
 *                        -> keep the entry for the next flush and send nothing more for that
 *                           record during this flush (its later edits must wait behind it).
 *     - Mutations enqueued while a flush is running are sent by that same flush once their
 *       record is free.
 *     - The promise resolves when nothing more can be sent. `sent` and `failed` are in the
 *       order the calls finished; `pending` lists the ids still in the outbox, in order.
 *     - Calling flush() while a flush is running must not start a second one: return the
 *       running flush's promise.
 *
 * @typedef {{ id: string, recordId: string, patch: Record<string, unknown> }} Mutation
 * @typedef {{ sent: string[], failed: { id: string, error: string }[], pending: string[] }} FlushSummary
 *
 * @param {{ send: (mutation: Mutation) => Promise<unknown>, maxInFlight?: number }} options
 * @returns {{ enqueue(mutation: Mutation): void, flush(): Promise<FlushSummary> }}
 */
function createSyncClient({ send, maxInFlight = 4 }) {
  /** @type {Array<Mutation & { attempted: boolean, inFlight: boolean }>} */
  const outbox = [];
  let running = null;

  function enqueue({ id, recordId, patch }) {
    // [ ] Merge into the record's newest unsent entry, or append
  }

  function flush() {
    if (running) return running;

    running = new Promise((resolve) => {
      const summary = { sent: [], failed: [], pending: [] };
      const busy = new Set();      // records with a mutation in flight
      const blocked = new Set();   // records that hit a transient error in this flush
      let inFlight = 0;

      const remove = (entry) => outbox.splice(outbox.indexOf(entry), 1);

      function start(entry) {
        entry.inFlight = true;
        entry.attempted = true;
        busy.add(entry.recordId);
        inFlight++;

        // [ ] Send the mutation and sort out its outcome
      }

      function pump() {
        // [ ] Start what may start now, or finish the flush
      }

      pump();
    });

    return running;
  }

  return { enqueue, flush };
}
