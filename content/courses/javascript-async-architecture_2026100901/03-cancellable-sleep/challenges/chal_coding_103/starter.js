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
  // BUG (on purpose): ignores the signal - the timer keeps running after the user leaves.
  return new Promise((resolve) => {
    timers.setTimeout(resolve, ms);
  });
}
