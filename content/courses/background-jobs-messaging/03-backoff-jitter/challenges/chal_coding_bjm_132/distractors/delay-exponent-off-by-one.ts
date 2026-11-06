// @piece delay: Pick the delay for the next attempt
const capped = Math.min(maxDelayMs, baseDelayMs * 2 ** n);
let delayMs = Math.floor(random() * capped);
if (error.retryAfterMs !== undefined && error.retryAfterMs > delayMs) delayMs = error.retryAfterMs;
