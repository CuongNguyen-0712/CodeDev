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

  // @piece state: Burst state: timer, latest arguments, times
  const maxWait = typeof options.maxWait === "number" ? Math.max(options.maxWait, waitMs) : null;
  let timerId = null;     // non-null while a burst is active
  let pendingArgs = null; // args of the latest call that has not been invoked yet
  let lastCallTime = 0;
  let anchorTime = 0;     // burst start or last invocation (for maxWait)
  // @end

  // @piece invoke-and-end: Invoke fn, and end a burst
  function invoke(time) {
    const args = pendingArgs;
    pendingArgs = null;
    anchorTime = time;
    fn(...args);
  }

  function endBurst() {
    if (timerId !== null) timers.clearTimeout(timerId);
    timerId = null;
    pendingArgs = null;
  }
  // @end

  // @piece schedule: Set the timer for the next due time
  function schedule(time) {
    let due = lastCallTime + waitMs;
    if (maxWait !== null) due = Math.min(due, anchorTime + maxWait);
    timerId = timers.setTimeout(onTimer, Math.max(0, due - time));
  }
  // @end

  // @piece on-timer: When the timer fires
  function onTimer() {
    const time = timers.now();
    timerId = null;
    if (time >= lastCallTime + waitMs) {
      if (trailing && pendingArgs) invoke(time);
      pendingArgs = null;
      return;
    }
    if (pendingArgs) invoke(time);
    else anchorTime = time;
    schedule(time);
  }
  // @end

  function debounced(...args) {
    // @piece call: Start or extend the burst on every call
    const time = timers.now();
    lastCallTime = time;
    pendingArgs = args;

    if (timerId === null) {
      anchorTime = time;
      if (leading) invoke(time);
    } else {
      timers.clearTimeout(timerId);
    }
    schedule(time);
    // @end
  }

  debounced.cancel = function cancel() {
    // @piece cancel: Drop the pending call
    endBurst();
    // @end
  };

  debounced.flush = function flush() {
    // @piece flush: Run the pending call now
    if (timerId === null) return;
    const time = timers.now();
    if (trailing && pendingArgs) invoke(time);
    endBurst();
    // @end
  };

  return debounced;
}
