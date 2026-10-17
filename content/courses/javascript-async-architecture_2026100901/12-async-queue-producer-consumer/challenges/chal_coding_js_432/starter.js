/**
 * A bounded async queue between producers and consumers.
 *
 *   push(item) -> Promise<void>
 *       resolves at once while the queue has room (or a consumer is already waiting);
 *       when the queue holds `capacity` items it waits until a pull() makes room.
 *       After close() it rejects with new Error("QUEUE_CLOSED").
 *   pull() -> Promise<{ value: T, done: false } | { value: undefined, done: true }>
 *       resolves with the oldest item; waits while the queue is empty.
 *       After close(), items that were already accepted (buffered, or waiting in a
 *       push() called before close) are still delivered; then every pull()
 *       resolves with { done: true }.
 *   close()
 *       no new items; consumers waiting on an empty queue are woken with { done: true }.
 *   [Symbol.asyncIterator]()
 *       so consumers can write: for await (const item of queue) { ... }
 *
 * Items always come out in the order their push() was called.
 *
 * @template T
 * @param {{ capacity: number }} options capacity >= 1
 */
function createAsyncQueue({ capacity }) {
  // TODO: keep the buffered items, the producers waiting for room,
  // the consumers waiting for an item, and whether the queue is closed.

  return {
    /** @param {T} item @returns {Promise<void>} */
    push(item) {
      // TODO
      return Promise.resolve();
    },

    /** @returns {Promise<{ value: T, done: false } | { value: undefined, done: true }>} */
    pull() {
      // TODO
      return new Promise(() => {});
    },

    close() {
      // TODO
    },

    [Symbol.asyncIterator]() {
      // TODO: return an async iterator whose next() is based on pull()
    },
  };
}
