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

  function enqueue({ id, recordId, patch }) {
    // TODO: coalesce into the newest never-sent entry of this record, or append
  }

  function flush() {
    // TODO: send per record in order, at most maxInFlight records at once,
    // classify errors, and resolve with the summary
    return Promise.resolve({ sent: [], failed: [], pending: outbox.map((entry) => entry.id) });
  }

  return { enqueue, flush };
}
