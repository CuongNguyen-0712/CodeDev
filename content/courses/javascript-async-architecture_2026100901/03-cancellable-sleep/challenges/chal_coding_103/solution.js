/**
 * Reference solution (never shipped to learners).
 */
function sleep(ms, { signal, timers = globalThis } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }

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
