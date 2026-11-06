// @piece retry-later: Temporary failure: wait longer each time, as asked
if (answer.status === 408 || answer.status === 429 || answer.status >= 500) {
    entry.attempts += 1;
    entry.nextAttemptAt = now + 1000 * 2 ** (entry.attempts - 1);
    store.update(entry);
    waiting.add(entry.deliveryId);
    continue;
}
