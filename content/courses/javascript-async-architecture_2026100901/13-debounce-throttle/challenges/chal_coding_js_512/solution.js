/**
 * Reference solution (never shipped to learners).
 */
function debounce(fn, waitMs, options = {}, timers) {
  const leading = options.leading === true;
  const trailing = options.trailing !== false;
  const maxWait = typeof options.maxWait === "number" ? Math.max(options.maxWait, waitMs) : null;

  let timerId = null;     // non-null while a burst is active
  let pendingArgs = null; // args of the latest call that has not been invoked yet
  let lastCallTime = 0;
  let anchorTime = 0;     // burst start or last invocation (for maxWait)

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

  function schedule(time) {
    let due = lastCallTime + waitMs;
    if (maxWait !== null) due = Math.min(due, anchorTime + maxWait);
    timerId = timers.setTimeout(onTimer, Math.max(0, due - time));
  }

  function onTimer() {
    const time = timers.now();
    timerId = null;
    if (time >= lastCallTime + waitMs) {
      // Quiet period over: the burst ends.
      if (trailing && pendingArgs) invoke(time);
      pendingArgs = null;
      return;
    }
    // maxWait reached in the middle of the burst.
    if (pendingArgs) invoke(time);
    else anchorTime = time;
    schedule(time);
  }

  function debounced(...args) {
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
  }

  debounced.cancel = function cancel() {
    endBurst();
  };

  debounced.flush = function flush() {
    if (timerId === null) return;
    const time = timers.now();
    if (trailing && pendingArgs) invoke(time);
    endBurst();
  };

  return debounced;
}
