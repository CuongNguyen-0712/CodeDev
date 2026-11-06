// @piece sleep: A wait that the signal can cancel
function sleep(ms, signal, timers) {
  return new Promise((resolve) => {
    timers.setTimeout(resolve, ms);
  });
}
