// @piece backoff: How long to wait before the next attempt
function backoffDelay(error, attempt) {
  if (typeof error?.retryAfterMs === "number") return error.retryAfterMs;
  return Math.min(maxDelayMs, baseMs * 2 ** (attempt - 1));
}
