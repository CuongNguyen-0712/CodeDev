// Wrong variant: close() only sets a flag - consumers already waiting on an empty queue hang forever.
function createAsyncQueue({ capacity }) {
  const buffer = [];
  const waitingPushers = [];
  const waitingPullers = [];
  let closed = false;
  const pull = () => {
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
  };
  return {
    push(item) {
      if (closed) return Promise.reject(new Error("QUEUE_CLOSED"));
      if (waitingPullers.length > 0) {
        waitingPullers.shift()({ value: item, done: false });
        return Promise.resolve();
      }
      if (buffer.length < capacity) {
        buffer.push(item);
        return Promise.resolve();
      }
      return new Promise((resolve) => waitingPushers.push({ item, resolve }));
    },
    pull,
    close() {
      closed = true;
    },
    async *[Symbol.asyncIterator]() {
      while (true) {
        const r = await pull();
        if (r.done) return;
        yield r.value;
      }
    },
  };
}
