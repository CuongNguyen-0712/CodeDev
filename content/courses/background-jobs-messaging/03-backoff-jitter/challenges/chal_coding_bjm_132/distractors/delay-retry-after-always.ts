// @piece delay: Pick the delay for the next attempt
const capped = Math.min(maxDelayMs, baseDelayMs * 2 ** (n - 1));
let delayMs = Math.floor(random() * capped);
if (error.retryAfterMs !== undefined) delayMs = error.retryAfterMs;
