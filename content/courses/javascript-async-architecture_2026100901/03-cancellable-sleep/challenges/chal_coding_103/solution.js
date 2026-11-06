/**
 * Waits `ms` milliseconds - unless the optional AbortSignal aborts first.
 *
 * Requirements:
 *   - Resolve (with undefined) after `ms` ms.
 *   - If `signal` is already aborted when sleep() is called, reject at once with signal.reason
 *     and do not start a timer.
 *   - If `signal` aborts while sleeping, clear the timer and reject with signal.reason
 *     (the exact value: an AbortError DOMException by default, or whatever was passed to
 *     controller.abort(reason)).
 *   - When the sleep resolves normally, remove its "abort" listener, so a long-lived signal
 *     shared by many sleeps (a polling loop) does not accumulate listeners.
 *   - Without a signal, behave like a plain promise-based sleep.
 *
 * Use the injected timers for the timeout (the tests control the clock):
 *   timers.setTimeout(callback, ms) -> id, timers.clearTimeout(id)
 * In the app, timers defaults to globalThis.
 *
 * @param {number} ms
 * @param {{ signal?: AbortSignal, timers?: { setTimeout: Function, clearTimeout: Function } }} [options]
 * @returns {Promise<void>}
 */
function sleep(ms, { signal, timers = globalThis } = {}) {
  return new Promise((resolve, reject) => {
    // @piece already-aborted: Give up at once if the signal is already aborted
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    // @end

    // @piece on-abort: What happens when the signal aborts mid-sleep
    const onAbort = () => {
      timers.clearTimeout(id);
      reject(signal.reason);
    };
    // @end

    // @piece start-timer: Start the timer and clean up when it fires
    const id = timers.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    // @end

    // @piece listen: Listen for the abort
    signal?.addEventListener("abort", onAbort, { once: true });
    // @end
  });
}
