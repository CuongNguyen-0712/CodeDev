// Wrong variant: the timer is reset correctly, but the arguments of the FIRST call of the burst
// are kept - the autosave stores "h" instead of "hello".
function debounce(fn, waitMs, options = {}, timers) {
  const trailing = options.trailing !== false;
  const leading = options.leading === true;
  let timerId = null;
  let pendingArgs = null;
  let invokedLeading = false;

  function debounced(...args) {
    if (timerId === null) {
      pendingArgs = args;
      invokedLeading = false;
      if (leading) { fn(...args); invokedLeading = true; }
    } else {
      timers.clearTimeout(timerId);
    }
    timerId = timers.setTimeout(() => {
      timerId = null;
      if (trailing && pendingArgs && !invokedLeading) fn(...pendingArgs);
      pendingArgs = null;
    }, waitMs);
  }
  debounced.cancel = () => { if (timerId !== null) timers.clearTimeout(timerId); timerId = null; pendingArgs = null; };
  debounced.flush = () => { if (timerId === null) return; timers.clearTimeout(timerId); timerId = null; if (trailing && pendingArgs) fn(...pendingArgs); pendingArgs = null; };
  return debounced;
}
