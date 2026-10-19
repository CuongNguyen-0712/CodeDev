// Wrong variant: rejects with its own new error instead of signal.reason, so a custom reason
// ("navigated away") or a TimeoutError from AbortSignal.timeout() is lost.
function sleep(ms, { signal, timers = globalThis } = {}) {
  return new Promise((resolve, reject) => {
    const abortError = () => new DOMException("The operation was aborted.", "AbortError");
    if (signal?.aborted) return reject(abortError());
    const onAbort = () => {
      timers.clearTimeout(id);
      reject(abortError());
    };
    const id = timers.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
