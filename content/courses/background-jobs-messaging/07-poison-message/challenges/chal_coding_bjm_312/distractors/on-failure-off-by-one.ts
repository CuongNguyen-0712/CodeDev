// @piece on-failure: What happens after a failed attempt
if (head.attempts > MAX_ATTEMPTS) {
    w.queue.shift();
    w.dlq.push({ id: head.id, attempts: head.attempts, lastError: head.lastError, at: now });
    return;
}
head.notBefore = now + RETRY_DELAY_SECONDS;
