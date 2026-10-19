// Wrong variant: backoff, jitter and cancellation are right, but every error except a
// cancellation is retried - including a declined card.
async function retry(fn, options = {}) {
  const {
    maxAttempts = 3, baseMs = 100, maxDelayMs = 10_000, random = Math.random,
    timers = { setTimeout: (cb, ms) => setTimeout(cb, ms), clearTimeout: (id) => clearTimeout(id) },
    signal,
  } = options;

  for (let attempt = 1; ; attempt++) {
    if (signal?.aborted) throw signal.reason;
    try {
      return await fn({ attempt, signal });
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      if (attempt >= maxAttempts) throw error;
      const delayMs = typeof error?.retryAfterMs === "number"
        ? error.retryAfterMs
        : Math.floor(random() * Math.min(maxDelayMs, baseMs * 2 ** (attempt - 1)));
      await new Promise((resolve, reject) => {
        const onAbort = () => { timers.clearTimeout(id); reject(signal.reason); };
        const id = timers.setTimeout(() => { signal?.removeEventListener("abort", onAbort); resolve(); }, delayMs);
        signal?.addEventListener("abort", onAbort, { once: true });
      });
    }
  }
}
