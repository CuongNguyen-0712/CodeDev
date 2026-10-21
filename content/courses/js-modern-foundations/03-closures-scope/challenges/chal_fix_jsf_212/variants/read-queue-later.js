// Wrong variant: each callback captures its own `i`, but reads pending[i] only when it runs.
// The closure captured the array variable, not the notification: once the widget empties
// its queue, pending[i] is undefined and the retry crashes.
function scheduleRetries(pending, { schedule, send, baseDelayMs }) {
  const cancelled = new Set();
  for (let i = 0; i < pending.length; i++) {
    schedule(() => {
      if (cancelled.has(pending[i].messageId)) return;
      send(pending[i].userId, pending[i].messageId);
    }, baseDelayMs * (i + 1));
  }
  return { cancel(messageId) { cancelled.add(messageId); } };
}
