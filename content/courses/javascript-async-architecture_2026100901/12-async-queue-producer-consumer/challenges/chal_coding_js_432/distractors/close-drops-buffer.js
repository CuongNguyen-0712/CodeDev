// @piece close: Close the queue
function close() {
  if (closed) return;
  closed = true;
  buffer.length = 0;
  while (waitingPullers.length > 0) waitingPullers.shift()({ value: undefined, done: true });
}
