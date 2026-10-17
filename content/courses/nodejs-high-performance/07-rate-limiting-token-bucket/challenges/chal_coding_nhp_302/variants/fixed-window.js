// Wrong variant: a fixed one-second window that resets to full -> 2x capacity at a window boundary.
function createTokenBucket({ capacity }, now) {
  let windowStart = Math.floor(now() / 1000);
  let tokens = capacity;
  return {
    take(cost = 1) {
      const window = Math.floor(now() / 1000);
      if (window !== windowStart) {
        windowStart = window;
        tokens = capacity;
      }
      if (tokens >= cost) {
        tokens -= cost;
        return { allowed: true, retryAfterMs: 0 };
      }
      return { allowed: false, retryAfterMs: (window + 1) * 1000 - now() };
    },
  };
}
