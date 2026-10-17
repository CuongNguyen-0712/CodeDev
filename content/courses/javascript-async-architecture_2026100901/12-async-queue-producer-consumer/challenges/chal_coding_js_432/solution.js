/**
 * Reference solution (never shipped to learners).
 */
function createAsyncQueue({ capacity }) {
  const limit = Math.max(1, Math.floor(capacity) || 1);
  const buffer = [];
  const waitingPushers = []; // { item, resolve } - producers waiting for room
  const waitingPullers = []; // resolve functions - consumers waiting for an item
  let closed = false;

  function push(item) {
    if (closed) return Promise.reject(new Error("QUEUE_CLOSED"));
    if (waitingPullers.length > 0) {
      // A consumer is already waiting: hand the item over directly.
      waitingPullers.shift()({ value: item, done: false });
      return Promise.resolve();
    }
    if (buffer.length < limit) {
      buffer.push(item);
      return Promise.resolve();
    }
    return new Promise((resolve) => waitingPushers.push({ item, resolve }));
  }

  function pull() {
    if (buffer.length > 0) {
      const value = buffer.shift();
      if (waitingPushers.length > 0) {
        // A slot just freed up: admit the oldest waiting producer.
        const next = waitingPushers.shift();
        buffer.push(next.item);
        next.resolve();
      }
      return Promise.resolve({ value, done: false });
    }
    if (closed) return Promise.resolve({ value: undefined, done: true });
    return new Promise((resolve) => waitingPullers.push(resolve));
  }

  function close() {
    if (closed) return;
    closed = true;
    // Waiting consumers only exist while the buffer is empty: nothing more will come.
    while (waitingPullers.length > 0) waitingPullers.shift()({ value: undefined, done: true });
  }

  return {
    push,
    pull,
    close,
    async *[Symbol.asyncIterator]() {
      while (true) {
        const result = await pull();
        if (result.done) return;
        yield result.value;
      }
    },
  };
}
