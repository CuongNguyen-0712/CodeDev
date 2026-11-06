// @piece schedule: Set the timer for the next due time
function schedule(time) {
  timerId = timers.setTimeout(onTimer, Math.max(0, lastCallTime + waitMs - time));
}
