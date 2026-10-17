// Wrong variant: refill is never capped -> after a long idle period the client can burst far past capacity.
function createTokenBucket({ capacity, refillPerSecond }, now) {
  let tokens = capacity;
  let last = now();
  return {
    take(cost = 1) {
      const current = now();
      tokens += ((current - last) * refillPerSecond) / 1000;
      last = current;
      if (tokens >= cost) {
        tokens -= cost;
        return { allowed: true, retryAfterMs: 0 };
      }
      return { allowed: false, retryAfterMs: Math.ceil(((cost - tokens) * 1000) / refillPerSecond) };
    },
  };
}
