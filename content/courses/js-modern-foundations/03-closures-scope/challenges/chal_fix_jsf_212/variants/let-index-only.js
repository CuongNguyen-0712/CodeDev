// Wrong variant: the loop counter is block-scoped now, but `item` is still a single
// function-scoped var, so every callback still reads the last notification.
function scheduleRetries(pending, { schedule, send, baseDelayMs }) {
  const cancelled = new Set();
  for (let i = 0; i < pending.length; i++) {
    var item = pending[i];
    schedule(() => {
      if (cancelled.has(item.messageId)) return;
      send(item.userId, item.messageId);
    }, baseDelayMs * (i + 1));
  }
  return { cancel(messageId) { cancelled.add(messageId); } };
}
