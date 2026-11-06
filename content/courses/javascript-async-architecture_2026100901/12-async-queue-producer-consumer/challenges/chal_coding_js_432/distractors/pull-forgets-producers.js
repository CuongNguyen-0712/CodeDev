// @piece pull: Take an item, or wait for one
function pull() {
  if (buffer.length > 0) return Promise.resolve({ value: buffer.shift(), done: false });
  if (closed) return Promise.resolve({ value: undefined, done: true });
  return new Promise((resolve) => waitingPullers.push(resolve));
}
