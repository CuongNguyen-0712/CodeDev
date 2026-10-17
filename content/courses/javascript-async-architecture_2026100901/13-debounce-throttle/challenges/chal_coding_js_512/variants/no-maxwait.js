// Wrong variant: a correct leading/trailing debounce that ignores maxWait -
// a user who never stops typing is never autosaved.
function debounce(fn, waitMs, options = {}, timers) {
  const trailing = options.trailing !== false;
  const leading = options.leading === true;
  let timerId = null;
  let pendingArgs = null;

  function debounced(...args) {
    pendingArgs = args;
    if (timerId === null) {
      if (leading) { fn(...pendingArgs); pendingArgs = null; }
    } else {
      timers.clearTimeout(timerId);
    }
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
