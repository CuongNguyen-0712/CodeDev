// Harness: Fix the retry scheduler
// schedule() is a fake timer: it only records the callback and its delay. After scheduleRetries
// returns, the harness optionally empties the pending queue (input.clearQueue) and cancels the
// ids in input.cancel, then runs the callbacks by delay (ties in scheduling order) on a virtual
// clock. Output: every send as "<userId> <- <messageId> @<virtual ms>", in the order sent.
async function __harness(input) {
    const pending = input.pending.map(([userId, messageId]) => ({ userId, messageId }));
    const timers = [];
    const sent = [];
    let now = 0;

    const api = scheduleRetries(pending, {
        schedule: (callback, delayMs) => timers.push({ callback, at: delayMs, seq: timers.length }),
        send: (userId, messageId) => sent.push(`${userId} <- ${messageId} @${now}`),
        baseDelayMs: input.baseDelayMs,
    });

    if (input.clearQueue) pending.length = 0; // the widget empties its queue right away
    for (const messageId of input.cancel || []) api.cancel(messageId);

    timers.sort((a, b) => a.at - b.at || a.seq - b.seq);
    for (const timer of timers) {
        now = timer.at;
        timer.callback();
    }
    return sent;
}
