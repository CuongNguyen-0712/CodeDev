/**
 * Reference solution (never shipped to learners).
 */
async function retry(fn, options = {}) {
  const {
    maxAttempts = 3,
    baseMs = 100,
    maxDelayMs = 10_000,
    random = Math.random,
    timers = { setTimeout: (cb, ms) => setTimeout(cb, ms), clearTimeout: (id) => clearTimeout(id) },
    signal,
    shouldRetry = isRetryable,
  } = options;

  for (let attempt = 1; ; attempt++) {
    if (signal?.aborted) throw signal.reason;
    try {
      return await fn({ attempt, signal });
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      if (attempt >= maxAttempts || !shouldRetry(error)) throw error;
      const delayMs = typeof error?.retryAfterMs === "number"
        ? error.retryAfterMs
        : Math.floor(random() * Math.min(maxDelayMs, baseMs * 2 ** (attempt - 1)));
      await sleep(delayMs, signal, timers);
    }
  }
}

function sleep(ms, signal, timers) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const onAbort = () => {
      timers.clearTimeout(id);
      reject(signal.reason);
    };
    const id = timers.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function isRetryable(error) {
  if (error?.name === "AbortError") return false;
  if (typeof error?.status === "number") {
    return error.status >= 500 || error.status === 408 || error.status === 429;
  }
  return true;
}
