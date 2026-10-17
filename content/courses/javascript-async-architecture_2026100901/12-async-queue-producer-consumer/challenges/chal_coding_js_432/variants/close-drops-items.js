// Wrong variant: close() ends the stream immediately - buffered and waiting items are lost.
function createAsyncQueue({ capacity }) {
  const buffer = [];
  const waitingPushers = [];
  const waitingPullers = [];
  let closed = false;
  const pull = () => {
    if (closed) return Promise.resolve({ value: undefined, done: true });
    if (buffer.length > 0) {
      const value = buffer.shift();
      if (waitingPushers.length > 0) {
        const next = waitingPushers.shift();
        buffer.push(next.item);
        next.resolve();
      }
      return Promise.resolve({ value, done: false });
    }
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
      while (waitingPullers.length > 0) waitingPullers.shift()({ value: undefined, done: true });
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
