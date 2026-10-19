// Wrong variant: rejects on abort, but leaves the timer running - after "cancel" the callback
// (and everything its closure holds) stays alive until the full delay has passed.
function sleep(ms, { signal, timers = globalThis } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const onAbort = () => reject(signal.reason);
    timers.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
