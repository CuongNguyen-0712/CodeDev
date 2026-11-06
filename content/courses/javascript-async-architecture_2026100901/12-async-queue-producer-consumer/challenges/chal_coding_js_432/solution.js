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
  // @piece state: Buffered items, waiting producers and consumers
  const limit = Math.max(1, Math.floor(capacity) || 1);
  const buffer = [];
  const waitingPushers = []; // { item, resolve } - producers waiting for room
  const waitingPullers = []; // resolve functions - consumers waiting for an item
  let closed = false;
  // @end

  // @piece push: Add an item, or wait for room
  function push(item) {
    if (closed) return Promise.reject(new Error("QUEUE_CLOSED"));
    if (waitingPullers.length > 0) {
      waitingPullers.shift()({ value: item, done: false });
      return Promise.resolve();
    }
    if (buffer.length < limit) {
      buffer.push(item);
      return Promise.resolve();
    }
    return new Promise((resolve) => waitingPushers.push({ item, resolve }));
  }
  // @end

  // @piece pull: Take an item, or wait for one
  function pull() {
    if (buffer.length > 0) {
      const value = buffer.shift();
      if (waitingPushers.length > 0) {
        const next = waitingPushers.shift();
        buffer.push(next.item);
        next.resolve();
      }
      return Promise.resolve({ value, done: false });
    }
    if (closed) return Promise.resolve({ value: undefined, done: true });
    return new Promise((resolve) => waitingPullers.push(resolve));
  }
  // @end

  // @piece close: Close the queue
  function close() {
    if (closed) return;
    closed = true;
    while (waitingPullers.length > 0) waitingPullers.shift()({ value: undefined, done: true });
  }
  // @end

  return {
    push,
    pull,
    close,
    // @piece iterate: Iterate the queue with for await
    async *[Symbol.asyncIterator]() {
      while (true) {
        const result = await pull();
        if (result.done) return;
        yield result.value;
      }
    },
    // @end
  };
}
