/**
 * Reference solution (never shipped to learners).
 */
function scheduleRetries(pending, { schedule, send, baseDelayMs }) {
  const cancelled = new Set();

  for (let i = 0; i < pending.length; i++) {
    const item = pending[i]; // a new binding per iteration, holding this notification
    schedule(() => {
      if (cancelled.has(item.messageId)) return;
      send(item.userId, item.messageId);
    }, baseDelayMs * (i + 1));
  }

  return {
    cancel(messageId) {
      cancelled.add(messageId);
    },
  };
}
