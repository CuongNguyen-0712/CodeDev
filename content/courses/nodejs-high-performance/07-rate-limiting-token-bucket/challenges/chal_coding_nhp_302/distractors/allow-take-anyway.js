// @piece allow: Allow the request when there are enough tokens
tokens -= cost;
if (tokens >= 0) {
  return { allowed: true, retryAfterMs: 0 };
}
