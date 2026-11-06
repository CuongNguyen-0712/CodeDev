// @piece next-due: Pick the next timer that is due
function nextDue(until) {
  for (const timer of timers.values()) {
    if (timer.at <= until) return timer;
  }
  return null;
}
