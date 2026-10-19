// Wrong variant: does not check signal.aborted first. The "abort" event has already fired and
// never fires again, so an already-cancelled sleep waits the full delay.
function sleep(ms, { signal, timers = globalThis } = {}) {
  return new Promise((resolve, reject) => {
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
