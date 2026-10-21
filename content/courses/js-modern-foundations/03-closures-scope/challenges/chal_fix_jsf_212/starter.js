/**
 * Registers one delayed retry per failed notification.
 *
 * Contract:
 *   - pending is the widget's queue of failed notifications: [{ userId, messageId }, ...].
 *   - For the notification at position i, call schedule(callback, baseDelayMs * (i + 1)) once.
 *     schedule works like setTimeout: the callback runs LATER, after this function has returned.
 *   - When a retry runs, it calls send(userId, messageId) for ITS OWN notification, exactly once.
 *   - Return { cancel(messageId) }: a cancelled notification is not sent when its retry runs.
 *     Cancelling one notification never affects the others.
 *   - The widget empties its `pending` queue as soon as this function returns, so a retry must
 *     not depend on what is in `pending` when it runs.
 *
 * BUG: after last night's push outage, every retry sent the same message. The user at the end
 * of the queue got their reminder five times, the four others never got one, and support says
 * the "Cancel reminder" button cancels either everything or nothing.
 *
 * @param {{ userId: string, messageId: string }[]} pending
 * @param {{
 *   schedule: (callback: () => void, delayMs: number) => void,
 *   send: (userId: string, messageId: string) => void,
 *   baseDelayMs: number,
 * }} options
 * @returns {{ cancel: (messageId: string) => void }}
 */
function scheduleRetries(pending, { schedule, send, baseDelayMs }) {
  var cancelled = new Set();

  for (var i = 0; i < pending.length; i++) {
    var item = pending[i];
    schedule(function () {
      if (cancelled.has(item.messageId)) return;
      send(item.userId, item.messageId);
    }, baseDelayMs * (i + 1));
  }

  return {
    cancel: function (messageId) {
      cancelled.add(messageId);
    },
  };
}
