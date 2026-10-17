/**
 * Debounce `fn`: collapse a burst of calls into as few invocations as the options allow.
 *
 * A "burst" starts with the first call and ends once `waitMs` pass without a new call.
 *
 * Options (all optional):
 *   - leading  (default false): invoke immediately on the first call of a burst.
 *   - trailing (default true):  when the burst ends, invoke with the arguments of the LAST call -
 *                               but only if that call has not been invoked yet.
 *   - maxWait  (default none):  during a long burst, never let more than `maxWait` ms pass since the
 *                               burst started / the last invocation without invoking the latest
 *                               pending arguments. (Treat a maxWait below waitMs as waitMs.)
 *                               If the quiet period and maxWait end at the same moment, it is the
 *                               end of the burst.
 *
 * The returned function also has:
 *   - cancel(): drop the pending call and end the burst. Nothing runs later.
 *   - flush():  if a trailing call is pending, run it right now and end the burst.
 *
 * Use ONLY the injected timers (the tests control the clock):
 *   timers.setTimeout(callback, ms) -> id, timers.clearTimeout(id), timers.now() -> current time in ms
 *
 * @template {(...args: any[]) => any} F
 * @param {F} fn
 * @param {number} waitMs
 * @param {{ leading?: boolean, trailing?: boolean, maxWait?: number }} [options]
 * @param {{ setTimeout(cb: () => void, ms: number): any, clearTimeout(id: any): void, now(): number }} timers
 * @returns {((...args: Parameters<F>) => void) & { cancel(): void, flush(): void }}
 */
function debounce(fn, waitMs, options = {}, timers) {
  const leading = options.leading === true;
  const trailing = options.trailing !== false;

  function debounced(...args) {
    // TODO: start or extend the burst, remember the latest arguments,
    //       invoke on the leading edge and/or schedule the trailing / maxWait invocation.
  }

  debounced.cancel = function cancel() {
    // TODO
  };

  debounced.flush = function flush() {
    // TODO
  };

  return debounced;
}
