// Wrong variant: push never waits, so a fast producer fills memory without limit.
function createAsyncQueue() {
  const buffer = [];
  const waitingPullers = [];
  let closed = false;
  const pull = () => {
    if (buffer.length > 0) return Promise.resolve({ value: buffer.shift(), done: false });
    if (closed) return Promise.resolve({ value: undefined, done: true });
    return new Promise((resolve) => waitingPullers.push(resolve));
  };
  return {
    push(item) {
      if (closed) return Promise.reject(new Error("QUEUE_CLOSED"));
      if (waitingPullers.length > 0) waitingPullers.shift()({ value: item, done: false });
      else buffer.push(item);
      return Promise.resolve();
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
