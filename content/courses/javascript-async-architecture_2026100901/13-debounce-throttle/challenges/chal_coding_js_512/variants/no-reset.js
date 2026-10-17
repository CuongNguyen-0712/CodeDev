// Wrong variant: the timer is started once per burst and never pushed back,
// so the "trailing" call fires waitMs after the FIRST call (that is throttling, not debouncing).
function debounce(fn, waitMs, options = {}, timers) {
  const trailing = options.trailing !== false;
  const leading = options.leading === true;
  let timerId = null;
  let pendingArgs = null;

  function debounced(...args) {
    pendingArgs = args;
    if (timerId !== null) return;
    if (leading) { fn(...pendingArgs); pendingArgs = null; }
    timerId = timers.setTimeout(() => {
      timerId = null;
      if (trailing && pendingArgs) fn(...pendingArgs);
      pendingArgs = null;
    }, waitMs);
  }
  debounced.cancel = () => { if (timerId !== null) timers.clearTimeout(timerId); timerId = null; pendingArgs = null; };
  debounced.flush = () => { if (timerId === null) return; timers.clearTimeout(timerId); timerId = null; if (trailing && pendingArgs) fn(...pendingArgs); pendingArgs = null; };
  return debounced;
}
