// Wrong variant: treats the symptom. A "sent" guard stops the duplicates, so the last user
// gets one reminder instead of five - but the shared `item` is still there and the four
// other users still get nothing.
function scheduleRetries(pending, { schedule, send, baseDelayMs }) {
  var cancelled = new Set();
  var sentIds = new Set();
  for (var i = 0; i < pending.length; i++) {
    var item = pending[i];
    schedule(function () {
      if (cancelled.has(item.messageId) || sentIds.has(item.messageId)) return;
      sentIds.add(item.messageId);
      send(item.userId, item.messageId);
    }, baseDelayMs * (i + 1));
  }
  return { cancel: function (messageId) { cancelled.add(messageId); } };
}
