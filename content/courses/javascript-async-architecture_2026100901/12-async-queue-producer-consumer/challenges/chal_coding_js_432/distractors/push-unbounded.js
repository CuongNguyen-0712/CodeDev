// @piece push: Add an item, or wait for room
function push(item) {
  if (closed) return Promise.reject(new Error("QUEUE_CLOSED"));
  if (waitingPullers.length > 0) {
    waitingPullers.shift()({ value: item, done: false });
    return Promise.resolve();
  }
  buffer.push(item);
  return Promise.resolve();
}
