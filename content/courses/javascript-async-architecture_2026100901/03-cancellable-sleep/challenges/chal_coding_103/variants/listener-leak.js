// Wrong variant: never removes the abort listener after a normal resolve. A polling loop that
// shares one signal piles up one listener (and one closure) per iteration.
function sleep(ms, { signal, timers = globalThis } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const id = timers.setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      timers.clearTimeout(id);
      reject(signal.reason);
    }, { once: true });
  });
}
